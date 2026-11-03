// Minimal PNG decoder for running image tests in Node (browsers decode images
// themselves). Handles 8-bit, non-interlaced grayscale, RGB, palette, gray+alpha
// and RGBA, which covers screenshots and web exports. Returns ImageData-shaped
// { width, height, data }.

export async function decodePng(bytes) {
  const { inflateSync } = await import('node:zlib');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (pos < bytes.length) {
    const length = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const bitDepth = body[8];
      colorType = body[9];
      if (bitDepth !== 8 || body[12] !== 0) throw new Error('decodePng: only 8-bit non-interlaced PNGs');
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      pixels[y * stride + x] = v;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let rgba;
    if (colorType === 0) rgba = [pixels[s], pixels[s], pixels[s], 255];
    else if (colorType === 2) rgba = [pixels[s], pixels[s + 1], pixels[s + 2], 255];
    else if (colorType === 3) {
      const k = pixels[s];
      rgba = [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], transparency?.[k] ?? 255];
    } else if (colorType === 4) rgba = [pixels[s], pixels[s], pixels[s], pixels[s + 1]];
    else rgba = [pixels[s], pixels[s + 1], pixels[s + 2], pixels[s + 3]];
    data.set(rgba, i * 4);
  }
  return { width, height, data };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
