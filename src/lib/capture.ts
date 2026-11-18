import { captureRatio, captureRect, type CaptureMode } from './image';
import { capturePage } from './capture-page';
import type { Shot } from './store';

type Metrics = {
  cssContentSize: { x: number; y: number; width: number; height: number };
  cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number; scale: number };
};
type PagePosition = { x: number; y: number; width: number; height: number };

export async function captureTab(tabId: number, mode: CaptureMode): Promise<Shot> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !/^(https?|file):\/\//.test(tab.url) || new URL(tab.url).hostname === 'chromewebstore.google.com') {
    throw new Error('Open a regular website or local HTML file first. Chrome pages and the Web Store cannot be captured.');
  }
  if (tab.url.startsWith('file:') && !await chrome.extension.isAllowedFileSchemeAccess()) {
    throw new Error('Enable "Allow access to file URLs" in PageShot’s Details at chrome://extensions/ and try again.');
  }
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3').catch(() => {
    throw new Error('Could not capture this tab. Close its DevTools and try again. Chrome may also restrict this page.');
  });
  let contextId: number | undefined;
  async function page(action: 'prepare' | 'move' | 'restore', x = 0, y = 0): Promise<PagePosition> {
    const response = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `(${capturePage.toString()})(${JSON.stringify(action)},${x},${y})`, contextId, awaitPromise: true, returnByValue: true,
    }) as { result: { value: PagePosition }; exceptionDetails?: unknown };
    if (response.exceptionDetails) throw new Error('The page changed or could not be scrolled. Please try again.');
    return response.result.value;
  }
  async function screenshot(): Promise<Blob> {
    const result = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    }) as { data: string };
    return (await fetch(`data:image/png;base64,${result.data}`)).blob();
  }
  try {
    const metrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics') as Metrics;
    const viewport = metrics.cssVisualViewport;
    const density = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', { expression: 'window.devicePixelRatio', returnByValue: true }) as { result: { value: number } };
    const ratio = density.result.value;
    if (viewport.scale !== 1) throw new Error('Reset pinch zoom before capturing this page.');
    captureRect(mode, metrics.cssContentSize, { x: viewport.pageX, y: viewport.pageY, width: viewport.clientWidth, height: viewport.clientHeight }, mode === 'full' ? captureRatio(metrics.cssContentSize, ratio) : ratio);
    let blob: Blob;
    if (mode === 'visible') blob = await screenshot();
    else {
      const tree = await chrome.debugger.sendCommand(target, 'Page.getFrameTree') as { frameTree: { frame: { id: string } } };
      const world = await chrome.debugger.sendCommand(target, 'Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'PageShot capture' }) as { executionContextId: number };
      contextId = world.executionContextId;
      const initial = await page('prepare');
      let outputRatio = captureRatio(initial, ratio);
      let bounds = captureRect('full', initial, initial, outputRatio);
      const started = Date.now();
      function checkDeadline() {
        if (Date.now() - started > 60_000) throw new Error('Capture took too long. Try Visible area on this page.');
      }
      // Load lazy sections before stitching so new content does not shift earlier tiles.
      for (let y = 0; y < bounds.height; y += viewport.clientHeight) {
        checkDeadline();
        const loaded = await page('move', 0, y);
        outputRatio = captureRatio(loaded, ratio);
        bounds = captureRect('full', loaded, loaded, outputRatio);
      }
      const canvas = new OffscreenCanvas(1, 1);
      capture: while (true) {
        checkDeadline();
        canvas.width = Math.round(bounds.width * outputRatio);
        canvas.height = Math.round(bounds.height * outputRatio);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not create the screenshot canvas.');
        for (let y = 0; y < bounds.height; y += viewport.clientHeight) {
          for (let x = 0; x < bounds.width; x += viewport.clientWidth) {
            checkDeadline();
            const position = await page('move', x, y);
            if (position.width !== bounds.width || position.height !== bounds.height) {
              outputRatio = captureRatio(position, ratio);
              bounds = captureRect('full', position, position, outputRatio);
              // Redraw from the top after layout changes; keeping old tiles would leave broken seams.
              continue capture;
            }
            const sourceX = x - position.x, sourceY = y - position.y;
            if (sourceX < -1 || sourceY < -1 || sourceX >= viewport.clientWidth || sourceY >= viewport.clientHeight) {
              throw new Error('This page could not be scrolled through completely.');
            }
            const tile = await createImageBitmap(await screenshot());
            try {
              const tileRatioX = tile.width / viewport.clientWidth, tileRatioY = tile.height / viewport.clientHeight;
              const width = Math.min(viewport.clientWidth - sourceX, bounds.width - x);
              const height = Math.min(viewport.clientHeight - sourceY, bounds.height - y);
              ctx.drawImage(tile, Math.round(sourceX * tileRatioX), Math.round(sourceY * tileRatioY), Math.round(width * tileRatioX), Math.round(height * tileRatioY), Math.round(x * outputRatio), Math.round(y * outputRatio), Math.round((x + width) * outputRatio) - Math.round(x * outputRatio), Math.round((y + height) * outputRatio) - Math.round(y * outputRatio));
            } finally { tile.close(); }
          }
        }
        blob = await canvas.convertToBlob({ type: 'image/png' });
        break;
      }
    }
    const dimensions = new DataView(await blob.slice(16, 24).arrayBuffer());
    const current = await chrome.tabs.get(tabId);
    if (current.url !== tab.url) throw new Error('The page navigated during capture. Try again when it finishes loading.');
    return { blob, title: tab.title || 'PageShot', width: dimensions.getUint32(0), height: dimensions.getUint32(4), capturedAt: Date.now() };
  } finally {
    try { if (contextId !== undefined) await page('restore'); }
    finally {
      // Chrome may already have detached if the tab closed or DevTools opened.
      await chrome.debugger.detach(target).catch(() => {});
    }
  }
}
