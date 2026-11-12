// Drives the real UI with Playwright, paced to each step's voice clip, and
// writes timeline.json beside the recording.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import type { Config } from "./config";
import { fakeCamera } from "./camera";
import { cursorScript } from "./cursor";
import type { Card, Spec, Step, Sticker } from "./spec";
import type { Clip } from "./voice";

export type Box = { x: number; y: number; width: number; height: number };
export type TimelineStep = {
  index: number;
  action: Step["action"];
  narration: string;
  zoom: boolean;
  box: Box | null;
  startMs: number;
  endMs: number;
  audio: string | null; // null: a silent step
  audioMs: number;
  card: Card | null;
  headline: string | null; // null: keep the previous headline
  sticker: Sticker | null;
  speed: number;
};
/** One captured screen: frames/<file>, shown from `ms` (recording time) until the next. */
export type Frame = { file: string; ms: number };
export type Timeline = {
  title: string;
  style?: "tutorial" | "promo"; // absent in older timelines: tutorial
  format?: "landscape" | "vertical" | "square";
  viewport: { width: number; height: number };
  frames: Frame[];
  offsetMs: number; // recording time when the start page was ready
  endMs: number;
  steps: TimelineStep[];
};

/** Only visible matches: responsive layouts keep hidden copies of controls. */
function locate(page: Page, s: NonNullable<Step["selector"]>): Locator {
  return find(page, s).filter({ visible: true });
}

function find(page: Page, s: NonNullable<Step["selector"]>): Locator {
  if ("role" in s)
    return page.getByRole(s.role as Parameters<Page["getByRole"]>[0], {
      name: s.name,
      exact: s.exact,
    });
  if ("label" in s) return page.getByLabel(s.label, { exact: s.exact });
  if ("placeholder" in s)
    return page.getByPlaceholder(s.placeholder, { exact: s.exact });
  if ("testId" in s) return page.getByTestId(s.testId);
  if ("text" in s) return page.getByText(s.text, { exact: s.exact });
  return page.locator(s.css);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

export async function record(
  spec: Spec,
  clips: (Clip | null)[],
  outDir: string,
  authFile: string | undefined, // undefined: signed out
  cfg: Config,
  // preview: run the steps without capturing (spec check); show: a visible browser.
  { preview = false, show = false } = {},
): Promise<Timeline> {
  const {
    viewport,
    scale,
    jpegQuality,
    cursorMoveMs,
    bufferMs,
    typeDelayMs,
    silentMs,
    rippleColor,
    loadingSelector,
    loginPath,
  } = cfg.record;
  const framesDir = join(outDir, "frames");
  if (!preview) rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(preview ? outDir : framesDir, { recursive: true });
  // Selfie steps see a drawn avatar instead of a real camera.
  const browser = await chromium.launch({
    headless: !show,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${fakeCamera()}`,
    ],
  });
  const context = await browser.newContext({
    permissions: ["camera"],
    baseURL: cfg.baseUrl,
    viewport,
    deviceScaleFactor: scale,
    storageState: authFile,
  });
  await context.addInitScript(
    cursorScript(rippleColor, [...cfg.record.blur, ...(spec.blur ?? [])]),
  );
  const page = await context.newPage();
  const t0 = Date.now(); // recording time 0
  const now = () => Date.now() - t0;

  // Chrome's screencast sends a full-quality JPEG on every repaint (Playwright's
  // recordVideo encodes at ~1 Mbps, which blurs text). It follows navigations.
  const frames: Frame[] = [];
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = `${String(frames.length).padStart(6, "0")}.jpg`;
    writeFileSync(join(framesDir, file), Buffer.from(data, "base64"));
    frames.push({
      file,
      ms: (metadata.timestamp ?? Date.now() / 1000) * 1000 - t0,
    });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  if (!preview)
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: jpegQuality,
      maxWidth: viewport.width * scale,
      maxHeight: viewport.height * scale,
    });

  // Dev servers can take a while to compile a page on its first visit.
  page.setDefaultNavigationTimeout(120_000);
  // A preview fails fast on a missing control (the page is already compiled).
  page.setDefaultTimeout(preview ? 30_000 : 180_000);
  await page.goto(spec.startUrl);
  await page.waitForLoadState("networkidle");
  if (authFile && new URL(page.url()).pathname.startsWith(loginPath))
    throw new Error(
      "Landed on the login page: the saved session expired. Run `zappy login` again.",
    );
  const offsetMs = now();
  let cursor = { x: viewport.width / 2, y: viewport.height / 2 };

  const steps: TimelineStep[] = [];
  for (const [index, step] of spec.steps.entries()) {
    // On any failure, keep a screenshot and name the step.
    const fail = async (e: Error): Promise<never> => {
      await page
        .screenshot({ path: join(outDir, "failed.png") })
        .catch(() => {});
      await browser.close();
      throw new Error(
        `Step ${index + 1} (${step.action}${step.narration ? `, "${step.narration}"` : ""}): ${e.message.split("\n")[0]}. See ${join(outDir, "failed.png")}`,
      );
    };
    let startMs = now();
    let box: Box | null = null;
    const target = step.selector ? locate(page, step.selector) : null;
    if (target) {
      // After a full navigation the DOM can be ready before anything is painted
      // (dev hydration); wait for load and two frames so the zoom sees it.
      await page.waitForLoadState("load");
      // Skeletons hold real controls (tabs, buttons); act on the loaded page,
      // not its fallback. Capped, as some lists keep loading.
      if (loadingSelector)
        await page
          .waitForFunction(
            (sel) => !document.querySelector(sel),
            loadingSelector,
            {
              timeout: 15_000,
            },
          )
          .catch(() => {});
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      // Also waits for it to be visible and still.
      await target.scrollIntoViewIfNeeded().catch(fail);
      // The step (voice, zoom, caption) starts once its target is on screen,
      // so a slow page shows as a pause, not narration over a blank screen.
      startMs = now();
      box = await target.boundingBox();
      if (!box) throw new Error(`Step ${index + 1}: target has no box`);
      const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      // A full page load drops the injected cursor; put it back where it was.
      await page.evaluate(
        ([from, to, ms]) => {
          window.__demo.set(from.x, from.y);
          return window.__demo.move(to.x, to.y, ms);
        },
        [cursor, to, cursorMoveMs] as const,
      );
      await page.mouse.move(to.x, to.y);
      cursor = to;
    }

    const ripple = () =>
      page.evaluate(([x, y]) => window.__demo.ripple(x, y), [
        cursor.x,
        cursor.y,
      ] as const);
    try {
      switch (step.action) {
        case "goto":
          await page.goto(String(step.value));
          await page.waitForLoadState("networkidle");
          break;
        case "click":
          await ripple();
          await target!.click();
          break;
        case "fill":
          await ripple();
          await target!.click();
          await target!.clear(); // prefilled fields are retyped, not appended to
          await target!.pressSequentially(String(step.value), {
            delay: typeDelayMs,
          });
          break;
        case "select":
          await ripple();
          await target!.selectOption(String(step.value));
          break;
        case "hover":
          await target!.hover();
          break;
        case "press":
          await page.keyboard.press(String(step.value));
          break;
        case "scroll":
          await page.mouse.wheel(0, Number(step.value ?? 600));
          break;
        case "wait":
          await sleep(Number(step.value ?? 0));
          break;
      }
    } catch (e) {
      await fail(e as Error);
    }

    // Pace to the voice: the step lasts its clip plus a breath.
    const clip = clips[index];
    const ms = clip ? clip.seconds * 1000 + bufferMs : silentMs;
    await sleep(ms - (now() - startMs));
    steps.push({
      index,
      action: step.action,
      narration: step.narration?.trim() ?? "",
      zoom: step.zoom !== false && !!box,
      box,
      startMs,
      endMs: now(),
      audio: clip?.file ? `voice/${index}.wav` : null,
      audioMs: clip?.file ? Math.round(clip.seconds * 1000) : 0,
      card: step.card ?? null,
      headline: step.headline ?? null,
      sticker: step.sticker ?? null,
      speed: Number(step.speed ?? 1),
    });
  }

  await sleep(600);
  const endMs = now();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await context.close();
  await browser.close();
  const timeline: Timeline = {
    title: spec.title,
    style: spec.style ?? "tutorial",
    format: spec.format ?? "landscape",
    viewport,
    frames,
    offsetMs,
    endMs,
    steps,
  };
  if (preview) return timeline;
  if (!frames.length) throw new Error("No frames captured");

  writeFileSync(
    join(outDir, "timeline.json"),
    JSON.stringify(timeline, null, 2),
  );
  return timeline;
}

declare global {
  interface Window {
    __demo: {
      set(x: number, y: number): void;
      move(x: number, y: number, ms: number): Promise<void>;
      ripple(x: number, y: number): void;
    };
  }
}
