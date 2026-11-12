// Promo timing: each step's recorded stretch, sped up and (with a bpm) stretched
// to a whole number of beats, laid end to end. Gaps between steps (page loads)
// are dropped: a promo cuts hard. No Node imports: the Remotion bundle reads this.
import type { RenderConfig } from "./defaults";
import type { Timeline, TimelineStep } from "./record";

export type Seg = { i: number; recStart: number; recEnd: number; outStart: number; outEnd: number };

export function promoSegments(steps: TimelineStep[], bpm: number): Seg[] {
  const beat = bpm > 0 ? 60_000 / bpm : 0;
  let out = 0;
  return steps.map((s, i) => {
    let dur = (s.endMs - s.startMs) / (s.speed || 1);
    if (beat) dur = Math.max(1, Math.round(dur / beat)) * beat;
    const seg = { i, recStart: s.startMs, recEnd: s.endMs, outStart: out, outEnd: out + dur };
    out += dur;
    return seg;
  });
}

/** The segment playing at output ms, and the recording ms shown. */
export function promoAt(segs: Seg[], outMs: number) {
  const seg = segs.find((s) => outMs < s.outEnd) ?? segs[segs.length - 1];
  const p = Math.min(1, Math.max(0, (outMs - seg.outStart) / (seg.outEnd - seg.outStart)));
  return { seg, rec: seg.recStart + p * (seg.recEnd - seg.recStart) };
}

export const promoLength = (segs: Seg[]) => segs[segs.length - 1]?.outEnd ?? 0;

/** Output size: landscape is render.width × height; the others keep its height's scale. */
export function frameSize(tl: Timeline, render: RenderConfig) {
  const s = render.height / 1080;
  if (tl.style !== "promo" || !tl.format || tl.format === "landscape")
    return { width: render.width, height: render.height };
  const even = (n: number) => Math.round(n / 2) * 2;
  return tl.format === "vertical"
    ? { width: even(1080 * s), height: even(1920 * s) }
    : { width: even(1080 * s), height: even(1080 * s) };
}

/** A headline reads in about 0.3 s a word, plus time to land. */
export const headlineMs = (text: string) => 800 + 300 * text.split(/\s+/).length;
