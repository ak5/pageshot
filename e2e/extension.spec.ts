import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let context: BrowserContext;
let worker: Worker;
let extensionId: string;
let profile: string;
const browserErrors: string[] = [];

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'pageshot-e2e-'));
  const extension = join(profile, 'extension');
  await cp(resolve('.output/chrome-mv3'), extension, { recursive: true });
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // A directly opened popup tab has no toolbar-granted activeTab access; grant only the synthetic fixture origin.
  manifest.host_permissions = ['https://pageshot.test/*'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(join(profile, 'profile'), {
    channel: 'chromium', headless: true,
    executablePath: process.env.CHROME_TEST_EXECUTABLE || undefined,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1,
  });
  await context.route('https://pageshot.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><title>A tall test page</title><style>*{box-sizing:border-box}body{margin:0}section{height:1000px}header{position:fixed;top:0;background:#fff;height:50px;width:100%}</style></head><body><header>One fixed header</header><section style="background:#ff0000">Top</section><section style="background:#00ff00">Middle</section><section style="background:#0000ff">Bottom</section></body></html>` }));
  context.on('page', (page) => page.on('pageerror', (error) => browserErrors.push(error.message)));
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).hostname;
});

test.afterAll(async () => { await context?.close(); if (profile) await rm(profile, { recursive: true, force: true }); });

test('full page capture, popup recovery, PNG export, crop, cover, and reset', async () => {
  const target = await context.newPage(); await target.goto('https://pageshot.test/tall');
  await target.evaluate(() => scrollTo(0, 500));
  const popup = await context.newPage();
  await target.bringToFront();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('button', { name: 'Take screenshot' })).toBeEnabled();
  await popup.getByRole('button', { name: 'Take screenshot' }).click();
  await expect(popup.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  await expect(popup.getByText('3,000 px', { exact: false })).toBeVisible();
  expect(await target.evaluate(() => scrollY)).toBe(500);
  expect(await worker.evaluate(async () => (await chrome.debugger.getTargets()).filter((t) => t.attached && t.url?.includes('pageshot.test')).length)).toBe(0);

  const pixels = await popup.locator('.preview img').evaluate(async (node) => {
    const img = node as HTMLImageElement; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return { width: img.naturalWidth, height: img.naturalHeight, middle: [...ctx.getImageData(100, 1500, 1, 1).data], bottom: [...ctx.getImageData(100, 2900, 1, 1).data] };
  });
  expect(pixels).toEqual({ width: 1000, height: 3000, middle: [0, 255, 0, 255], bottom: [0, 0, 255, 255] });
  await popup.screenshot({ path: 'test-results/popup.png' });
  const downloadEvent = popup.waitForEvent('download');
  await popup.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toBe('A tall test page.png');

  // Verify the clipboard action without replacing the user's system clipboard.
  await popup.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: ClipboardItem[]) => { const blob = await items[0]!.getType('image/png'); if (blob.size === 0) throw new Error('Empty clipboard image'); } } }); });
  await popup.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(popup.getByRole('status')).toHaveText('Copied to clipboard.');
  await popup.reload(); await expect(popup.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();

  const editorEvent = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Crop / edit' }).click();
  const editor = await editorEvent;
  await expect(editor.getByLabel('Editing tool')).toBeEnabled();
  await editor.getByLabel('Selection x', { exact: true }).fill('20');
  await editor.getByLabel('Selection y', { exact: true }).fill('1100');
  await editor.getByLabel('Selection width', { exact: true }).fill('300');
  await editor.getByLabel('Selection height', { exact: true }).fill('200');
  await editor.getByRole('button', { name: 'Apply selection' }).click();
  expect(await editor.locator('canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height, pixel: [...canvas.getContext('2d')!.getImageData(100, 100, 1, 1).data] }))).toEqual({ width: 300, height: 200, pixel: [0, 255, 0, 255] });
  await editor.getByLabel('Editing tool').selectOption('cover');
  await editor.getByLabel('Selection width', { exact: true }).fill('100');
  await editor.getByLabel('Selection height', { exact: true }).fill('100');
  await editor.getByRole('button', { name: 'Apply selection' }).click();
  expect(await editor.locator('canvas').evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(50, 50, 1, 1).data])).toEqual([0, 0, 0, 255]);
  const editedDownloadEvent = editor.waitForEvent('download');
  await editor.getByRole('button', { name: 'Download PNG' }).click();
  expect((await editedDownloadEvent).suggestedFilename()).toBe('A tall test page.png');
  await editor.screenshot({ path: 'test-results/editor.png' });
  await editor.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await editor.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.height)).toBe(3000);

  await editor.close(); await popup.close();
  const visiblePopup = await context.newPage(); await target.bringToFront();
  await visiblePopup.goto(`chrome-extension://${extensionId}/popup.html`);
  await visiblePopup.getByLabel('Capture area').selectOption('visible');
  await visiblePopup.getByRole('button', { name: 'Take screenshot' }).click();
  await expect(visiblePopup.getByText('800 px', { exact: false })).toBeVisible();
  await visiblePopup.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(visiblePopup.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0);
  await visiblePopup.emulateMedia({ colorScheme: 'dark' });
  await visiblePopup.screenshot({ path: 'test-results/popup-dark.png' });
  expect(browserErrors).toEqual([]);
});
