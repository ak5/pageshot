type PageState = {
  x: number; y: number; style: HTMLStyleElement;
  fixed: { element: HTMLElement; value: string; priority: string }[];
  sticky: { element: HTMLElement; value: string; priority: string }[];
};

declare global { interface Window { __pageshotCapture?: PageState } }

// Serialized into an isolated world; keep this function independent of module values.
export async function capturePage(action: 'prepare' | 'move' | 'restore', x = 0, y = 0) {
  if (action === 'restore') {
    const state = window.__pageshotCapture;
    if (state) {
      for (const { element, value, priority } of state.fixed) {
        if (value) element.style.setProperty('visibility', value, priority); else element.style.removeProperty('visibility');
      }
      for (const { element, value, priority } of state.sticky) {
        if (value) element.style.setProperty('position', value, priority); else element.style.removeProperty('position');
      }
      window.scrollTo({ left: state.x, top: state.y, behavior: 'instant' });
      state.style.remove(); delete window.__pageshotCapture;
    }
    return;
  }
  if (action === 'prepare') {
    const style = document.createElement('style');
    style.textContent = 'html,body,* { scroll-behavior:auto!important; scroll-snap-type:none!important; overflow-anchor:none!important; } *,*::before,*::after { animation-play-state:paused!important; transition:none!important; }';
    const state: PageState = { x: window.scrollX, y: window.scrollY, style, fixed: [], sticky: [] };
    window.__pageshotCapture = state;
    for (const element of document.querySelectorAll('*')) {
      if (!(element instanceof HTMLElement)) continue;
      const position = getComputedStyle(element).position;
      if (position === 'fixed') state.fixed.push({ element, value: element.style.getPropertyValue('visibility'), priority: element.style.getPropertyPriority('visibility') });
      if (position === 'sticky') state.sticky.push({ element, value: element.style.getPropertyValue('position'), priority: element.style.getPropertyPriority('position') });
    }
    document.documentElement.append(style);
    for (const { element } of state.sticky) element.style.setProperty('position', 'static', 'important');
  }
  const state = window.__pageshotCapture;
  if (!state) throw new Error('The page changed during capture. Please try again.');
  for (const { element, value, priority } of state.fixed) {
    if (x !== 0 || y !== 0) element.style.setProperty('visibility', 'hidden', 'important');
    else if (value) element.style.setProperty('visibility', value, priority); else element.style.removeProperty('visibility');
  }
  window.scrollTo({ left: x, top: y, behavior: 'instant' });
  // Let scroll handlers, lazy images, and the compositor paint before taking the visible tile.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await Promise.all([...document.images].filter((img) => {
    const rect = img.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }).map((img) => Promise.race([img.decode().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1200))])));
  return { x: window.scrollX, y: window.scrollY, width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0), height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0) };
}
