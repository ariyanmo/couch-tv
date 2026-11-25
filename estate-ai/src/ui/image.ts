// Image helpers that run fully in the browser.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read the image'));
    img.src = src;
  });
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function imageSize(blob: Blob) {
  try {
    const img = await blobToImage(blob);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return { width: 0, height: 0 };
  }
}

function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.85): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Canvas export failed'))), type, q));
}

/** Downscale to at most `max` px on the long side. */
export async function resizeImage(blob: Blob, max: number, q = 0.85): Promise<Blob> {
  const img = await blobToImage(blob);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && blob.type === 'image/jpeg') return blob;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', q);
}

export async function makeThumb(blob: Blob) {
  try {
    return await resizeImage(blob, 360, 0.78);
  } catch {
    return blob;
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function svgToPngBlob(svg: string, width: number, height: number, background = '#ffffff'): Promise<Blob> {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToBlob(c, 'image/png');
}

export function safeFileName(s: string) {
  return s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'estate';
}
