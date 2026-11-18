export type CaptureMode = 'full' | 'visible';
export type Rect = { x: number; y: number; width: number; height: number };

export function captureRatio(rect: Rect, pixelRatio: number): number {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return pixelRatio;
  const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
  // Leave room for rounding output dimensions up to whole pixels.
  return Math.min(pixelRatio, 29_999 / width, 29_999 / height, Math.sqrt(79_900_000 / (width * height)));
}

export function captureRect(mode: CaptureMode, content: Rect, viewport: Rect, pixelRatio = 1): Rect {
  const rect = mode === 'full' ? { x: 0, y: 0, width: Math.ceil(content.width), height: Math.ceil(content.height) } : viewport;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    throw new Error('This page has no captureable area.');
  }
  // Bound decoded image memory for capture and editing.
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 || rect.width * pixelRatio > 30_000 || rect.height * pixelRatio > 30_000 || rect.width * rect.height * pixelRatio ** 2 > 80_000_000) {
    throw new Error('This page is too large for one image (30,000 px per side / 80 megapixels). Try Visible area.');
  }
  return rect;
}

export function cropRect(start: { x: number; y: number }, end: { x: number; y: number }, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width, Math.floor(Math.min(start.x, end.x))));
  const y = Math.max(0, Math.min(height, Math.floor(Math.min(start.y, end.y))));
  return { x, y, width: Math.max(0, Math.min(width, Math.ceil(Math.max(start.x, end.x))) - x), height: Math.max(0, Math.min(height, Math.ceil(Math.max(start.y, end.y))) - y) };
}

export function filename(title: string): string {
  return `${title.replace(/[<>:"/\\|?*]|\p{Cc}/gu, '').trim().slice(0, 100) || 'PageShot'}.png`;
}

export async function copyImage(blob: Blob) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadImage(blob: Blob, title: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename(title); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png'));
}
