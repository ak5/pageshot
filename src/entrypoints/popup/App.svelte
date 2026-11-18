<script lang="ts">
  import { onMount } from 'svelte';
  import { copyImage, downloadImage, type CaptureMode } from '../../lib/image';
  import { readCapture, writeCapture, type Shot } from '../../lib/store';

  let mode = $state<CaptureMode>('full');
  let tab = $state<chrome.tabs.Tab>();
  let shot = $state<Shot>();
  let preview = $state('');
  let busy = $state(false);
  let loading = $state(true);
  let status = $state('');
  let error = $state('');

  async function load() {
    const state = await readCapture();
    shot = state?.status === 'ready' ? state.shot : undefined;
    if (preview) URL.revokeObjectURL(preview);
    preview = shot ? URL.createObjectURL(shot.blob) : '';
    busy = state?.status === 'working' && Date.now() - state.startedAt < 90_000;
    if (state?.status === 'error') {
      error = state.error;
      await writeCapture();
    } else if (state?.status === 'working') {
      error = busy ? '' : 'Capture was interrupted. Please try again.';
    } else if (state?.status === 'ready') error = '';
  }

  onMount(() => {
    let timer: ReturnType<typeof setInterval>;
    void (async () => {
      try {
        [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await load();
        timer = setInterval(() => { if (busy) void load().catch((e) => { error = String(e); busy = false; }); }, 700);
      } catch (e) { error = e instanceof Error ? e.message : 'Could not load PageShot.'; }
      finally { loading = false; }
    })();
    return () => { clearInterval(timer); if (preview) URL.revokeObjectURL(preview); };
  });

  async function capture() {
    if (!tab?.id) return;
    busy = true; error = ''; status = '';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'capture', tabId: tab.id, mode });
      if (result?.error) throw new Error(result.error);
      status = 'Ready. Copy, download, or crop.';
    } catch (e) { error = e instanceof Error ? e.message : 'Capture failed.'; }
    finally {
      try { await load(); } catch { error ||= 'Could not load the screenshot.'; }
      busy = false;
    }
  }

  async function copy() {
    if (!shot) return;
    error = ''; status = '';
    try { await copyImage(shot.blob); status = 'Copied to clipboard.'; }
    catch { error = 'Clipboard access failed. Try Download instead.'; }
  }

  async function clear() {
    try { await writeCapture(); await load(); status = 'Screenshot cleared.'; error = ''; }
    catch { error = 'Could not clear the screenshot. Try again.'; }
  }

</script>

<main>
  <header><img src="/icons/icon48.png" alt="" width="38" height="38"><div><h1>PageShot</h1><small>Capture. Copy. Done.</small></div></header>
  <div class="capture-controls">
    <select aria-label="Capture area" bind:value={mode} disabled={busy || loading}><option value="full">Full page</option><option value="visible">Visible area</option></select>
    <button class="primary" onclick={capture} disabled={busy || loading || !tab?.id}>{busy ? 'Capturing…' : 'Take screenshot'}</button>
  </div>
  <p class="notice">Chrome shows a brief debugging banner during capture.</p>

  {#if shot && !busy}
    <section aria-label="Screenshot">
      <div class="preview"><img src={preview} alt="Last captured page"></div>
      <div class="shot-meta"><small>{shot.width.toLocaleString()} × {shot.height.toLocaleString()} px · {new Date(shot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><button class="text-button" onclick={clear}>Clear</button></div>
      <div class="row"><button class="primary" onclick={copy}>Copy</button><button onclick={() => shot && downloadImage(shot.blob, shot.title)}>Download</button><button onclick={() => chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') })}>Crop / edit</button></div>
    </section>
  {/if}
  <div class="status-row">
    <p class="status" role="status" class:error={!!error}>{error || status || (busy ? 'You can close this popup; reopen it for the result.' : '')}</p>
    {#if error}<button class="text-button" onclick={() => { error = ''; }}>Dismiss</button>{/if}
  </div>

  <footer>by <a href="https://alex.verver.is" target="_blank" rel="noopener noreferrer">ak5</a></footer>
</main>

<style>
  main { width: 360px; padding: 20px; }
  header { display: flex; gap: 10px; align-items: center; } header img { object-fit: contain; }
  .capture-controls { margin-top: 18px; display: grid; grid-template-columns: 125px 1fr; gap: 8px; }
  .capture-controls select { padding: 9px 28px 9px 10px; } .notice { margin-top: 9px; font-size: 11px; }
  section { margin-top: 16px; }
  .preview { height: 150px; border: 1px solid var(--line); border-radius: 9px; overflow: auto; background: var(--panel); }
  .preview img { display: block; width: 100%; }
  .shot-meta { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 10px; }
  .text-button { border: 0; padding: 0 2px; font-size: 11px; color: var(--muted); background: transparent; }
  .row button { padding: 9px 7px; font-size: 12px; white-space: nowrap; }
  .status-row { display: flex; gap: 8px; align-items: start; margin: 10px 0; }
  .status-row .status { flex: 1; }
  .status-row button { margin-top: 2px; }
  footer { padding-top: 14px; color: var(--muted); font-size: 11px; text-align: center; }
  footer a { color: inherit; text-underline-offset: 2px; }
  footer a:hover { color: var(--accent); }
</style>
