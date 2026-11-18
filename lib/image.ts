'use client';
/** Shrinks a screenshot in the browser: max 1400px wide, WebP, under 300 KB (tries lower quality until it fits). */
export async function compressToWebp(file: File, maxBytes = 300 * 1024): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error('Please choose an image file (PNG, JPG or WebP).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is too large (over 15 MB). Take a smaller screenshot.');
  const bmp = await createImageBitmap(file);
  let w = Math.min(1400, bmp.width); let h = Math.round((bmp.height * w) / bmp.width);
  for (let round = 0; round < 6; round++) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('Your browser cannot process images.');
    ctx.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/webp', q));
      if (!blob) throw new Error('Your browser cannot create WebP images.');
      if (blob.size <= maxBytes) return blob;
    }
    w = Math.round(w * 0.8); h = Math.round(h * 0.8);
  }
  throw new Error('Could not shrink the image under 300 KB. Try a smaller area.');
}
