<script lang="ts">
  import { onMount } from 'svelte';
  import { readCapture } from '../../lib/store';
  import { canvasBlob, copyImage, cropRect, downloadImage, type Rect } from '../../lib/image';

  let canvas = $state<HTMLCanvasElement>(undefined!);
  let original: ImageBitmap | undefined;
  let title = $state('PageShot');
  let ready = $state(false);
  let selection = $state<Rect>();
  let start: { x: number; y: number } | undefined;
  let tool = $state('crop');
  let status = $state('');
  let error = $state('');
  let busy = $state(false);
  let dimensions = $state('');

  onMount(() => {
    let disposed = false;
    void (async () => {
      try {
        const state = await readCapture();
        if (state?.status !== 'ready') throw new Error('Take a screenshot from the PageShot popup first.');
        const bitmap = await createImageBitmap(state.shot.blob);
        if (disposed) { bitmap.close(); return; }
        original = bitmap; title = state.shot.title; reset(); ready = true;
      } catch (e) { error = e instanceof Error ? e.message : 'Could not open the screenshot.'; }
    })();
    return () => { disposed = true; original?.close(); };
  });

  function reset() {
    if (!original) return;
    canvas.width = original.width; canvas.height = original.height;
    canvas.getContext('2d')!.drawImage(original, 0, 0);
    selection = undefined; dimensions = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} px`; status = 'Original restored.';
  }

  function point(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  }

  function pointerDown(event: PointerEvent) {
    if (!ready || busy || event.button !== 0) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    start = point(event); selection = undefined;
  }

  function pointerMove(event: PointerEvent) {
    if (start) selection = cropRect(start, point(event), canvas.width, canvas.height);
  }

  function pointerUp(event: PointerEvent) {
    if (!start) return;
    pointerMove(event); start = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function apply() {
    if (!selection || selection.width < 2 || selection.height < 2) return;
    const { x, y, width, height } = selection;
    const context = canvas.getContext('2d')!;
    if (tool === 'crop') {
      const pixels = context.getImageData(x, y, width, height);
      canvas.width = width; canvas.height = height;
      context.putImageData(pixels, 0, 0);
    } else {
      context.fillStyle = '#000'; context.fillRect(x, y, width, height);
    }
    selection = undefined; dimensions = `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} px`; status = tool === 'crop' ? 'Cropped.' : 'Selection covered in black.';
  }

  async function output(action: 'copy' | 'download') {
    busy = true; error = ''; status = '';
    try {
      const blob = await canvasBlob(canvas);
      if (action === 'copy') { await copyImage(blob); status = 'Copied to clipboard.'; }
      else { downloadImage(blob, title); status = 'Download started.'; }
    } catch (e) { error = e instanceof Error ? e.message : 'Could not export the image.'; }
    finally { busy = false; }
  }
</script>

<svelte:head><title>PageShot — Crop & edit</title></svelte:head>
<header>
  <div class="brand"><img src="/icons/icon48.png" alt="" width="36" height="36"><div><h1>PageShot</h1><small>Crop & edit</small></div></div>
  <div class="tools">
    <select aria-label="Editing tool" bind:value={tool} disabled={!ready || busy}><option value="crop">Crop</option><option value="cover">Cover in black</option></select>
    <button onclick={apply} disabled={!selection || selection.width < 2 || selection.height < 2 || busy}>Apply selection</button>
    <button onclick={reset} disabled={!ready || busy}>Reset</button>
  </div>
  <div class="tools"><button class="primary" onclick={() => output('copy')} disabled={!ready || busy}>Copy</button><button onclick={() => output('download')} disabled={!ready || busy}>Download PNG</button></div>
</header>
<main>
  <div class="instructions"><p>Drag over the image, then apply. Reset restores the original.</p><small>Keyboard alternative: enter a selection in pixels below.</small></div>
  {#if ready}
    <fieldset disabled={busy}>
      <legend>Selection <span class="muted">(pixels)</span></legend>
      {#each ['x', 'y', 'width', 'height'] as field (field)}
        <label>{field}<input aria-label={'Selection ' + field} type="number" min="0" value={selection?.[field as keyof Rect] ?? 0} oninput={(event) => {
          const rect = { x: selection?.x ?? 0, y: selection?.y ?? 0, width: selection?.width ?? 0, height: selection?.height ?? 0, [field]: Number(event.currentTarget.value) || 0 };
          selection = cropRect({ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, canvas.width, canvas.height);
        }}></label>
      {/each}
    </fieldset>
  {/if}
  <p class="status" role="status" class:error={!!error}>{error || status}</p>
  <div class="workspace">
    <div class="image-wrap">
      <canvas bind:this={canvas} aria-label="Screenshot to edit" onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => { start = undefined; selection = undefined; }}>Screenshot preview</canvas>
      {#if selection && ready}
        <div class="selection" style:left={`${selection.x / canvas.width * 100}%`} style:top={`${selection.y / canvas.height * 100}%`} style:width={`${selection.width / canvas.width * 100}%`} style:height={`${selection.height / canvas.height * 100}%`}></div>
      {/if}
    </div>
  </div>
  {#if ready}<p class="notice">{dimensions} · Edits apply to this tab. The popup keeps the original.</p>{/if}
</main>

<style>
  header { position: sticky; top: 0; z-index: 1; display: flex; gap: 20px; justify-content: space-between; align-items: center; flex-wrap: wrap; padding: 14px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .brand, .tools { display: flex; gap: 8px; align-items: center; } .brand { gap: 10px; }
  main { max-width: 1200px; padding: 20px 24px 40px; margin: auto; }
  .instructions p { font-size: 13px; } fieldset { margin: 12px 0; display: flex; gap: 12px; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 9px; }
  legend { font-size: 12px; } label { display: flex; align-items: center; gap: 6px; font-size: 12px; } input { width: 90px; padding: 5px; }
  .workspace { margin-top: 12px; padding: 20px; border: 1px solid var(--line); border-radius: 12px; background: repeating-conic-gradient(#8291a11c 0% 25%, transparent 0% 50%) 0 / 16px 16px; }
  .image-wrap { position: relative; width: fit-content; max-width: 100%; margin: auto; box-shadow: 0 5px 24px #0002; }
  canvas { display: block; max-width: 100%; height: auto; touch-action: none; cursor: crosshair; }
  .selection { position: absolute; pointer-events: none; border: 2px solid #247cf5; background: #247cf52c; }
  .notice { margin-top: 10px; }
  @media (max-width: 600px) { header { padding: 12px; gap: 12px; } main { padding: 16px 12px; } .workspace { padding: 8px; } .tools { flex-wrap: wrap; } }
</style>
