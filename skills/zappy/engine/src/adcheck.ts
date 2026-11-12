// The brand-ad playbook as rules (references/ad-playbook.md). Errors stop
// `zappy make` / `zappy render` for a promo; warnings are printed. Rules that
// need timing (hold times, CTA time) run once there is a recording.
import type { RenderConfig } from "./defaults";
import { promoSegmentsOf } from "./promo";
import { contrast, palette } from "./theme";
import type { Timeline } from "./record";
import type { Card, Spec, Step } from "./spec";

export const BRIEF_FIELDS = [
  "Objective", "Audience", "Single message", "Proof", "Tone",
  "Platform", "Length", "Call to action", "Success metric",
];
const MAX_WORDS = 7; // per headline or text card (playbook step 5)
const MIN_HOLD_MS = 1500; // and 1 s per 3 words
const CTA_MS = 2500; // the CTA stays up 2-3 s or more
const BRAND_BY_MS = 5000; // brand cues in the first 5 s
const MAX_SHOT_MS = 4000; // social shots run 1-3 s; hold longer only for a moment that earns it

const norm = (t: string) => t.replace(/[*“”"]/g, "").replace(/\s+/g, " ").replace(/[.,!?:;]+$/, "").trim().toLowerCase();
/** A field's value from the brief's table, or "". */
const field = (brief: string, name: string) =>
  brief.match(new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|]*?)\\s*\\|`, "i"))?.[1] ?? "";

/** Words a viewer reads: *stars* and emoji don't count. */
export const words = (t = "") =>
  t.replace(/[*“”"]/g, "").replace(/\p{Extended_Pictographic}/gu, "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Everything a card puts on screen, as lines a viewer reads. */
export function cardLines(c: Card): string[] {
  return [
    c.title ?? "", c.stat ? `${c.stat.value} ${c.stat.label ?? ""}` : "", c.quote?.text ?? "",
    ...(c.lines ?? []), ...(c.tiles ?? []).map((t) => t.title),
    ...(c.compare ? [c.compare.left, c.compare.right].flatMap((s) => [s.title, ...s.lines]) : []),
  ].filter(Boolean);
}
const holdFor = (n: number) => Math.max(MIN_HOLD_MS, (n / 3) * 1000);

export type Report = { errors: string[]; warnings: string[] };

export function checkAd(spec: Spec, brief: string | null, tl?: Timeline, render?: RenderConfig): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const at = (i: number) => `step ${i + 1}`;

  // 1. Brief first: one page, every field filled.
  if (brief == null) errors.push("no brief: write zappy/briefs/<feature>.md first (references/ad-playbook.md, step 1)");
  else {
    for (const f of BRIEF_FIELDS) if (!field(brief, f)) errors.push(`brief: "${f}" is missing or empty`);
    if (/\band\b/i.test(field(brief, "Single message")))
      errors.push(`brief: the single message has an "and" ("${field(brief, "Single message")}"): one message per ad`);
    const ok = brief.match(/^Approved by:\s*(.+)$/im)?.[1] ?? "";
    if (!ok.trim() || /</.test(ok)) errors.push("brief: not signed off: fill in \"Approved by: <name>, <date>\" once the user approves it");
    // Every line on screen comes from the approved script.
    const script = norm(brief);
    for (const [i, s] of spec.steps.entries()) {
      if (s.cut) continue;
      for (const t of [s.headline, s.card?.title, s.card?.stat?.label, s.card?.quote?.text])
        if (t && !script.includes(norm(t))) warnings.push(`${at(i)}: "${t}" isn't in the brief's script: update the script (and its sign-off) or the spec`);
    }
  }

  // Brand and its cues.
  if (!spec.brand) errors.push("brand: is required (logo bug from the first second, logo on the end card)");
  if (!spec.music) warnings.push("no music: pick a licensed track (and credit it in share.txt)");
  if (!spec.rights?.people) errors.push('rights.people: say who is on screen, e.g. "fictional demo data" or "releases on file"');
  if (spec.music && !spec.rights?.music) errors.push("rights.music: the track's licence and credit line");
  if (spec.brand?.font && !spec.rights?.font) errors.push("rights.font: the brand font's licence");
  if (spec.brand?.font && !spec.brand.fontFamily) errors.push("brand.fontFamily: the font file's family name");

  // Contrast: highlights are large text (3:1), text on the highlight colour is body text (4.5:1).
  if (render) {
    const p = palette(spec.theme, render);
    const hiBg = contrast(p.hi, p.bg);
    if (hiBg < 3) errors.push(`theme: the highlight colour ${p.hi} on ${p.bg} is ${hiBg.toFixed(1)}:1, needs 3:1`);
    const onHi = contrast(p.onHi, p.hi);
    if (onHi < 4.5) warnings.push(`theme: text on the highlight colour ${p.hi} is ${onHi.toFixed(1)}:1 (4.5:1 reads best)`);
  }

  // On-screen words: 3-7 per headline or text card.
  spec.steps.forEach((s, i) => {
    if (s.cut) return;
    if (s.headline) {
      const n = words(s.headline);
      if (n > MAX_WORDS) errors.push(`${at(i)}: headline is ${n} words, keep it to ${MAX_WORDS} ("${s.headline}")`);
      if (n < 3) warnings.push(`${at(i)}: headline is ${n} word${n === 1 ? "" : "s"}; 3-7 reads better ("${s.headline}")`);
    }
    if (s.card) {
      const c = s.card;
      for (const [label, t] of [["title", c.title], ["quote", c.quote?.text], ["stat label", c.stat?.label]] as const)
        if (t && words(t) > MAX_WORDS) errors.push(`${at(i)}: card ${label} is ${words(t)} words, keep it to ${MAX_WORDS} ("${t}")`);
      for (const t of c.tiles ?? []) if (words(t.title) > 5) errors.push(`${at(i)}: tile "${t.title}" is over 5 words`);
      if (c.compare) for (const side of [c.compare.left, c.compare.right]) {
        if (side.lines.length > 4) errors.push(`${at(i)}: compare "${side.title}" has ${side.lines.length} lines, keep it to 4`);
        for (const l of side.lines) if (words(l) > 5) errors.push(`${at(i)}: compare line "${l}" is over 5 words`);
      }
    }
  });

  // One CTA, on the last scene.
  const ctas = spec.steps.filter((s) => !s.cut && s.card?.cta);
  if (ctas.length !== 1) errors.push(`exactly one call to action (card.cta), found ${ctas.length}`);
  for (const s of ctas) if (!s.card!.cta!.url) errors.push(`the CTA "${s.card!.cta!.text}" has no url: ask the user for the link, never invent one`);

  if (!tl || !render) return { errors, warnings };

  // Timing, from the recording: the order and length viewers actually see.
  const segs = promoSegmentsOf(tl, render).filter((g) => g.outEnd > g.outStart);
  const step = (i: number): Step => spec.steps[i];
  const first = segs[0];
  if (first && step(first.i).card)
    errors.push("the ad opens on a card: open on motion and the result (mark a footage step hook: true)");
  if (spec.brand && segs.length && segs.filter((g) => g.outStart < BRAND_BY_MS).every((g) => step(g.i).card))
    errors.push("no brand cue in the first 5 s: show footage (it carries the logo bug) before then");
  const last = segs[segs.length - 1];
  if (last && !step(last.i).card?.cta) errors.push("the last scene isn't the CTA end card");
  if (last && step(last.i).card?.cta && last.outEnd - last.outStart < CTA_MS)
    errors.push(`the CTA is on screen ${((last.outEnd - last.outStart) / 1000).toFixed(1)} s, at least ${CTA_MS / 1000} s`);
  for (const g of segs) {
    const s = step(g.i);
    const n = s.card ? cardLines(s.card).reduce((a, l) => a + words(l), 0) : words(s.headline);
    const need = holdFor(n);
    const got = g.outEnd - g.outStart;
    if (!s.card && !s.narration && got > MAX_SHOT_MS)
      warnings.push(`${at(g.i)}: a ${(got / 1000).toFixed(1)} s shot: social shots run 1-3 s unless the moment earns it`);
    if (n && got < need) errors.push(`${at(g.i)}: on screen ${(got / 1000).toFixed(1)} s for ${n} words, needs ${(need / 1000).toFixed(1)} s (lower its speed)`);
  }
  const total = last ? last.outEnd / 1000 : 0;
  if (total > 60) warnings.push(`${total.toFixed(0)} s long: a brand ad is 6, 15, 30 or 60 s`);
  return { errors, warnings };
}
