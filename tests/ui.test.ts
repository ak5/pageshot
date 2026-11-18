import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import Popup from '../src/entrypoints/popup/App.svelte';
import Editor from '../src/entrypoints/editor/App.svelte';
import { readCapture, writeCapture, type CaptureState } from '../src/lib/store';

vi.mock('../src/lib/store', () => ({ readCapture: vi.fn(), writeCapture: vi.fn() }));
let app: ReturnType<typeof mount>;
let state: CaptureState | undefined;
const createTab = vi.fn();
const sendMessage = vi.fn();
const clipboardWrite = vi.fn();

beforeEach(() => {
  state = undefined;
  vi.mocked(readCapture).mockImplementation(async () => state);
  vi.mocked(writeCapture).mockImplementation(async (next) => { state = next; });
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn(async () => [{ id: 42, url: 'https://example.com/?x=1&y=2', title: 'My page' }]), create: createTab },
    runtime: { sendMessage, getURL: (path: string) => `chrome-extension://pageshot/${path}` },
  });
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: clipboardWrite } });
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
});

afterEach(async () => { if (app) await unmount(app); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

function button(name: string) {
  const result = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name);
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}
async function openPopup() {
  app = mount(Popup, { target: document.body });
  await vi.waitFor(() => expect(button('Take screenshot').disabled).toBe(false));
}
function ready(): CaptureState {
  return { status: 'ready', shot: { title: 'My page', width: 1000, height: 3000, capturedAt: Date.now(), blob: new Blob(['png'], { type: 'image/png' }) } };
}

describe('popup', () => {
  it('captures the selected mode and exposes copy, download, crop, and clear', async () => {
    sendMessage.mockImplementation(async () => { state = ready(); return { ok: true }; });
    await openPopup();
    const select = document.querySelector('select')!;
    select.value = 'visible'; select.dispatchEvent(new Event('change', { bubbles: true }));
    button('Take screenshot').click();
    await vi.waitFor(() => expect(button('Copy')).toBeTruthy());
    expect(sendMessage).toHaveBeenCalledWith({ type: 'capture', tabId: 42, mode: 'visible' });
    expect(button('Download')).toBeTruthy(); expect(button('Crop / edit')).toBeTruthy();
    button('Copy').click();
    await vi.waitFor(() => expect(clipboardWrite).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('Copied to clipboard.'));
    button('Clear').click();
    await vi.waitFor(() => expect(document.querySelector('section')).toBeNull());
  });
  it('shows a stored capture error once and allows dismissing it', async () => {
    state = { status: 'error', error: 'Old capture failed.' };
    await openPopup();
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Old capture failed.');
    expect(state).toBeUndefined();
    button('Dismiss').click();
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe(''));
    await unmount(app);
    await openPopup();
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
    expect(document.body.textContent).not.toContain('Your next screenshot');
  });
  it('clears a prior failure when a subsequent capture succeeds', async () => {
    state = { status: 'error', error: 'Old capture failed.' };
    sendMessage.mockImplementation(async () => { state = ready(); return { ok: true }; });
    await openPopup();
    button('Take screenshot').click();
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('Ready. Copy, download, or crop.'));
    expect(document.querySelector('.error')).toBeNull();
  });
  it('reopens a saved capture and reports clipboard failure', async () => {
    state = ready(); clipboardWrite.mockRejectedValueOnce(new Error('Denied'));
    await openPopup(); button('Copy').click();
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toContain('Try Download'));
  });
  it('shows capture failure and removes the replaced preview', async () => {
    state = ready();
    sendMessage.mockImplementation(async () => { state = { status: 'error', error: 'Close DevTools first.' }; return { error: state.error }; });
    await openPopup(); button('Take screenshot').click();
    await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('Close DevTools first.'));
    expect(document.querySelector('section')).toBeNull();
  });

});

it('the editor explains how to start when there is no capture', async () => {
  app = mount(Editor, { target: document.body });
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toContain('Take a screenshot'));
  expect(button('Download PNG').disabled).toBe(true);
});
