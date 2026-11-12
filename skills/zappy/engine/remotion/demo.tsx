import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { RenderConfig } from "../src/defaults";
import { cutsOf, outputLength, toOutput, toRecording } from "../src/cuts";
import { musicVolume } from "../src/music";
import type { Frame, Timeline, TimelineStep } from "../src/record";
import type { Card } from "../src/spec";

const ease = Easing.inOut(Easing.cubic);
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Scale and focus point (output px) at recording time t. */
export function camera(
  steps: TimelineStep[],
  t: number,
  k: number,
  W: number,
  H: number,
  render: RenderConfig,
) {
  const { zoomInMs, zoomOutMs, maxZoom, targetFill } = render;
  const s = steps.find((x) => x.zoom && x.box && t >= x.startMs && t < x.endMs);
  if (!s?.box) return { scale: 1, fx: W / 2, fy: H / 2 };
  const b = s.box;
  const zoom = clamp(
    Math.min(
      (targetFill * W) / (b.width * k),
      (targetFill * 1.6 * H) / (b.height * k),
    ),
    1,
    maxZoom,
  );
  const p = ease(
    clamp(
      Math.min((t - s.startMs) / zoomInMs, (s.endMs - t) / zoomOutMs),
      0,
      1,
    ),
  );
  return {
    scale: 1 + (zoom - 1) * p,
    fx: W / 2 + ((b.x + b.width / 2) * k - W / 2) * p,
    fy: H / 2 + ((b.y + b.height / 2) * k - H / 2) * p,
  };
}

const C = { ink: "#ffffff", body: "rgba(255,255,255,.78)" };
const FADE_MS = 350;

/** Consecutive steps with the same card show it once: the run's start and end. */
export function cardRun(steps: TimelineStep[], t: number) {
  const i = steps.findIndex((s) => t >= s.startMs && t < s.endMs);
  const card = steps[i]?.card;
  if (!card) return null;
  const same = (s?: TimelineStep) =>
    !!s?.card && JSON.stringify(s.card) === JSON.stringify(card);
  let a = i;
  let b = i;
  while (same(steps[a - 1])) a--;
  while (same(steps[b + 1])) b++;
  return { card, start: steps[a].startMs, end: steps[b].endMs };
}

export function TitleCard({
  card,
  ms,
  left,
  render,
}: {
  card: Card;
  ms: number;
  left: number;
  render: RenderConfig;
}) {
  const accent = render.cardAccent;
  const opacity = clamp(Math.min(ms, left) / FADE_MS, 0, 1);
  const rise = (at: number) => {
    const p = ease(clamp((ms - at) / 500, 0, 1));
    return { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
  };
  return (
    <AbsoluteFill
      style={{
        opacity,
        background: `radial-gradient(circle at 80% 10%, rgba(255,255,255,.12) 0%, transparent 55%), ${render.cardBg}`,
        fontFamily: render.font,
        justifyContent: "center",
        padding: "0 180px",
      }}
    >
      {card.eyebrow && (
        <div
          style={{
            ...rise(100),
            color: accent,
            filter: "brightness(1.6)",
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          {card.eyebrow}
        </div>
      )}
      <div
        style={{
          ...rise(200),
          color: C.ink,
          fontSize: card.lines?.length ? 76 : 96,
          fontWeight: 700,
          lineHeight: 1.12,
          maxWidth: 1500,
        }}
      >
        {card.title}
      </div>
      <div
        style={{
          ...rise(250),
          width: 120,
          height: 8,
          borderRadius: 4,
          background: accent,
          margin: "44px 0",
        }}
      />
      {card.lines?.map((line, i) => (
        <div
          key={line}
          style={{
            ...rise(600 + i * 450),
            display: "flex",
            alignItems: "center",
            gap: 28,
            color: C.body,
            fontSize: 44,
            lineHeight: 1.3,
            marginBottom: 22,
          }}
        >
          <span
            style={{
              flex: "none",
              width: 44,
              height: 44,
              borderRadius: 22,
              background: card.check ? accent : "transparent",
              border: card.check ? "none" : `4px solid ${accent}`,
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            {card.check ? "✓" : ""}
          </span>
          {line}
        </div>
      ))}
    </AbsoluteFill>
  );
}

/** The last captured frame at or before recording time t (frames are in time order). */
export function frameAt(frames: Frame[], t: number) {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].ms <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

/** music: a file in the output folder (copied there from render.music). */
/** posterMs (promo): output time shown as frame 0, the thumbnail on every platform. */
export type DemoProps = {
  timeline: Timeline;
  render: RenderConfig;
  music?: string;
  posterMs?: number;
};

export const Demo = ({ timeline, render, music }: DemoProps) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const k = W / timeline.viewport.width;
  const cuts = cutsOf(timeline, render.maxPauseMs);
  const toFrame = (recMs: number) =>
    Math.round((toOutput(timeline, cuts, recMs) / 1000) * fps);
  const t = toRecording(timeline, cuts, (frame / fps) * 1000);

  const { scale, fx, fy } = camera(timeline.steps, t, k, W, H, render);
  // Keep the focus point centred, without showing past the frame's edges.
  const tx = clamp(W / 2 - fx * scale, W - W * scale, 0);
  const ty = clamp(H / 2 - fy * scale, H - H * scale, 0);
  const caption = timeline.steps.find(
    (s) => s.narration && t >= s.startMs && t < s.endMs,
  );
  const run = cardRun(timeline.steps, t);
  const toMs = (recMs: number) => toOutput(timeline, cuts, recMs);
  const spoken = timeline.steps
    .filter((s) => s.audio)
    .map((s) => ({ start: toMs(s.startMs), end: toMs(s.startMs) + s.audioMs }));
  const totalMs = outputLength(timeline, cuts);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      >
        <Img
          src={staticFile(`frames/${frameAt(timeline.frames, t).file}`)}
          style={{ width: W, height: H }}
        />
      </AbsoluteFill>
      {timeline.steps.map(
        (s) =>
          s.audio && (
            <Sequence key={s.index} from={toFrame(s.startMs)} layout="none">
              <Audio src={staticFile(s.audio)} />
            </Sequence>
          ),
      )}
      {music && (
        <Audio
          src={staticFile(music)}
          loop
          // Not the callback's frame: it restarts on every loop.
          volume={() =>
            musicVolume((frame / fps) * 1000, spoken, totalMs, render.musicVolume)
          }
        />
      )}
      {/* Cards and captions are laid out at 1920×1080 and scaled to the output size. */}
      <AbsoluteFill
        style={{
          width: 1920,
          height: 1080,
          transformOrigin: "0 0",
          transform: `scale(${W / 1920})`,
        }}
      >
        {run && (
          <TitleCard
            card={run.card}
            ms={t - run.start}
            left={run.end - t}
            render={render}
          />
        )}
        {caption && (
          <AbsoluteFill
            style={{
              justifyContent: "flex-end",
              alignItems: "center",
              paddingBottom: 56,
            }}
          >
            <div
              style={{
                maxWidth: 1920 * 0.72,
                padding: "14px 28px",
                borderRadius: 14,
                background: "rgba(10, 20, 20, 0.78)",
                color: "#fff",
                fontFamily: render.font,
                fontSize: 38,
                lineHeight: 1.3,
                textAlign: "center",
              }}
            >
              {caption.narration}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
