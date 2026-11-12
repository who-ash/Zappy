import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export type Selector =
  | { role: string; name?: string; exact?: boolean }
  | { label: string; exact?: boolean }
  | { placeholder: string; exact?: boolean }
  | { testId: string }
  | { text: string; exact?: boolean }
  | { css: string };

/** A full-screen title card shown over the recording for the step (a `wait`). */
export type Card = {
  eyebrow?: string;
  /** Required unless the card is a stat, compare or quote. */
  title?: string;
  lines?: string[];
  /** Lines show as ticks instead of bullets. */
  check?: boolean;
  /** Promo: a big emoji above the title. */
  emoji?: string;
  /** Promo: a bento grid of feature tiles instead of lines. */
  tiles?: { emoji: string; title: string; text?: string }[];
  /** Promo end card: the one call to action (and where it leads); shows the logo above. */
  cta?: { text: string; url?: string };
  /** Promo: one big number (counts up if it starts with digits) and a label. */
  stat?: { value: string; label?: string };
  /** Promo: two columns side by side, the left one muted (the old way), the right one highlighted. */
  compare?: { left: { title: string; lines: string[] }; right: { title: string; lines: string[] } };
  /** Promo: a quotation and who said or wrote it. */
  quote?: { text: string; by?: string };
};

/** Promo only: a drawn mark pinned to the step's element. */
export type Sticker = {
  kind: "arrow" | "circle" | "underline" | "badge" | "emoji";
  /** Label for arrow and badge; the emoji itself for emoji. */
  text?: string;
};
export const STICKERS = ["arrow", "circle", "underline", "badge", "emoji"];

export type Step = {
  action:
    | "goto"
    | "click"
    | "fill"
    | "select"
    | "hover"
    | "press"
    | "wait"
    | "scroll";
  selector?: Selector;
  value?: string | number;
  /** Spoken and captioned. Empty: a silent step, paced by record.silentMs. */
  narration?: string;
  /** This line in another voice (OpenAI voice or Sarvam speaker). */
  voice?: string;
  zoom?: boolean;
  card?: Card;
  /** Promo: big kinetic text above the footage; stays until a later headline ("" clears). */
  headline?: string;
  /** Promo: a mark pinned to this step's element. */
  sticker?: Sticker;
  /** Promo: play this step faster (2 = double speed). */
  speed?: number;
  /** Promo: emoji chips that float beside the app window, e.g. "⏱️ 90-minute task". */
  chips?: string[];
  /** Promo: "split" = headline beside a tight crop of the step's element; "tilt" = the same
   * crop on an angled screen; "full" = the crop fills the frame, headline as a caption. */
  layout?: "split" | "tilt" | "full";
  /** Promo: a small label above the headline, e.g. "01" for a numbered explainer. */
  counter?: string;
  /** Split: room around the element in the crop (1.5 = half its size again). */
  pad?: number;
  /** Promo: open the video on this step (the result first), then play the rest in order. The first
   * hook step opens the ad; more hook steps are alternative openings for `zappy versions` (Hook B, C). */
  hook?: boolean;
  /** Promo: run the step but leave it out of the video (setup clicks between the screens that matter). */
  cut?: boolean;
};

export type Spec = {
  title: string;
  startUrl: string;
  /** Saved session to record as (`zappy login <name> <url>`); omit to start signed out. */
  auth?: string;
  /** Shell command run in the project before recording (e.g. reset demo data). */
  before?: string;
  /** Voice for the whole video, over the config's (OpenAI voice or Sarvam speaker). */
  voice?: string;
  /** CSS selectors blurred on every page (emails, names, tokens), on top of record.blur. */
  blur?: string[];
  /** tutorial (default): voice-paced walkthrough. promo: short music-led ad. */
  style?: "tutorial" | "promo";
  /** Background music for this video (path relative to zappy/; "" = none), over render.music. */
  music?: string;
  /** Tempo of that music, over render.bpm (promo cuts snap to it). */
  bpm?: number;
  /** Promo: the brand's name and logo (path relative to zappy/), shown small in a corner and on the CTA card. */
  /** Promo brand kit: name; logo for light backgrounds, logoDark for dark ones (paths relative to
   * zappy/); the brand font file (.woff2/.ttf/.otf) and its family name; two weights (text, headings). */
  brand?: { name: string; logo?: string; logoDark?: string; font?: string; fontFamily?: string; weights?: [number, number] };
  /** Promo: what's on screen and in the soundtrack, and why you may use it. */
  rights?: { people: string; music?: string; font?: string };
  /** Promo: the ad's copy for the platform (delivered with every version). */
  adCopy?: { headline: string; text: string; button: string };
  /** Promo: campaign name for file names and UTM links (default: the feature). */
  campaign?: string;
  /** Promo: keep text clear of TikTok's right-side buttons in vertical cuts. */
  safe?: "tiktok";
  /** Promo: built-in sound design (soft clicks, whooshes on scene changes, an end sting). Default on. */
  sfx?: boolean;
  /** Promo: a small label on every footage scene, e.g. "Demo data" when names and scores are made up. */
  note?: string;
  /** Promo: how scenes change. push (default) | cut (hard, on the beat) | zoom. */
  transition?: "push" | "cut" | "zoom";
  /** Promo colours for this video: background, accent, and the pop colour for stickers and *highlights*. */
  theme?: { bg?: string; accent?: string; pop?: string };
  /** Browser size for this video, over record.viewport (smaller = larger UI text in crops). */
  viewport?: { width: number; height: number };
  /** Promo frame shape. */
  format?: "landscape" | "vertical" | "square" | "feed";
  /** Video time (s) of the poster frame <feature>.png; default: middle of the video. */
  poster?: number;
  steps: Step[];
};

const ACTIONS = [
  "goto",
  "click",
  "fill",
  "select",
  "hover",
  "press",
  "wait",
  "scroll",
];
const NEEDS_TARGET = ["click", "fill", "select", "hover"];

/** Reads specs/<feature>.yaml, fills {vars}, and checks its shape. */
export function loadSpec(
  specsDir: string,
  feature: string,
  vars: Record<string, string>,
): Spec {
  const raw = readFileSync(join(specsDir, `${feature}.yaml`), "utf8");
  const filled = raw.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  const spec = parse(filled) as Spec;
  const bad = (why: string) => {
    throw new Error(`specs/${feature}.yaml: ${why}`);
  };
  if (!spec?.title || !spec.startUrl) bad("needs title and startUrl");
  if (!spec.steps?.length) bad("needs at least one step");
  if (/\{\w+\}/.test(spec.startUrl)) bad("unknown {var} in startUrl (vars.json)");
  if (spec.blur && !Array.isArray(spec.blur)) bad("blur is a list of CSS selectors");
  const promo = spec.style === "promo";
  if (spec.transition && !["push", "cut", "zoom"].includes(spec.transition)) bad("transition is push, cut or zoom");
  if (spec.style && !["tutorial", "promo"].includes(spec.style))
    bad("style is tutorial or promo");
  if (spec.format && (!promo || !["landscape", "vertical", "square", "feed"].includes(spec.format)))
    bad("format (landscape, vertical, square) is for style: promo");
  spec.steps.forEach((s, i) => {
    if (!ACTIONS.includes(s.action))
      bad(`step ${i + 1}: unknown action ${s.action}`);
    if (NEEDS_TARGET.includes(s.action) && !s.selector)
      bad(`step ${i + 1}: ${s.action} needs a selector`);
    if ((s.action === "goto" || s.action === "press") && s.value == null)
      bad(`step ${i + 1}: ${s.action} needs a value`);
    // A promo can lay a card over any step (its footage is hidden), so setup steps double as cards.
    if (s.card && !promo && (s.action !== "wait" || s.selector))
      bad(`step ${i + 1}: a card goes on a wait with no selector`);
    if (s.card && !s.card.title && !s.card.stat && !s.card.compare && !s.card.quote)
      bad(`step ${i + 1}: card needs a title`);
    if (!promo && (s.headline != null || s.sticker || s.speed || s.cut || s.chips || s.hook || s.card?.tiles || s.card?.cta))
      bad(`step ${i + 1}: headline, sticker, speed, cut, chips and card tiles are for style: promo`);
    if (s.layout && (!promo || !["split", "tilt", "full"].includes(s.layout)))
      bad(`step ${i + 1}: layout is split, tilt or full, on a promo step`);
    if (s.layout && s.layout !== "full" && !s.selector)
      bad(`step ${i + 1}: layout: ${s.layout} needs a selector to crop to`);
    if (s.chips && !Array.isArray(s.chips)) bad(`step ${i + 1}: chips is a list of short texts`);
    if (s.card?.tiles?.some((t) => !t.emoji || !t.title))
      bad(`step ${i + 1}: every tile needs an emoji and a title`);
    if (promo && s.narration && s.speed != null && Number(s.speed) !== 1)
      bad(`step ${i + 1}: a voiced step plays at speed 1 (the voice would drift)`);
    if (s.sticker && !STICKERS.includes(s.sticker.kind))
      bad(`step ${i + 1}: sticker kind is one of ${STICKERS.join(", ")}`);
    if (s.sticker && !s.selector)
      bad(`step ${i + 1}: a sticker needs a step with a selector to pin to`);
    if (s.speed != null && !(Number(s.speed) > 0)) bad(`step ${i + 1}: speed must be > 0`);
    if (/\{\w+\}/.test(JSON.stringify(s)))
      bad(`step ${i + 1}: unknown {var} (vars.json)`);
  });
  return spec;
}
