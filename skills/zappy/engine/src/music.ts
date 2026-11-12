// Background music level at output time `ms`: ducked under the voice (eased
// over rampMs either side of each line), faded in at the start and out at the end.
// No Node imports: the Remotion bundle reads this too.
export type Span = { start: number; end: number }; // output ms

export function musicVolume(
  ms: number,
  voice: Span[],
  totalMs: number,
  volume: number,
  rampMs = 300,
) {
  const gap = Math.min(
    Infinity,
    ...voice.map((v) => (ms < v.start ? v.start - ms : ms > v.end ? ms - v.end : 0)),
  );
  const duck = 0.35 + 0.65 * Math.min(1, gap / rampMs);
  const fade = Math.max(0, Math.min(1, ms / 500, (totalMs - ms) / 1500));
  return volume * duck * fade;
}
