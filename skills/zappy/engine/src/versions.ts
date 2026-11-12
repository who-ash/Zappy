// Versions of one promo, as re-cuts of its recording (the playbook's step 11):
// cutdowns to a target length, hook variants, and the captions file each
// version ships with. Pure functions over the spec and timeline.
import type { RenderConfig } from "./defaults";
import { promoSegmentsOf } from "./promo";
import type { Timeline } from "./record";
import type { Card, Spec } from "./spec";
import { cardLines, words } from "./adcheck";

/** Puts the spec's presentation (cards, headlines, speed, cuts, layout…) onto the recording's steps. */
export function applySpec(tl: Timeline, spec: Spec) {
  tl.steps.forEach((t, i) => {
    const s = spec.steps[i];
    Object.assign(t, {
      zoom: s.zoom !== false && !!t.box,
      card: s.card ?? null,
      headline: s.headline ?? null,
      sticker: s.sticker ?? null,
      speed: Number(s.speed ?? 1),
      cut: !!s.cut,
      chips: s.chips,
      hook: !!s.hook,
      layout: s.layout,
      pad: s.pad,
      counter: s.counter,
    });
  });
}

const holdMs = (n: number) => Math.max(1500, (n / 3) * 1000);
const cardText = (c: Card) => c.title ?? c.quote?.text ?? (c.stat ? `${c.stat.value} ${c.stat.label ?? ""}` : "");

/**
 * A cutdown to about `targetMs`: keeps the opening (hook) and the CTA, then the
 * scenes in between in order while they fit. When even hook + CTA run long, the
 * CTA and then the hook are shortened, never below what the playbook needs to read.
 */
export function cutdown(spec: Spec, tl: Timeline, render: RenderConfig, targetMs: number): Spec {
  applySpec(tl, spec);
  const segs = promoSegmentsOf(tl, render).filter((g) => g.outEnd > g.outStart);
  const dur = (g: (typeof segs)[number]) => g.outEnd - g.outStart;
  const first = segs[0];
  const last = segs[segs.length - 1];
  const keep = new Set([first.i, last.i]);
  let budget = targetMs - dur(first) - dur(last);
  for (const g of segs.slice(1, -1))
    if (dur(g) <= budget) {
      keep.add(g.i);
      budget -= dur(g);
    }
  const out: Spec = { ...spec, steps: spec.steps.map((s, i) => (keep.has(i) || s.cut ? { ...s } : { ...s, cut: true })) };
  if (budget < 0) {
    // Shorten the CTA, then the hook, only as far as reading allows (and the CTA's 2.5 s).
    const cta = out.steps[last.i];
    const ctaNeed = Math.max(2500, holdMs(cta.card ? cardLines(cta.card).reduce((n, l) => n + words(l), 0) : 0));
    const ctaNow = dur(last);
    const ctaTo = Math.max(ctaNeed, ctaNow + budget);
    cta.speed = Number(cta.speed ?? 1) * (ctaNow / ctaTo);
    budget += ctaNow - ctaTo;
    if (budget < 0 && !out.steps[first.i].narration) {
      const hook = out.steps[first.i];
      const need = holdMs(hook.card ? cardLines(hook.card).reduce((n, l) => n + words(l), 0) : words(hook.headline));
      const now = dur(first);
      const to = Math.max(need, now + budget);
      hook.speed = Number(hook.speed ?? 1) * (now / to);
    }
  }
  return out;
}

/** The spec opening on hook step `i` instead (Hook B, C): the other hook steps play where they are. */
export function withHook(spec: Spec, i: number): Spec {
  return { ...spec, steps: spec.steps.map((s, j) => ({ ...s, hook: j === i })) };
}

/** The hook steps a spec offers, in order (the first is the hero's opening). */
export const hookSteps = (spec: Spec) => spec.steps.flatMap((s, i) => (s.hook && !s.cut ? [i] : []));

const srtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`;
};

/** Captions for a promo: each scene's spoken line, else its headline or card text. */
export function promoSrt(tl: Timeline, render: RenderConfig) {
  return promoSegmentsOf(tl, render)
    .filter((g) => g.outEnd > g.outStart)
    .flatMap((g) => {
      const s = tl.steps[g.i];
      const text = (s.audio && s.narration) || s.headline || (s.card ? [cardText(s.card), s.card.cta?.text].filter(Boolean).join(" · ") : "");
      return text ? [{ start: g.outStart, end: g.outEnd, text: text.replace(/\*/g, "") }] : [];
    })
    .map((c, n) => `${n + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}
