import { describe, expect, it, vi } from 'vitest';
import { captureTab } from '../src/lib/capture';
import { captureRatio, captureRect, cropRect, filename } from '../src/lib/image';

const viewport = { x: 0, y: 500, width: 1000, height: 800 };
const content = { x: 0, y: 0, width: 1000, height: 4000 };

describe('image boundaries', () => {
  it('captures full content or the scrolled viewport', () => {
    expect(captureRect('full', content, viewport)).toEqual(content);
    expect(captureRect('visible', content, viewport)).toEqual(viewport);
  });
  it('rejects excessive and invalid dimensions instead of returning a partial image', () => {
    for (const rect of [{ ...content, height: 30_001 }, { ...content, width: 10000, height: 10000 }, { ...content, height: NaN }, { ...content, width: 0 }]) {
      expect(() => captureRect('full', rect, viewport)).toThrow();
    }
  });
  it('applies limits to Retina output pixels', () => {
    expect(() => captureRect('full', { ...content, height: 20000 }, viewport, 2)).toThrow('too large');
    expect(captureRect('full', content, viewport, 2)).toEqual(content);
  });
  it('fits oversized output within both limits while preserving normal resolution', () => {
    expect(captureRatio(content, 2)).toBe(2);
    for (const ratio of [NaN, Infinity, 0, -1]) {
      expect(() => captureRect('full', content, viewport, captureRatio(content, ratio))).toThrow();
    }
    for (const rect of [{ ...content, height: 40000 }, { ...content, width: 10000, height: 10000 }]) {
      const ratio = captureRatio(rect, 2);
      expect(() => captureRect('full', rect, viewport, ratio)).not.toThrow();
      expect(Math.round(rect.width * ratio) * Math.round(rect.height * ratio)).toBeLessThanOrEqual(80_000_000);
    }
  });
  it('normalizes reverse drags and clips selections to the image', () => {
    expect(cropRect({ x: 90, y: 80 }, { x: -2, y: 200 }, 100, 100)).toEqual({ x: 0, y: 80, width: 90, height: 20 });
    expect(cropRect({ x: 110, y: 110 }, { x: 150, y: 150 }, 100, 100)).toEqual({ x: 100, y: 100, width: 0, height: 0 });
  });
  it('creates safe filenames', () => {
    expect(filename('a/b:c?')).toBe('abc.png');
    expect(filename('')).toBe('PageShot.png');

  });
});

function pngData(width: number, height: number) {
  const png = new Uint8Array(24); const header = new DataView(png.buffer);
  header.setUint32(16, width); header.setUint32(20, height);
  return btoa(String.fromCharCode(...png));
}

function mockChrome(failCapture = false, stalled = false, grownHeight?: number) {
  let height = 3500;
  let screenshots = 0;
  const drawImage = vi.fn();
  const close = vi.fn();
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage }; }
    async convertToBlob() { return (await fetch(`data:image/png;base64,${pngData(this.width, this.height)}`)).blob(); }
  });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1000, height: 800, close })));
  const sendCommand = vi.fn(async (_target, method, params?: { expression?: string }) => {
    if (method === 'Page.getLayoutMetrics') return { cssContentSize: { ...content, height }, cssVisualViewport: { pageX: 0, pageY: 500, clientWidth: 1000, clientHeight: 800, scale: 1 } };
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 9 };
    if (method === 'Runtime.evaluate') {
      if (params?.expression === 'window.devicePixelRatio') return { result: { value: 1 } };
      const action = params?.expression?.match(/\)\("(prepare|move|restore)",(\d+),(\d+)\)$/);
      if (!action) throw new Error('Unrecognized page operation');
      if (grownHeight && screenshots > 0 && Number(action[3]) >= 800) height = grownHeight;
      return { result: { value: { x: 0, y: stalled ? 0 : Math.min(Number(action[3]), height - 800), width: 1000, height } } };
    }
    screenshots++;
    if (failCapture) throw new Error('Capture interrupted');
    return { data: pngData(1000, 800) };
  });
  const api = { tabs: { get: vi.fn(async () => ({ url: 'https://example.com', title: 'Example' })) }, debugger: { attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), sendCommand } };
  vi.stubGlobal('chrome', api);
  return { ...api, drawImage, close };
}

describe('Chrome capture lifecycle', () => {
  it('scrolls, stitches visible tiles, and crops the overlapping bottom tile', async () => {
    const api = mockChrome();
    const shot = await captureTab(5, 'full');
    expect(shot.width).toBe(1000); expect(shot.height).toBe(3500);
    expect(shot.blob.type).toBe('image/png');
    const captures = api.debugger.sendCommand.mock.calls.filter(([, method]) => method === 'Page.captureScreenshot');
    expect(captures).toHaveLength(5);
    expect(captures.every(([, , params]) => (params as { captureBeyondViewport?: boolean }).captureBeyondViewport === false)).toBe(true);
    expect(api.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 500, 1000, 300, 0, 3200, 1000, 300);
    expect(api.close).toHaveBeenCalledTimes(5);
    const actions = api.debugger.sendCommand.mock.calls.filter(([, method]) => method === 'Runtime.evaluate').map(([, , params]) => params?.expression);
    expect(actions.at(-1)).toContain('("restore",0,0)');
    expect(api.debugger.detach).toHaveBeenCalledWith({ tabId: 5 });
  });
  it('restarts stitching at the top when lazy content grows during capture', async () => {
    const api = mockChrome(false, false, 4300);
    const shot = await captureTab(5, 'full');
    expect(shot.height).toBe(4300);
    expect(api.drawImage).toHaveBeenCalledTimes(7);
    expect(api.drawImage.mock.calls[1]!.slice(5, 7)).toEqual([0, 0]);
    expect(api.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 500, 1000, 300, 0, 4000, 1000, 300);
    expect(api.debugger.detach).toHaveBeenCalledOnce();
  });
  it('scales the entire image when lazy content exceeds the output limit', async () => {
    const api = mockChrome(false, false, 40000);
    const shot = await captureTab(5, 'full');
    expect(shot.height).toBe(29999);
    expect(shot.width).toBe(750);
    expect(api.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1000, 800, 0, 29399, 750, 600);
    expect(api.debugger.detach).toHaveBeenCalledOnce();
  });
  it('keeps visible-area capture to one tile without modifying the page', async () => {
    const api = mockChrome();
    const shot = await captureTab(5, 'visible');
    expect(shot.height).toBe(800);
    expect(api.debugger.sendCommand.mock.calls.some(([, method]) => method === 'Page.createIsolatedWorld')).toBe(false);
    expect(api.drawImage).not.toHaveBeenCalled();
  });
  it('restores the page and detaches when a tile fails', async () => {
    const api = mockChrome(true);
    await expect(captureTab(5, 'full')).rejects.toThrow('Capture interrupted');
    const actions = api.debugger.sendCommand.mock.calls.filter(([, method]) => method === 'Runtime.evaluate').map(([, , params]) => params?.expression);
    expect(actions.at(-1)).toContain('("restore",0,0)');
    expect(api.debugger.detach).toHaveBeenCalledOnce();
  });
  it('rejects a page that stops scrolling instead of repeating its viewport', async () => {
    const api = mockChrome(false, true);
    await expect(captureTab(5, 'full')).rejects.toThrow('could not be scrolled');
    expect(api.drawImage).toHaveBeenCalledOnce();
    expect(api.debugger.detach).toHaveBeenCalledOnce();
  });
  it.each(['full', 'visible'] as const)('captures local HTML files in %s mode when file access is enabled', async (mode) => {
    const api = mockChrome();
    api.tabs.get.mockResolvedValue({ url: 'file:///tmp/page.html', title: 'Local page' });
    vi.stubGlobal('chrome', { ...api, extension: { isAllowedFileSchemeAccess: vi.fn(async () => true) } });
    const shot = await captureTab(5, mode);
    expect(shot.title).toBe('Local page');
    expect(shot.height).toBe(mode === 'full' ? 3500 : 800);
    expect(api.debugger.detach).toHaveBeenCalledOnce();
  });
  it('explains how to enable local file access before attaching', async () => {
    const api = mockChrome();
    api.tabs.get.mockResolvedValue({ url: 'file:///tmp/page.html', title: 'Local page' });
    vi.stubGlobal('chrome', { ...api, extension: { isAllowedFileSchemeAccess: vi.fn(async () => false) } });
    await expect(captureTab(5, 'full')).rejects.toThrow('Allow access to file URLs');
    expect(api.debugger.attach).not.toHaveBeenCalled();
  });
  it.each(['chrome://settings', 'chrome-extension://other/page.html', 'https://chromewebstore.google.com/detail/example'])('rejects privileged page %s before attaching', async (url) => {
    const api = mockChrome();
    api.tabs.get.mockResolvedValue({ url, title: 'Restricted' });
    await expect(captureTab(5, 'full')).rejects.toThrow('regular website');
    expect(api.debugger.attach).not.toHaveBeenCalled();
  });
  it('rejects a navigation during capture and still detaches', async () => {
    const api = mockChrome();
    api.tabs.get.mockResolvedValueOnce({ url: 'https://example.com', title: 'Example' }).mockResolvedValueOnce({ url: 'https://example.com/next', title: 'Next' });
    await expect(captureTab(5, 'full')).rejects.toThrow('navigated');
    expect(api.debugger.detach).toHaveBeenCalledOnce();
  });
});
