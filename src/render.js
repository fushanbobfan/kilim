// Pixel layers as RGBA buffers. Undecided cells show the weighted mean colour
// of every pattern still possible there, so the picture comes into focus as
// cells collapse.

export const CONTRADICTION_RGB = [255, 0, 170];

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function renderBitmap(bitmap, out) {
  const rgb = bitmap.palette.map(hexToRgb);
  for (let i = 0; i < bitmap.pixels.length; i++) {
    const c = rgb[bitmap.pixels[i]];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function renderWave(model, palette, out) {
  const rgb = palette.map(hexToRgb);
  const { W, H, T, wave, weights, patterns } = model;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { cell, offset } = model.sourceOf(x, y);
      let r = 0;
      let g = 0;
      let b = 0;
      let sw = 0;
      const base = cell * T;
      for (let t = 0; t < T; t++) {
        if (!wave[base + t]) continue;
        const c = rgb[patterns[t][offset]];
        const w = weights[t];
        r += c[0] * w;
        g += c[1] * w;
        b += c[2] * w;
        sw += w;
      }
      const o = (x + y * W) * 4;
      if (sw > 0) {
        out[o] = r / sw;
        out[o + 1] = g / sw;
        out[o + 2] = b / sw;
      } else {
        [out[o], out[o + 1], out[o + 2]] = CONTRADICTION_RGB;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

// Remaining entropy as a dark-to-bright ramp; decided cells are dark.
export function renderEntropy(model, out) {
  const { W, H, startingEntropy } = model;
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const { cell } = model.sourceOf(x, (i - x) / W);
    const o = i * 4;
    if (model.sumsOfOnes[cell] === 0) {
      [out[o], out[o + 1], out[o + 2]] = CONTRADICTION_RGB;
    } else {
      const v = startingEntropy > 0 ? Math.min(1, model.entropies[cell] / startingEntropy) : 0;
      out[o] = 20 + 235 * v * v;
      out[o + 1] = 24 + 200 * v;
      out[o + 2] = 40 + 120 * Math.sqrt(v);
    }
    out[o + 3] = 255;
  }
  return out;
}
