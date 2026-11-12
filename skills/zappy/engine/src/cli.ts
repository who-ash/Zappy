// zappy: turn a scripted app flow into a narrated demo video.
//   zappy init                     create ./zappy (config, example spec)
//   zappy login <name> <url>       sign in by hand once; saves auth/<name>.json
//   zappy preview <feature> [--show]  run the steps fast, no voice or capture
//   zappy make <feature> | --all   voice → record → subtitles → render
//   zappy check <feature>          does a promo follow the ad playbook (brief, words, timing, CTA)
//   zappy versions <feature>       promo: the full version set + delivery package, from the recording
//   zappy render <feature>         re-render from the recording (spec's headlines, speed, format…)
//   zappy still <feature> <secs>   one frame of the rendered video, to check it
// Options: --dir <path> (default ./zappy)
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { chromium } from "playwright";
import type { DemoProps } from "../remotion/demo";
import { type Config, loadConfig } from "./config";
import { cardLines, checkAd } from "./adcheck";
import { normaliseLoudness } from "./audio";
import { cutsOf, outputLength, toOutput } from "./cuts";
import { headlineMs, promoLength, promoSegmentsOf } from "./promo";
import { applySpec, cutdown, hookSteps, promoSrt, withHook } from "./versions";
import { record, type Timeline } from "./record";
import { loadSpec, type Spec } from "./spec";
import { type Clip, VOICES, voice, withVoice } from "./voice";

const ENGINE = join(import.meta.dirname, "..");
const TEMPLATES = join(ENGINE, "..", "templates");

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: "string", default: "zappy" },
    all: { type: "boolean" },
    note: { type: "string" },
    voice: { type: "string" },
    show: { type: "boolean" },
  },
});
const DIR = resolve(opts.dir!);
// Errors print as one line (no stack) and exit 1; `finally` blocks still run first.
for (const ev of ["uncaughtException", "unhandledRejection"] as const)
  process.on(ev, (e: unknown) => {
    console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
const [cmd, ...args] = positionals;
const paths = {
  specs: join(DIR, "specs"),
  auth: join(DIR, "auth"),
  out: join(DIR, "out"),
  tts: join(DIR, ".cache", "tts"),
  vars: join(DIR, "vars.json"),
  briefs: join(DIR, "briefs"),
};

const srtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`;
};

function toSrt(tl: Timeline, cfg: Config) {
  const cuts = cutsOf(tl, cfg.render.maxPauseMs);
  const at = (ms: number) => srtTime(toOutput(tl, cuts, ms));
  return tl.steps
    .filter((s) => s.narration)
    .map(
      (s, i) =>
        `${i + 1}\n${at(s.startMs)} --> ${at(s.endMs)}\n${s.narration}\n`,
    )
    .join("\n");
}

const serve = (publicDir: string) =>
  bundle({
    entryPoint: join(ENGINE, "remotion", "index.ts"),
    publicDir,
    symlinkPublicDir: true, // frames/ can be thousands of files
  });

function init() {
  mkdirSync(paths.specs, { recursive: true });
  const put = (to: string, from: string) => {
    if (existsSync(to)) return console.log(`  kept ${to}`);
    copyFileSync(join(TEMPLATES, from), to);
    console.log(`  wrote ${to}`);
  };
  put(join(DIR, "zappy.config.json"), "zappy.config.json");
  put(join(paths.specs, "example.yaml"), "example.yaml");
  put(join(DIR, ".gitignore"), "gitignore");
  put(join(DIR, ".env.example"), "env.example");
  console.log(`Zappy workspace ready in ${DIR}`);
  console.log(
    "Voice: Sarvam by default. Put SARVAM_API_KEY in zappy/.env (see .env.example),\n" +
      'or set "tts": { "provider": "none" } for captions only.',
  );
}

async function login(name: string, url: string) {
  if (!name || !url) throw new Error("Usage: zappy login <name> <url>");
  const cfg = loadConfig(DIR);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    baseURL: cfg.baseUrl,
    viewport: cfg.record.viewport,
  });
  const page = await context.newPage();
  await page.goto(url);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`Sign in as "${name}" in the browser, then press Enter here… `);
  rl.close();
  mkdirSync(paths.auth, { recursive: true });
  const file = join(paths.auth, `${name}.json`);
  await context.storageState({ path: file });
  await browser.close();
  console.log(`Saved ${file} (keep it out of git)`);
}

/** The spec, its saved session, and the `before` command run. */
function prepare(feature: string) {
  const vars = existsSync(paths.vars)
    ? JSON.parse(readFileSync(paths.vars, "utf8"))
    : {};
  const spec = loadSpec(paths.specs, feature, vars);
  let authFile: string | undefined;
  if (spec.auth) {
    authFile = join(paths.auth, `${spec.auth}.json`);
    if (!existsSync(authFile))
      throw new Error(`No session "${spec.auth}": run zappy login ${spec.auth} <url>`);
  }
  if (spec.before) {
    console.log(`▶ ${feature}: before: ${spec.before}`);
    execSync(spec.before, { cwd: join(DIR, ".."), stdio: "inherit" });
  }
  return { spec, authFile, out: join(paths.out, feature) };
}

/**
 * Holds a promo to the brand-ad playbook (src/adcheck.ts). Prints what's
 * wrong; throws when anything is an error, so nothing off-playbook renders.
 */
function enforce(feature: string, spec: Spec, tl?: Timeline, render?: Config["render"]) {
  if (spec.style !== "promo") return;
  const file = join(paths.briefs, `${feature}.md`);
  const { errors, warnings } = checkAd(spec, existsSync(file) ? readFileSync(file, "utf8") : null, tl, render);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✖ ${e}`);
  if (errors.length)
    throw new Error(`${feature}: ${errors.length} playbook rule${errors.length > 1 ? "s" : ""} broken (above). Fix the brief or spec, then run it again.`);
  console.log(`✔ ${feature}: follows the ad playbook${tl ? "" : " (timing is checked after recording)"}`);
}

/** Plays every step quickly (no voice, no capture) to catch broken selectors before a make. */
async function preview(feature: string, cfg: Config) {
  const { spec, authFile, out } = prepare(feature);
  console.log(`▶ ${feature}: preview ${cfg.baseUrl}${spec.startUrl}`);
  const fast = { ...cfg, record: { ...cfg.record, silentMs: 250, ...(spec.viewport && { viewport: spec.viewport }) } };
  const clips = spec.steps.map(() => null);
  await record(spec, clips, out, authFile, fast, { preview: true, show: opts.show });
  console.log(`✔ ${feature}: all ${spec.steps.length} steps ran`);
}

async function make(feature: string, cfg: Config) {
  const vars0 = existsSync(paths.vars) ? JSON.parse(readFileSync(paths.vars, "utf8")) : {};
  enforce(feature, loadSpec(paths.specs, feature, vars0)); // before `before:` runs or anything is recorded
  const { spec, authFile, out } = prepare(feature);
  mkdirSync(join(out, "voice"), { recursive: true });
  const promo = spec.style === "promo";

  // A promo step with narration is voiced; the others hold long enough to read.
  const clips: (Clip | null)[] = [];
  if (!promo || spec.steps.some((s) => s.narration)) console.log(`▶ ${feature}: voice (${cfg.tts.provider})`);
  for (const [i, step] of spec.steps.entries()) {
    if (promo && !step.narration) {
      const text = [step.headline, step.card?.eyebrow, ...(step.card ? cardLines(step.card) : []),
        ...(step.card?.tiles ?? []).map((t) => t.text ?? "")]
        .filter(Boolean)
        .join(" ");
      clips.push(text ? { file: null, seconds: headlineMs(text) / 1000 } : null);
      continue;
    }
    const text = step.narration?.trim();
    const tts = withVoice(cfg.tts, step.voice ?? spec.voice);
    const clip = text ? await voice(text, tts, paths.tts) : null;
    if (clip?.file) copyFileSync(clip.file, join(out, "voice", `${i}.wav`));
    clips.push(clip);
  }

  console.log(`▶ ${feature}: recording ${cfg.baseUrl}${spec.startUrl}`);
  const rcfg = spec.viewport ? { ...cfg, record: { ...cfg.record, viewport: spec.viewport } } : cfg;
  const timeline = await record(spec, clips, out, authFile, rcfg);
  if (!promo) writeFileSync(join(out, `${feature}.srt`), toSrt(timeline, cfg));

  await renderVideo(feature, spec, timeline, cfg);
}

/**
 * Renders out/<feature>/ from its saved recording. The spec's presentation
 * (headlines, stickers, speed, zoom, cards, format, music, tempo, poster) is
 * re-read, so `zappy render` changes those without filming again.
 */
async function renderVideo(feature: string, spec: Spec, timeline: Timeline, cfg: Config, dest?: string) {
  const out = join(paths.out, feature);
  const base = dest ?? join(out, feature); // output path without extension
  const promo = spec.style === "promo";
  if (spec.steps.length !== timeline.steps.length)
    throw new Error(`specs/${feature}.yaml has ${spec.steps.length} steps but the recording has ${timeline.steps.length}: make it again`);
  applySpec(timeline, spec);
  timeline.format = spec.format ?? "landscape";
  // The spec's music and tempo win over the config's, so one video can have its own.
  // The tempo is saved with the timeline so `still` cuts the same way.
  if (promo) {
    timeline.bpm = spec.bpm ?? cfg.render.bpm;
    timeline.theme = spec.theme;
    timeline.transition = spec.transition;
    timeline.note = spec.note;
    timeline.safe = spec.safe;
    timeline.sfx = spec.sfx !== false;
    timeline.brand = undefined;
    if (spec.brand) {
      const { name, fontFamily, weights } = spec.brand;
      timeline.brand = { name, fontFamily, weights };
      // Brand files are copied next to the frames, where the composition reads them.
      for (const key of ["logo", "logoDark", "font"] as const) {
        const file = spec.brand[key];
        if (!file) continue;
        const src = resolve(DIR, file);
        if (!existsSync(src)) throw new Error(`brand.${key}: no file ${src}`);
        timeline.brand[key] = `${key}${extname(src)}`;
        copyFileSync(src, join(out, timeline.brand[key]!));
      }
    }
    if (timeline.sfx) {
      mkdirSync(join(out, "sfx"), { recursive: true });
      for (const f of ["click", "whoosh", "sting"]) copyFileSync(join(ENGINE, "assets", "sfx", `${f}.wav`), join(out, "sfx", `${f}.wav`));
    }
  }
  writeFileSync(join(out, "timeline.json"), JSON.stringify(timeline, null, 2));
  enforce(feature, spec, timeline, cfg.render);
  console.log(`▶ ${feature}: rendering ${promo ? `promo (${timeline.format})` : `${cfg.render.width}×${cfg.render.height}`}`);
  const render = cfg.render;
  const musicFile = spec.music ?? cfg.render.music;
  let music: string | undefined;
  if (musicFile) {
    const src = resolve(DIR, musicFile);
    if (!existsSync(src)) throw new Error(`music: no file ${src}`);
    music = `music${extname(src)}`;
    copyFileSync(src, join(out, music));
  }
  const serveUrl = await serve(out);
  // Poster: the spec's `poster` time, else the middle of the video.
  const lengthMs = promo
    ? promoLength(promoSegmentsOf(timeline, render))
    : outputLength(timeline, cutsOf(timeline, cfg.render.maxPauseMs));
  const posterSecs = spec.poster ?? lengthMs / 2000;
  const inputProps: DemoProps = {
    timeline,
    render,
    music,
    posterMs: promo ? posterSecs * 1000 : undefined,
  };
  const composition = await selectComposition({ serveUrl, id: compId(timeline), inputProps });
  const mp4 = `${base}.mp4`;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: cfg.render.crf,
    outputLocation: mp4,
    inputProps,
    onProgress: ({ progress }) =>
      process.stdout.write(`\r  ${Math.round(progress * 100)}%`),
  });
  const lufs = cfg.render.loudness ? normaliseLoudness(ENGINE, mp4, cfg.render.loudness) : null;
  console.log(`\n✔ ${mp4}${lufs != null ? ` (audio ${lufs.toFixed(1)} → ${cfg.render.loudness} LUFS)` : ""}`);
  if (promo) writeFileSync(`${base}.srt`, promoSrt(timeline, render));
  await frameAt(serveUrl, inputProps, posterSecs, `${base}.png`, 1);
  return { mp4, lengthMs };
}

/**
 * The playbook's version set from one recording (no filming), in
 * zappy/out/<feature>/delivery/vNN/: the hero in both shapes, a 15 s cut
 * (9:16 and 4:5), a 6 s bumper (16:9 and 9:16), Hook B/C variants (9:16), each
 * with its poster and .srt, plus ad copy with UTM links, licences, the review
 * checklist and a phone-size preview page. Every version passes `check`.
 */
async function versions(feature: string, cfg: Config) {
  const out = join(paths.out, feature);
  const tlFile = join(out, "timeline.json");
  if (!existsSync(tlFile)) throw new Error(`Make ${feature} first`);
  const vars = existsSync(paths.vars) ? JSON.parse(readFileSync(paths.vars, "utf8")) : {};
  const spec = loadSpec(paths.specs, feature, vars);
  if (spec.style !== "promo") throw new Error("versions is for style: promo");
  if (!spec.adCopy) throw new Error("adCopy: { headline, text, button } goes in the spec: it ships with every version");
  const ctaUrl = spec.steps.find((s) => !s.cut && s.card?.cta)?.card?.cta?.url;
  if (!ctaUrl) throw new Error("the CTA needs a url (ask the user for it)");
  const original = readFileSync(tlFile, "utf8");
  const fresh = () => JSON.parse(original) as Timeline;
  const render = { ...cfg.render, bpm: spec.bpm ?? cfg.render.bpm };
  const lengthOf = (s: Spec) => {
    const t = fresh();
    applySpec(t, s);
    t.bpm = render.bpm;
    return promoLength(promoSegmentsOf(t, render));
  };

  // The batch's version number continues the campaign's log.
  const safeName = (t: string) => t.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const campaign = safeName(spec.campaign ?? feature);
  const brand = safeName(spec.brand?.name ?? "Brand");
  const logFile = join(DIR, "versions.csv");
  const log = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").slice(1).filter(Boolean) : [];
  const nn = 1 + Math.max(0, ...log.map((r) => r.split(",")).filter((c) => c[2] === campaign).map((c) => Number(c[3].slice(1)) || 0));
  const v = `v${String(nn).padStart(2, "0")}`;
  const dir = join(out, "delivery", v);
  mkdirSync(dir, { recursive: true });

  type Shape = NonNullable<Spec["format"]>;
  const tag: Record<Shape, string> = { landscape: "16x9", vertical: "9x16", square: "1x1", feed: "4x5" };
  const hero: Shape = spec.format ?? "landscape";
  const plan: { spec: Spec; kind: string; hook: string }[] = [];
  for (const f of [hero, hero === "landscape" ? "vertical" : "landscape"] as Shape[]) plan.push({ spec: { ...spec, format: f }, kind: "hero", hook: "A" });
  if (lengthOf(spec) > 17000)
    for (const f of ["vertical", "feed"] as Shape[]) plan.push({ spec: { ...cutdown(spec, fresh(), render, 15000), format: f }, kind: "15s", hook: "A" });
  for (const f of ["landscape", "vertical"] as Shape[]) plan.push({ spec: { ...cutdown(spec, fresh(), render, 6000), format: f }, kind: "6s", hook: "A" });
  hookSteps(spec).slice(1, 3).forEach((i, k) => plan.push({ spec: { ...withHook(spec, i), format: "vertical" }, kind: "hook", hook: "BC"[k] }));

  const made: { stem: string; shape: Shape; kind: string; hook: string; secs: number }[] = [];
  try {
    for (const p of plan) {
      const shape = p.spec.format ?? "landscape";
      const secs = Math.round(lengthOf(p.spec) / 1000);
      const stem = `${brand}_${campaign}_${secs}s_${tag[shape]}_Hook${p.hook}_${v}`;
      console.log(`▶ ${stem} (${p.kind})`);
      await renderVideo(feature, p.spec, fresh(), cfg, join(dir, stem));
      made.push({ stem, shape, kind: p.kind, hook: p.hook, secs });
    }
  } finally {
    writeFileSync(tlFile, original); // `still` and `render` keep working on the hero
  }

  const source: Record<Shape, string> = { landscape: "youtube_linkedin", vertical: "reels_shorts_tiktok", feed: "feed", square: "feed" };
  const base = /^https?:\/\//.test(ctaUrl) ? ctaUrl : `https://${ctaUrl}`;
  const utm = (m: (typeof made)[number]) =>
    `${base}${base.includes("?") ? "&" : "?"}utm_source=${source[m.shape]}&utm_medium=video&utm_campaign=${campaign}&utm_content=${m.stem}`;
  writeFileSync(join(dir, "copy.md"), [
    `# Ad copy: ${spec.title} (${v})`, "",
    `- **Headline:** ${spec.adCopy.headline}`, `- **Primary text:** ${spec.adCopy.text}`, `- **CTA button:** ${spec.adCopy.button}`, "",
    "| File | Kind | Landing link |", "|---|---|---|",
    ...made.map((m) => `| ${m.stem}.mp4 | ${m.kind}, ${m.secs} s, ${tag[m.shape]}, Hook ${m.hook} | ${utm(m)} |`), "",
  ].join("\n"));
  writeFileSync(join(dir, "LICENCES.md"), [
    `# Licences and releases: ${spec.title} (${v})`, "",
    `- **People on screen:** ${spec.rights?.people}`,
    spec.music ? `- **Music:** ${spec.music}: ${spec.rights?.music}` : "- **Music:** none",
    spec.brand?.font ? `- **Font:** ${spec.brand.fontFamily}: ${spec.rights?.font}` : `- **Font:** ${cfg.render.font.split(",")[0]} (default)`,
    spec.sfx !== false ? "- **Sound effects:** Zappy's own (engine/assets/sfx, synthesised, CC0)" : "- **Sound effects:** none",
    "", "Keep the licence files and any releases in this folder before publishing.", "",
  ].join("\n"));
  const auto = "(checked by zappy)";
  writeFileSync(join(dir, "CHECKLIST.md"), [
    `# Review before publishing: ${spec.title} (${v})`, "",
    "Run it on a phone (open preview.html), and ask someone who hasn't seen the brief to watch once and say the message.", "",
    "## Message", "- [ ] A first-time viewer can repeat the single message after one watch", `- [x] The hook opens on footage in the first 3 s ${auto}`, "- [ ] Every scene supports the message", "",
    "## Brand", `- [x] Brand cue in the first 5 s, logo on the end card ${auto}`, "- [ ] Logo, colours and font match the brand kit", `- [x] End card has one line and one CTA with a link ${auto}`, "",
    "## Text and captions", `- [x] 7 words or fewer per line, held long enough to read twice ${auto}`, `- [x] Captions burned in for spoken lines; .srt alongside ${auto}`, "- [ ] Names, dates and numbers are correct", "- [ ] Readable on a phone", "",
    "## Audio", `- [x] Normalised to ${cfg.render.loudness} LUFS ${auto}`, "- [ ] Voice clear on phone speakers and earphones; music doesn't cover speech", "- [ ] No clicks, pops or sudden jumps", "",
    "## Technical", `- [x] Shapes and sizes: ${[...new Set(made.map((m) => tag[m.shape]))].join(", ")} ${auto}`, "- [ ] Previewed in each platform's placement preview", "- [ ] Landing page link works and matches the ad", "",
    "## Rights", "- [ ] Releases for every identifiable person (guardian consent under 18)", "- [ ] Licences for music, footage and fonts (LICENCES.md)", "- [ ] Every claim on screen has a source, and the product really does it", "",
  ].join("\n"));
  writeFileSync(join(dir, "preview.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${spec.title} ${v}</title>
<style>body{font:15px system-ui;margin:24px;background:#111;color:#eee}div{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}figure{margin:0}video{display:block;border-radius:14px;background:#000}figcaption{margin-top:8px;color:#aaa;max-width:300px}</style>
<h1>${spec.title} · ${v}</h1><p>Each video at about phone size. Play them on a phone too.</p><div>
${made.map((m) => `<figure><video src="${m.stem}.mp4" poster="${m.stem}.png" controls playsinline muted style="width:${m.shape === "landscape" ? 375 : m.shape === "vertical" ? 220 : 300}px"></video><figcaption>${m.kind} · ${m.secs} s · ${tag[m.shape]} · Hook ${m.hook}</figcaption></figure>`).join("\n")}
</div>`);
  const header = "date,file,campaign,version,length_s,shape,hook,kind,note";
  const note = (opts.note ?? "").replace(/[,\n]/g, ";");
  const rows = made.map((m) => [new Date().toISOString().slice(0, 10), `${m.stem}.mp4`, campaign, v, m.secs, tag[m.shape], m.hook, m.kind, note].join(","));
  writeFileSync(logFile, [header, ...log, ...rows].join("\n") + "\n");
  console.log(`✔ ${made.length} versions in ${dir} (copy.md, LICENCES.md, CHECKLIST.md, preview.html); logged in ${logFile}`);
}

const compId = (tl: Timeline) => (tl.style === "promo" ? "Promo" : "Demo");

/** Renders the video's frame at `secs` to a PNG, at most 1920 px wide × `maxScale`. */
async function frameAt(
  serveUrl: string,
  inputProps: DemoProps,
  secs: number,
  file: string,
  maxScale: number,
) {
  const composition = await selectComposition({ serveUrl, id: compId(inputProps.timeline), inputProps });
  const frame = Math.min(
    composition.durationInFrames - 1,
    Math.round(secs * composition.fps),
  );
  const scale = Math.min(maxScale, 1920 / Math.max(composition.width, composition.height));
  await renderStill({ composition, serveUrl, frame, output: file, inputProps, scale });
  console.log(`✔ ${file}`);
}

async function still(feature: string, secs: string, cfg: Config) {
  const out = join(paths.out, feature);
  const tlFile = join(out, "timeline.json");
  if (!existsSync(tlFile)) throw new Error(`Make ${feature} first`);
  const timeline = JSON.parse(readFileSync(tlFile, "utf8")) as Timeline;
  const serveUrl = await serve(out);
  const inputProps: DemoProps = { timeline, render: cfg.render };
  await frameAt(serveUrl, inputProps, Number(secs), join(out, `still-${secs}s.png`), 0.5);
}

if (cmd === "init") init();
else if (cmd === "login") await login(args[0], args[1]);
else if (cmd === "preview") {
  if (!args[0]) throw new Error("Usage: zappy preview <feature> [--show]");
  await preview(args[0], loadConfig(DIR));
}
else if (cmd === "make") {
  const cfg = loadConfig(DIR);
  const features =
    opts.all || args[0] === "--all"
      ? readdirSync(paths.specs)
          .filter((f) => f.endsWith(".yaml"))
          .map((f) => f.slice(0, -5))
      : args;
  if (!features.length) throw new Error("Usage: zappy make <feature> | --all");
  for (const f of features) await make(f, cfg);
} else if (cmd === "render") {
  if (!args[0]) throw new Error("Usage: zappy render <feature>");
  const cfg = loadConfig(DIR);
  const tlFile = join(paths.out, args[0], "timeline.json");
  if (!existsSync(tlFile)) throw new Error(`Make ${args[0]} first`);
  const vars = existsSync(paths.vars) ? JSON.parse(readFileSync(paths.vars, "utf8")) : {};
  await renderVideo(args[0], loadSpec(paths.specs, args[0], vars), JSON.parse(readFileSync(tlFile, "utf8")), cfg);
} else if (cmd === "versions") {
  if (!args[0]) throw new Error('Usage: zappy versions <feature> [--note "what changed"]');
  await versions(args[0], loadConfig(DIR));
} else if (cmd === "check") {
  if (!args[0]) throw new Error("Usage: zappy check <feature>");
  const vars = existsSync(paths.vars) ? JSON.parse(readFileSync(paths.vars, "utf8")) : {};
  const spec = loadSpec(paths.specs, args[0], vars);
  const tlFile = join(paths.out, args[0], "timeline.json");
  let tl: Timeline | undefined;
  if (existsSync(tlFile) && spec.style === "promo") {
    // Apply the spec's current presentation to the recording, as `render` would.
    tl = JSON.parse(readFileSync(tlFile, "utf8")) as Timeline;
    if (tl.steps.length === spec.steps.length)
      tl.steps.forEach((t, i) => {
        const s = spec.steps[i];
        Object.assign(t, { card: s.card ?? null, headline: s.headline ?? null, speed: Number(s.speed ?? 1), cut: !!s.cut, hook: !!s.hook });
      });
    else tl = undefined;
    if (tl) tl.bpm = spec.bpm ?? loadConfig(DIR).render.bpm;
  }
  if (spec.style !== "promo") console.log(`${args[0]} is a tutorial: the ad playbook applies to style: promo`);
  else enforce(args[0], spec, tl, loadConfig(DIR).render);
} else if (cmd === "still") await still(args[0], args[1] ?? "1", loadConfig(DIR));
else if (cmd === "voices") {
  const { tts } = loadConfig(DIR);
  if (tts.provider === "none")
    console.log('tts.provider is "none" (captions only). Set it to "openai" or "sarvam".');
  else {
    const current = tts.provider === "openai" ? tts.openai.voice : tts.sarvam.speaker;
    for (const v of VOICES[tts.provider])
      console.log(`${v === current ? "*" : " "} ${v}`);
    console.log(`(${tts.provider}; * = current. Try one: zappy say "Hello there" --voice <name>)`);
  }
} else if (cmd === "say") {
  // A sample clip to hear a voice before choosing it.
  const { tts } = loadConfig(DIR);
  if (tts.provider === "none") throw new Error('tts.provider is "none"; nothing to say');
  const name = opts.voice;
  const clip = await voice(args.join(" ") || "This is how your demo will sound.", withVoice(tts, name), paths.tts);
  const file = join(DIR, "out", `say-${name ?? "default"}.wav`);
  mkdirSync(join(DIR, "out"), { recursive: true });
  copyFileSync(clip.file!, file);
  console.log(`✔ ${file} (${clip.seconds.toFixed(1)} s)`);
}
else {
  console.log(
    "Usage: zappy init | login <name> <url> | preview <feature> [--show] | check <feature> | render <feature> | versions <feature> | make <feature>|--all | still <feature> <secs> | voices | say <text> [--voice v]  [--dir zappy]",
  );
  process.exit(cmd ? 1 : 0);
}
process.exit(0);
