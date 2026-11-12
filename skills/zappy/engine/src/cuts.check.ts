import assert from "node:assert";
import {
  cutsOf,
  keptRanges,
  outputLength,
  toOutput,
  toRecording,
} from "./cuts";
import type { Timeline } from "./record";
import type { Spec } from "./spec";
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
// A cut step takes no time and is never the one on screen.
const withCut = [{ startMs: 0, endMs: 1000, speed: 1 }, { startMs: 1000, endMs: 3000, speed: 1, cut: true }, { startMs: 3000, endMs: 4000, speed: 1 }] as never;
const cs = promoSegments(withCut, 0);
assert.equal(promoLength(cs), 2000);
assert.equal(promoAt(cs, 1000).seg.i, 2);
// A hook step plays first; the others keep their order.
const hooked = promoSegments([{ startMs: 0, endMs: 1000, speed: 1 }, { startMs: 1000, endMs: 2000, speed: 1 }, { startMs: 2000, endMs: 2500, speed: 1, hook: true }] as never, 0);
assert.deepEqual(hooked.map((s) => [s.i, s.outStart]), [[2, 0], [0, 500], [1, 1500]]);
// Two hooks: only the first opens; the other stays where it is (a Hook B opening).
const twoHooks = promoSegments([{ startMs: 0, endMs: 1000, speed: 1, hook: true }, { startMs: 1000, endMs: 2000, speed: 1 }, { startMs: 2000, endMs: 2500, speed: 1, hook: true }] as never, 0);
assert.deepEqual(twoHooks.map((s) => s.i), [0, 1, 2]);
console.log("promo ok");

// The ad playbook rules.
import { checkAd, words } from "./adcheck";
import { DEFAULTS } from "./defaults";
assert.equal(words("Hire on *real work*. 🎯"), 4);
const brief = "| Objective | Demo requests |\n| Audience | Recruiters |\n| Single message | X |\n| Proof | Y |\n| Tone | Calm |\n| Platform | LinkedIn |\n| Length | 20 s |\n| Call to action | Book a demo |\n| Success metric | Demos |\n\nScript: Your shortlist, ranked by real work. Hire on real work.\n\nApproved by: Meera, 12 Nov 2026";
const ad = {
  title: "t", startUrl: "/", style: "promo", brand: { name: "B" }, music: "m.mp3",
  rights: { people: "fictional demo data", music: "CC BY 4.0, credit X" },
  steps: [
    { action: "wait", headline: "Your shortlist, ranked by real work." },
    { action: "wait", card: { title: "Hire on real work.", cta: { text: "Book a demo", url: "x.com/demo" } } },
  ],
} as unknown as Spec;
assert.deepEqual(checkAd(ad, brief).errors, []);
assert.ok(checkAd(ad, null).errors[0].startsWith("no brief"));
assert.ok(checkAd(ad, brief.replace("| Tone | Calm |", "| Tone |  |")).errors.some((e) => e.includes('"Tone"')));
const long = { ...ad, steps: [{ action: "wait", headline: "one two three four five six seven eight" }, ad.steps[1]] } as unknown as Spec;
assert.ok(checkAd(long, brief).errors.some((e) => e.includes("8 words")));
const noUrl = { ...ad, steps: [ad.steps[0], { action: "wait", card: { title: "Hi there you.", cta: { text: "Go" } } }] } as unknown as Spec;
assert.ok(checkAd(noUrl, brief).errors.some((e) => e.includes("no url")));
// Timing: a card first and a 1 s headline both fail.
const tlAd = { steps: [{ startMs: 0, endMs: 1000, speed: 1 }, { startMs: 1000, endMs: 4000, speed: 1 }] } as unknown as Timeline;
const cardFirst = { ...ad, steps: [{ action: "wait", hook: true, card: { title: "A question for you?" } }, ...ad.steps] } as unknown as Spec;
const tl3 = { steps: [{ startMs: 0, endMs: 2000, speed: 1, hook: true }, { startMs: 2000, endMs: 3000, speed: 1 }, { startMs: 3000, endMs: 6000, speed: 1 }] } as unknown as Timeline;
const errs = checkAd(cardFirst, brief, tl3, { ...DEFAULTS.render, bpm: 0 }).errors;
assert.ok(errs.some((e) => e.includes("opens on a card")));
assert.ok(errs.some((e) => e.includes("step 2: on screen 1.0 s")));
assert.deepEqual(checkAd(ad, brief, tlAd, { ...DEFAULTS.render, bpm: 0 }).errors, ["step 1: on screen 1.0 s for 6 words, needs 2.0 s (lower its speed)"]);
// The rest of the brief and rights.
assert.ok(checkAd(ad, brief.replace("Approved by: Meera, 12 Nov 2026", "Approved by: <name>, <date>")).errors.some((e) => e.includes("not signed off")));
assert.ok(checkAd(ad, brief.replace("| Single message | X |", "| Single message | Fast and fair |")).errors.some((e) => e.includes('an "and"')));
assert.ok(checkAd({ ...ad, rights: undefined } as unknown as Spec, brief).errors.some((e) => e.startsWith("rights.people")));
assert.ok(checkAd({ ...ad, steps: [{ action: "wait", headline: "Something not in the script." }, ad.steps[1]] } as unknown as Spec, brief).warnings.some((w) => w.includes("isn't in the brief's script")));
// Contrast: a pale highlight on a white background fails.
const pale = { ...ad, theme: { bg: "#ffffff", accent: "#eeeeee", pop: "#dddddd" } } as unknown as Spec;
assert.ok(checkAd(pale, brief, tlAd, { bpm: 0, cardBg: "#000000", cardAccent: "#00ff00", pop: "" } as never).errors.some((e) => e.includes("highlight colour")));
console.log("adcheck ok");

// Versions: a cutdown keeps the hook and the CTA and fits the target.
import { cutdown, hookSteps, withHook } from "./versions";
import { promoLength as lenOf } from "./promo";
const cdSpec = {
  title: "t", startUrl: "/", style: "promo",
  steps: [
    { action: "wait", hook: true, headline: "One two three four." },
    { action: "wait", headline: "Five six seven eight." },
    { action: "wait", headline: "Nine ten eleven twelve." },
    { action: "wait", hook: true, headline: "Another opening line here." },
    { action: "wait", card: { title: "Hire on real work.", cta: { text: "Book a demo", url: "x" } } },
  ],
} as unknown as Spec;
const cdTl = () => ({ steps: [0, 1, 2, 3, 4].map((k) => ({ startMs: k * 4000, endMs: k * 4000 + 4000, speed: 1 })) }) as unknown as Timeline;
const r0 = { ...DEFAULTS.render, bpm: 0 };
const fifteen = cutdown(cdSpec, cdTl(), r0, 15000);
// 4 s scenes: hook + CTA = 8 s, one more fits in 15 s, a second would make 16.
assert.deepEqual(fifteen.steps.map((s) => !!s.cut), [false, false, true, true, false]);
const six = cutdown(cdSpec, cdTl(), r0, 6000);
const t6 = cdTl();
const { applySpec } = await import("./versions");
applySpec(t6, six);
const { promoSegmentsOf: segsOf } = await import("./promo");
assert.ok(lenOf(segsOf(t6, r0)) <= 6000 + 1, `6 s cut is ${lenOf(segsOf(t6, r0))} ms`);
assert.deepEqual(hookSteps(cdSpec), [0, 3]);
assert.deepEqual(withHook(cdSpec, 3).steps.map((s) => !!s.hook), [false, false, false, true, false]);
console.log("versions ok");
