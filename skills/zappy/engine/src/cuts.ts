// Dead time between steps (a slow page load) is cut down to maxPauseMs, keeping
// the end of each gap so the page is seen appearing. Shared by the Remotion
// composition and the .srt writer, so video and subtitles stay in step.
import type { Timeline } from "./record";

export type Cut = { start: number; end: number }; // recording ms, removed

export function cutsOf(tl: Timeline, maxPauseMs: number): Cut[] {
  const cuts: Cut[] = [];
  tl.steps.forEach((s, i) => {
    const prevEnd = i === 0 ? tl.offsetMs : tl.steps[i - 1].endMs;
    if (s.startMs - prevEnd > maxPauseMs)
      cuts.push({ start: prevEnd, end: s.startMs - maxPauseMs });
  });
  return cuts;
}

const cutBefore = (cuts: Cut[], recMs: number) =>
  cuts.reduce((n, c) => n + (c.end <= recMs ? c.end - c.start : 0), 0);

/** Recording ms → output ms (from the start of the video). */
export const toOutput = (tl: Timeline, cuts: Cut[], recMs: number) =>
  recMs - tl.offsetMs - cutBefore(cuts, recMs);

/** Output ms → recording ms. */
export function toRecording(tl: Timeline, cuts: Cut[], outMs: number) {
  let rec = tl.offsetMs + outMs;
  for (const c of cuts) if (rec >= c.start) rec += c.end - c.start;
  return rec;
}

/** The kept stretches of the recording, in order. */
export function keptRanges(tl: Timeline, cuts: Cut[]) {
  const ranges: Cut[] = [];
  let from = tl.offsetMs;
  for (const c of cuts) {
    ranges.push({ start: from, end: c.start });
    from = c.end;
  }
  ranges.push({ start: from, end: tl.endMs });
  return ranges;
}

export const outputLength = (tl: Timeline, cuts: Cut[]) =>
  toOutput(tl, cuts, tl.endMs);
