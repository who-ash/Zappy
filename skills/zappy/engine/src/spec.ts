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
  title: string;
  lines?: string[];
  /** Lines show as ticks instead of bullets. */
  check?: boolean;
};

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
  spec.steps.forEach((s, i) => {
    if (!ACTIONS.includes(s.action))
      bad(`step ${i + 1}: unknown action ${s.action}`);
    if (NEEDS_TARGET.includes(s.action) && !s.selector)
      bad(`step ${i + 1}: ${s.action} needs a selector`);
    if ((s.action === "goto" || s.action === "press") && s.value == null)
      bad(`step ${i + 1}: ${s.action} needs a value`);
    if (s.card && (s.action !== "wait" || s.selector))
      bad(`step ${i + 1}: a card goes on a wait with no selector`);
    if (s.card && !s.card.title) bad(`step ${i + 1}: card needs a title`);
    if (/\{\w+\}/.test(JSON.stringify(s)))
      bad(`step ${i + 1}: unknown {var} (vars.json)`);
  });
  return spec;
}
