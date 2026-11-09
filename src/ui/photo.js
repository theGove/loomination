// Photos from a phone are often 5–15 MB. Before upload they're redrawn as JPEG
// no larger than maxSide pixels on the long side, a few hundred KB, which is
// plenty for a project record and well under Teather's 10 MB file limit.

/** A Blob (image/jpeg) of `blob` scaled to fit maxSide × maxSide. */
export async function shrinkPhoto(blob, maxSide = 2000, quality = 0.85) {
  let bitmap;
  try {
    // Turn phone photos the right way up (EXIF orientation).
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("That file doesn't look like a picture this browser can read.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the photo smaller.'))), 'image/jpeg', quality);
  });
}

/** A full-size and a thumbnail version, ready for upload. */
export async function preparePhoto(blob) {
  const [full, thumb] = await Promise.all([shrinkPhoto(blob, 2000, 0.85), shrinkPhoto(blob, 360, 0.8)]);
  return { full, thumb };
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Image files from a drop or paste. */
export function imageFiles(dataTransfer) {
  return [...(dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
}
