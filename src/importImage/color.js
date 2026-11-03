// Shared pixel helpers for the image-import pipeline. Images are ImageData-shaped:
// { width, height, data: RGBA bytes }.

export function pixel(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

// "Redmean" weighted RGB distance: cheap, and much closer to perceived
// difference than plain RGB. Black to white is about 765.
export function colorDistance(a, b) {
  const rMean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}
