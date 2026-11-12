// The promo palette from a theme, shared by the Remotion composition (to draw)
// and the ad check (to test contrast). No Node imports: the bundle reads this.
import type { RenderConfig } from "./defaults";
import type { Timeline } from "./record";

/** Relative luminance of "#rrggbb", 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** ink: text on the background; hi: highlights and marks; onHi: text on hi. */
export type Palette = { bg: string; accent: string; hi: string; ink: string; onHi: string; light: boolean };

export function palette(theme: Timeline["theme"], render: RenderConfig): Palette {
  const accent = theme?.accent ?? render.cardAccent;
  const bg = theme?.bg ?? render.cardBg;
  const hi = theme?.pop || render.pop || accent;
  const light = luminance(bg) > 0.4;
  return { bg, accent, hi, light, ink: light ? "#0f1d1c" : "#ffffff", onHi: luminance(hi) > 0.35 ? "#0f1d1c" : "#ffffff" };
}
