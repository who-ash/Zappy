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
