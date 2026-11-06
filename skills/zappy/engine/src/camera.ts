// A drawn, clearly fictional avatar as Chrome's fake camera feed (one-frame
// Y4M, which Chrome loops), so selfie steps show a face-like picture rather
// than the test pattern or anyone real.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 640;
const H = 480;
type RGB = [number, number, number];
const hex = (h: string): RGB =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const inEllipse = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

const SHIRT = hex("#1f3a5f");
const NECK = hex("#b07a59");
const SKIN = hex("#c99272");
const HAIR = hex("#2b1d16");
const EYES = hex("#2a1a14");
const MOUTH = hex("#8a3b32");
const TOP = hex("#e3f1ef");
const BOTTOM = hex("#bcd9d5");

function colour(x: number, y: number): RGB {
  if (inEllipse(x, y, 292, 250, 7, 7) || inEllipse(x, y, 348, 250, 7, 7))
    return EYES;
  if (inEllipse(x, y, 320, 298, 20, 6) && y > 296) return MOUTH;
  if (inEllipse(x, y, 320, 252, 74, 86)) return SKIN;
  if (inEllipse(x, y, 320, 222, 88, 100) && y < 280) return HAIR;
  if (x > 293 && x < 347 && y > 300 && y < 390) return NECK;
  if (inEllipse(x, y, 320, 540, 200, 160)) return SHIRT;
  const t = y / H;
  return TOP.map((c, i) => c + (BOTTOM[i] - c) * t) as RGB;
}

/** Returns the path of the fake-camera file, drawing it on first use. */
export function fakeCamera(): string {
  const dir = join(import.meta.dirname, "..", ".cache");
  const file = join(dir, "camera.y4m");
  if (existsSync(file)) return file;
  const rgb = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // 2×2 supersampling smooths the edges.
      const acc = [0, 0, 0];
      for (const [dx, dy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const c = colour(x + dx, y + dy);
        for (let i = 0; i < 3; i++) acc[i] += c[i] / 4;
      }
      rgb.set(acc, (y * W + x) * 3);
    }
  // BT.601 full-range I420 (C420jpeg).
  const Y = Buffer.alloc(W * H);
  const U = Buffer.alloc((W * H) / 4);
  const V = Buffer.alloc((W * H) / 4);
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = rgb.subarray(i * 3, i * 3 + 3);
    Y[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      let r = 0,
        g = 0,
        b = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const j = ((y + dy) * W + x + dx) * 3;
        r += rgb[j] / 4;
        g += rgb[j + 1] / 4;
        b += rgb[j + 2] / 4;
      }
      const k = (y / 2) * (W / 2) + x / 2;
      U[k] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
      V[k] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
    }
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`),
      Y,
      U,
      V,
    ]),
  );
  return file;
}
