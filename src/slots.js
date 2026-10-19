/* Templates that show a picture inside the scene (a photo printed in a newspaper, say). For these, "Put my product in
   this ad" pastes the visitor's photo into that picture by code, so the photo is never redrawn by an AI model.

   Coordinates are in the 600x750 template image.
   quad: the four corners of the picture area, clockwise from top-left.
   over: shapes that sit in front of the picture (fingers) and are drawn back on top of the pasted photo.
   fill: the colour shown around the photo when its shape differs from the picture area. */

const SLOTS = {
  "editorial-headline": {
    quad: [[154, 353], [389, 333], [425, 536], [196, 558]],
    over: [
      [[391, 346], [392, 345], [396, 344], [396, 352], [392, 351]],
      [[373, 372], [375, 368], [381, 366], [394, 365], [411, 364], [431, 366], [431, 384], [411, 381], [392, 379], [377, 378], [373, 375]],
      [[377, 407], [380, 402], [392, 397], [404, 393], [414, 388], [433, 387], [433, 406], [410, 406], [392, 410], [380, 412], [377, 410]],
      [[389, 417], [393, 414], [410, 409], [433, 407], [433, 421], [411, 420], [394, 421], [389, 419]],
    ],
    fill: "#e4e0da",
  },
};

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// Solves for the 3x3 matrix that sends the unit square onto four points (projective mapping).
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/* Pastes the photo into the template's picture area and resolves to a JPEG data URL. The photo keeps its own shape
   (it is never cropped or stretched); anything left over in the picture area gets the quiet "fill" colour. */
async function pasteIntoSlot(templateSrc, photoSrc, slot, scale = 2) {
  const [tpl, photo] = await Promise.all([loadImg(templateSrc), loadImg(photoSrc)]);
  const W = Math.round(tpl.naturalWidth * scale), H = Math.round(tpl.naturalHeight * scale);
  const k = W / 600;
  const quad = slot.quad.map(([x, y]) => [x * k, y * k]);

  // The picture area's own proportions, from its edge lengths.
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const slotAspect = ((len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2) / ((len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2);
  const pa = photo.naturalWidth / photo.naturalHeight;
  const fw = pa < slotAspect ? pa / slotAspect : 1, fh = pa < slotAspect ? 1 : slotAspect / pa;
  const u0 = (1 - fw) / 2, v0 = (1 - fh) / 2;

  const inv = invert(squareToQuad(quad));
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const bx = Math.max(0, Math.floor(Math.min(...xs))), by = Math.max(0, Math.floor(Math.min(...ys)));
  const bw = Math.min(W, Math.ceil(Math.max(...xs))) - bx, bh = Math.min(H, Math.ceil(Math.max(...ys))) - by;

  // The photo at its full size, read back so each output pixel can be looked up in it.
  const pc = document.createElement("canvas");
  pc.width = photo.naturalWidth; pc.height = photo.naturalHeight;
  const pctx = pc.getContext("2d");
  pctx.drawImage(photo, 0, 0);
  const src = pctx.getImageData(0, 0, pc.width, pc.height).data;
  const sw = pc.width, sh = pc.height;

  const warp = document.createElement("canvas");
  warp.width = W; warp.height = H;
  const wctx = warp.getContext("2d");
  const out = wctx.createImageData(bw, bh);
  const o = out.data;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const px = x + bx + 0.5, py = y + by + 0.5;
      const w = inv[6] * px + inv[7] * py + inv[8];
      const u = (inv[0] * px + inv[1] * py + inv[2]) / w, v = (inv[3] * px + inv[4] * py + inv[5]) / w;
      const su = (u - u0) / fw, sv = (v - v0) / fh;
      if (su < 0 || su > 1 || sv < 0 || sv > 1) continue;     // outside the photo: left clear, the fill shows
      const fx = su * (sw - 1), fy = sv * (sh - 1);
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const ix1 = Math.min(ix + 1, sw - 1), iy1 = Math.min(iy + 1, sh - 1);
      const p00 = (iy * sw + ix) * 4, p10 = (iy * sw + ix1) * 4, p01 = (iy1 * sw + ix) * 4, p11 = (iy1 * sw + ix1) * 4;
      const q = (y * bw + x) * 4;
      for (let c = 0; c < 4; c++) {
        o[q + c] = (src[p00 + c] * (1 - tx) + src[p10 + c] * tx) * (1 - ty) + (src[p01 + c] * (1 - tx) + src[p11 + c] * tx) * ty;
      }
    }
  }
  wctx.putImageData(out, bx, by);

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tpl, 0, 0, W, H);

  const trace = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  ctx.save();
  trace(quad); ctx.clip();
  ctx.fillStyle = slot.fill; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(warp, 0, 0);
  // Whatever sits in front of the picture (fingers) goes back on top, still clipped to the picture area.
  (slot.over || []).forEach((shape) => {
    ctx.save();
    trace(shape.map(([x, y]) => [x * k, y * k])); ctx.clip();
    ctx.drawImage(tpl, 0, 0, W, H);
    ctx.restore();
  });
  ctx.restore();
  return cv.toDataURL("image/jpeg", 0.92);
}

export { SLOTS, pasteIntoSlot };
