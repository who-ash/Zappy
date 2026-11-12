import assert from "node:assert";
import {
  cutsOf,
  keptRanges,
  outputLength,
  toOutput,
  toRecording,
} from "./cuts";
import type { Timeline } from "./record";
// Run: npx tsx src/cuts.check.ts
const tl = {
  offsetMs: 1000,
  endMs: 20000,
  steps: [
    { startMs: 1000, endMs: 5000 },
    { startMs: 5500, endMs: 8000 },
    { startMs: 13000, endMs: 20000 },
  ],
} as unknown as Timeline;
const cuts = cutsOf(tl, 1500);
assert.deepEqual(cuts, [{ start: 8000, end: 11500 }]);
assert.equal(toOutput(tl, cuts, 13000), 13000 - 1000 - 3500);
assert.equal(toRecording(tl, cuts, toOutput(tl, cuts, 13000)), 13000);
assert.equal(toRecording(tl, cuts, toOutput(tl, cuts, 4000)), 4000);
assert.equal(outputLength(tl, cuts), 19000 - 3500);
assert.deepEqual(keptRanges(tl, cuts), [
  { start: 1000, end: 8000 },
  { start: 11500, end: 20000 },
]);
console.log("cuts ok");

// Music ducks under the voice and fades at both ends.
import { musicVolume } from "./music";
const v = [{ start: 2000, end: 4000 }];
assert.equal(musicVolume(3000, v, 10000, 1), 0.35); // under a line
assert.equal(musicVolume(6000, v, 10000, 1), 1); // between lines
assert.equal(musicVolume(0, v, 10000, 1), 0); // fade in
assert.equal(musicVolume(10000, v, 10000, 1), 0); // fade out
assert.equal(musicVolume(6000, [], 10000, 0.2), 0.2); // no voice
console.log("music ok");

// Promo segments: speed shortens, bpm snaps to whole beats, output is contiguous.
import { promoAt, promoLength, promoSegments } from "./promo";
const ps = [
  { startMs: 1000, endMs: 2000, speed: 1 },
  { startMs: 3000, endMs: 5000, speed: 2 },
] as unknown as Timeline["steps"];
const segs = promoSegments(ps, 0);
assert.deepEqual(segs.map((s) => [s.outStart, s.outEnd]), [[0, 1000], [1000, 2000]]);
assert.equal(promoAt(segs, 1500).rec, 4000); // halfway through step 2's recording
assert.equal(promoLength(promoSegments(ps, 120)), 2000); // 1000 ms = 2 beats each
assert.equal(promoLength(promoSegments([{ startMs: 0, endMs: 700, speed: 1 }] as never, 120)), 500);
console.log("promo ok");
