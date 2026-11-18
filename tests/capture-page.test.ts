import { afterEach, expect, it, vi } from 'vitest';
import { capturePage } from '../src/lib/capture-page';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; delete window.__pageshotCapture; document.querySelectorAll('style').forEach((style) => style.remove()); });

it('hides fixed elements after the first tile, disables stickiness, and restores exact inline styles and scroll', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('scrollX', 10); vi.stubGlobal('scrollY', 350);
  window.scrollTo = vi.fn();
  document.body.innerHTML = '<header style="position:fixed;visibility:visible!important">Header</header><nav style="position:sticky!important">Navigation</nav><main>Content</main>';
  const header = document.querySelector('header')!, nav = document.querySelector('nav')!;
  const prepare = capturePage('prepare'); await vi.runAllTimersAsync(); await prepare;
  expect(nav.style.position).toBe('static');
  expect(header.style.visibility).toBe('visible');
  const move = capturePage('move', 0, 800); await vi.runAllTimersAsync(); await move;
  expect(header.style.visibility).toBe('hidden');
  await capturePage('restore');
  expect(header.style.visibility).toBe('visible');
  expect(header.style.getPropertyPriority('visibility')).toBe('important');
  expect(nav.style.position).toBe('sticky');
  expect(nav.style.getPropertyPriority('position')).toBe('important');
  expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 10, top: 350, behavior: 'instant' });
  expect(window.__pageshotCapture).toBeUndefined();
  expect(document.querySelector('style')).toBeNull();
});

it('restoration is safe if preparation did not run', async () => {
  await expect(capturePage('restore')).resolves.toBeUndefined();
});
