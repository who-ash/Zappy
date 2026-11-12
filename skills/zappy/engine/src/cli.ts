// zappy: turn a scripted app flow into a narrated demo video.
//   zappy init                     create ./zappy (config, example spec)
//   zappy login <name> <url>       sign in by hand once; saves auth/<name>.json
//   zappy preview <feature> [--show]  run the steps fast, no voice or capture
//   zappy make <feature> | --all   voice → record → subtitles → render
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
import { cutsOf, outputLength, toOutput } from "./cuts";
import { headlineMs, promoLength, promoSegments } from "./promo";
import { record, type Timeline } from "./record";
import { loadSpec } from "./spec";
import { type Clip, VOICES, voice, withVoice } from "./voice";

const ENGINE = join(import.meta.dirname, "..");
const TEMPLATES = join(ENGINE, "..", "templates");

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: "string", default: "zappy" },
    all: { type: "boolean" },
    voice: { type: "string" },
    show: { type: "boolean" },
  },
});
const DIR = resolve(opts.dir!);
const [cmd, ...args] = positionals;
const paths = {
  specs: join(DIR, "specs"),
  auth: join(DIR, "auth"),
  out: join(DIR, "out"),
  tts: join(DIR, ".cache", "tts"),
  vars: join(DIR, "vars.json"),
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

/** Plays every step quickly (no voice, no capture) to catch broken selectors before a make. */
async function preview(feature: string, cfg: Config) {
  const { spec, authFile, out } = prepare(feature);
  console.log(`▶ ${feature}: preview ${cfg.baseUrl}${spec.startUrl}`);
  const fast = { ...cfg, record: { ...cfg.record, silentMs: 250 } };
  const clips = spec.steps.map(() => null);
  await record(spec, clips, out, authFile, fast, { preview: true, show: opts.show });
  console.log(`✔ ${feature}: all ${spec.steps.length} steps ran`);
}

async function make(feature: string, cfg: Config) {
  const { spec, authFile, out } = prepare(feature);
  mkdirSync(join(out, "voice"), { recursive: true });
  const promo = spec.style === "promo";

  // A promo has no voice: a headline or card step holds long enough to read.
  const clips: (Clip | null)[] = [];
  if (promo)
    for (const s of spec.steps) {
      const text = [s.headline, s.card?.eyebrow, s.card?.title, ...(s.card?.lines ?? [])]
        .filter(Boolean)
        .join(" ");
      clips.push(text ? { file: null, seconds: headlineMs(text) / 1000 } : null);
    }
  else console.log(`▶ ${feature}: voice (${cfg.tts.provider})`);
  for (const [i, step] of promo ? [] : spec.steps.entries()) {
    const text = step.narration?.trim();
    const tts = withVoice(cfg.tts, step.voice ?? spec.voice);
    const clip = text ? await voice(text, tts, paths.tts) : null;
    if (clip?.file) copyFileSync(clip.file, join(out, "voice", `${i}.wav`));
    clips.push(clip);
  }

  console.log(`▶ ${feature}: recording ${cfg.baseUrl}${spec.startUrl}`);
  const timeline = await record(spec, clips, out, authFile, cfg);
  if (!promo) writeFileSync(join(out, `${feature}.srt`), toSrt(timeline, cfg));

  console.log(`▶ ${feature}: rendering ${promo ? `promo (${spec.format ?? "landscape"})` : `${cfg.render.width}×${cfg.render.height}`}`);
  let music: string | undefined;
  if (cfg.render.music) {
    const src = resolve(DIR, cfg.render.music);
    if (!existsSync(src)) throw new Error(`render.music: no file ${src}`);
    music = `music${extname(src)}`;
    copyFileSync(src, join(out, music));
  }
  const serveUrl = await serve(out);
  // Poster: the spec's `poster` time, else the middle of the video.
  const lengthMs = promo
    ? promoLength(promoSegments(timeline.steps, cfg.render.bpm))
    : outputLength(timeline, cutsOf(timeline, cfg.render.maxPauseMs));
  const posterSecs = spec.poster ?? lengthMs / 2000;
  const inputProps: DemoProps = {
    timeline,
    render: cfg.render,
    music,
    posterMs: promo ? posterSecs * 1000 : undefined,
  };
  const composition = await selectComposition({ serveUrl, id: compId(timeline), inputProps });
  const mp4 = join(out, `${feature}.mp4`);
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
  console.log(`\n✔ ${mp4}`);
  await frameAt(serveUrl, inputProps, posterSecs, join(out, `${feature}.png`), 1);
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
    "Usage: zappy init | login <name> <url> | preview <feature> [--show] | make <feature>|--all | still <feature> <secs> | voices | say <text> [--voice v]  [--dir zappy]",
  );
  process.exit(cmd ? 1 : 0);
}
process.exit(0);
