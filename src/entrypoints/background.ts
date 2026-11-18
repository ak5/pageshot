import { defineBackground } from 'wxt/utils/define-background';
import { captureTab } from '../lib/capture';
import { writeCapture } from '../lib/store';

export default defineBackground(() => {
  let capturing = false;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
    if (message?.type !== 'capture' || !Number.isInteger(message.tabId) || !['full', 'visible'].includes(message.mode)) return;
    if (capturing) { respond({ error: 'A capture is already running.' }); return; }
    capturing = true;
    void (async () => {
      try {
        await writeCapture({ status: 'working', startedAt: Date.now() });
        const shot = await captureTab(message.tabId, message.mode);
        await writeCapture({ status: 'ready', shot });
        respond({ ok: true });
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Capture failed. Try again.';
        await writeCapture({ status: 'error', error: text }).catch(() => {});
        respond({ error: text });
      } finally { capturing = false; }
    })();
    return true;
  });
});
