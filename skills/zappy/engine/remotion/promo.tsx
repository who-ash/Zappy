// A short, music-led ad: the recorded app in a floating window on a brand
// background, kinetic headlines above it, stickers pinned to what's clicked,
// steps sped up and cut on the beat.
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { RenderConfig } from "../src/defaults";
import { musicVolume } from "../src/music";
import { promoAt, promoLength, promoSegments, type Seg } from "../src/promo";
import type { TimelineStep } from "../src/record";
import type { Sticker } from "../src/spec";
import { camera, cardRun, type DemoProps, frameAt, TitleCard } from "./demo";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = Easing.out(Easing.cubic);
const pop = Easing.out(Easing.back(1.8));
/** 0→1 over `ms`, starting `at` ms into the moment. */
const prog = (ms: number, at: number, dur: number, fn = ease) =>
  fn(clamp((ms - at) / dur, 0, 1));

/** The latest headline at or before step i, and when it came in (output ms). */
function headlineAt(steps: TimelineStep[], segs: Seg[], i: number) {
  for (let j = i; j >= 0; j--)
    if (steps[j].headline != null) return { text: steps[j].headline!, from: segs[j].outStart };
  return null;
}

function Headline({ text, ms, size, font }: { text: string; ms: number; size: number; font: string }) {
  return (
    <div
      style={{
        fontFamily: font,
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: -size * 0.02,
        color: "#fff",
        textAlign: "center",
        textWrap: "balance",
      }}
    >
      {text.split(/\s+/).map((w, i) => {
        const p = prog(ms, i * 70, 420, pop);
        return (
          <span
            key={`${w}-${i}`}
            style={{
              display: "inline-block",
              marginRight: size * 0.25,
              opacity: clamp(p * 2, 0, 1),
              transform: `translateY(${(1 - p) * size * 0.5}px) scale(${0.85 + 0.15 * p})`,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

type Rect = { x: number; y: number; w: number; h: number };

/** A mark drawn over the element (r, in output px), animating in from ms = 0. */
function StickerMark({ s, r, ms, u, W, accent, font }: {
  s: Sticker; r: Rect; ms: number; u: number; W: number; accent: string; font: string;
}) {
  const draw = prog(ms, 0, 500); // stroke draw-on
  const p = prog(ms, 0, 450, pop); // pop-in
  const stroke = { fill: "none", stroke: accent, strokeWidth: 8 * u, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const dash = (len: number) => ({ strokeDasharray: len, strokeDashoffset: len * (1 - draw) });
  const label = (text: string, x: number, y: number, rot: number) => (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${p})`,
        background: accent,
        color: "#fff",
        fontFamily: font,
        fontWeight: 800,
        fontSize: 34 * u,
        padding: `${10 * u}px ${22 * u}px`,
        borderRadius: 999,
        whiteSpace: "nowrap",
        boxShadow: `0 ${8 * u}px ${24 * u}px rgba(0,0,0,.3)`,
      }}
    >
      {text}
    </div>
  );
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  if (s.kind === "circle") {
    const rx = r.w / 2 + 28 * u;
    const ry = r.h / 2 + 22 * u;
    const len = Math.PI * (rx + ry) * 1.15;
    return (
      <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width="100%" height="100%">
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(-4 ${cx} ${cy})`} {...stroke} style={dash(len)} />
      </svg>
    );
  }
  if (s.kind === "underline") {
    const y = r.y + r.h + 16 * u;
    const n = Math.max(2, Math.round(r.w / (40 * u)));
    const d = Array.from({ length: n + 1 }, (_, i) =>
      `${i ? "L" : "M"}${r.x + (r.w * i) / n},${y + (i % 2 ? 7 : -7) * u}`).join(" ");
    return (
      <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width="100%" height="100%">
        <path d={d} {...stroke} style={dash(r.w * 1.4)} />
      </svg>
    );
  }
  if (s.kind === "arrow") {
    // From a label off to one side (whichever has room) to the element's edge.
    const left = r.x > W / 2;
    const head = { x: left ? r.x - 12 * u : r.x + r.w + 12 * u, y: cy };
    const tail = { x: head.x + (left ? -230 : 230) * u, y: head.y - 150 * u };
    const ctrl = { x: tail.x, y: head.y };
    const a = Math.atan2(head.y - ctrl.y, head.x - ctrl.x);
    const wing = (d: number) => `${head.x - 30 * u * Math.cos(a + d)},${head.y - 30 * u * Math.sin(a + d)}`;
    return (
      <>
        <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width="100%" height="100%">
          <path d={`M${tail.x},${tail.y} Q${ctrl.x},${ctrl.y} ${head.x},${head.y}`} {...stroke} style={dash(400 * u)} />
          {draw > 0.95 && <path d={`M${wing(0.5)} L${head.x},${head.y} L${wing(-0.5)}`} {...stroke} />}
        </svg>
        {s.text && label(s.text, tail.x, tail.y - 30 * u, left ? -4 : 4)}
      </>
    );
  }
  if (s.kind === "badge") return label(s.text ?? "New", r.x + r.w, r.y, 8);
  // emoji
  return (
    <div
      style={{
        position: "absolute",
        left: r.x + r.w,
        top: r.y,
        fontSize: 96 * u,
        transform: `translate(-50%, -60%) rotate(${12 - 12 * p}deg) scale(${p})`,
      }}
    >
      {s.text ?? "✨"}
    </div>
  );
}

export const Promo = ({ timeline, render, music, posterMs }: DemoProps) => {
  const { fps, width: W, height: H } = useVideoConfig();
  const now = useCurrentFrame();
  // Frame 0 shows the poster frame, so every platform's thumbnail is a good one.
  const frame = now === 0 && posterMs != null ? Math.round((posterMs / 1000) * fps) : now;
  const outMs = (frame / fps) * 1000;
  const { steps, viewport } = timeline;
  const segs = promoSegments(steps, render.bpm);
  const { seg, rec: t } = promoAt(segs, outMs);
  const step = steps[seg.i];

  const u = Math.min(W, H) / 1080; // layout unit: 1 px at 1080p
  const winW = W * (W > H ? 0.7 : 0.9);
  const winH = (winW * viewport.height) / viewport.width;
  const winX = (W - winW) / 2;
  const winY = (H - winH) * 0.68; // headline sits in the space above
  const k = winW / viewport.width;
  const { scale, fx, fy } = camera(steps, t, k, winW, winH, render);
  const tx = clamp(winW / 2 - fx * scale, winW - winW * scale, 0);
  const ty = clamp(winH / 2 - fy * scale, winH - winH * scale, 0);
  const rise = prog(outMs, 0, 700); // the window floats up at the start

  const head = headlineAt(steps, segs, seg.i);
  const run = cardRun(steps, t);
  const box = step.sticker && step.box;
  const rect = box && {
    x: winX + tx + box.x * k * scale,
    y: winY + ty + box.y * k * scale,
    w: box.width * k * scale,
    h: box.height * k * scale,
  };
  const totalMs = promoLength(segs);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 20% 0%, ${render.cardAccent}55 0%, transparent 50%), radial-gradient(circle at 90% 100%, ${render.cardAccent}33 0%, transparent 45%), ${render.cardBg}`,
      }}
    >
      {head?.text && (
        <AbsoluteFill
          style={{
            height: winY,
            padding: `0 ${60 * u}px`,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Headline
            key={head.from}
            text={head.text}
            ms={outMs - head.from}
            size={Math.min(winY * 0.34, 110 * u)}
            font={render.font}
          />
        </AbsoluteFill>
      )}
      <div
        style={{
          position: "absolute",
          left: winX,
          top: winY + (1 - rise) * 80 * u,
          width: winW,
          height: winH,
          opacity: rise,
          borderRadius: 22 * u,
          overflow: "hidden",
          boxShadow: `0 ${30 * u}px ${90 * u}px rgba(0,0,0,.5), 0 0 0 ${2 * u}px rgba(255,255,255,.08)`,
          background: "#fff",
        }}
      >
        <div
          style={{
            transformOrigin: "0 0",
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
          <Img src={staticFile(`frames/${frameAt(timeline.frames, t).file}`)} style={{ width: winW, height: winH }} />
        </div>
      </div>
      {rect && step.sticker && (
        <StickerMark
          s={step.sticker}
          r={rect}
          ms={outMs - seg.outStart - 250}
          u={u}
          W={W}
          accent={render.cardAccent}
          font={render.font}
        />
      )}
      {run && (
        <AbsoluteFill style={{ width: W / u, height: H / u, transformOrigin: "0 0", transform: `scale(${u})` }}>
          <TitleCard card={run.card} ms={t - run.start} left={run.end - t} render={render} />
        </AbsoluteFill>
      )}
      {music && (
        <Audio
          src={staticFile(music)}
          loop
          volume={() => musicVolume((now / fps) * 1000, [], totalMs, render.musicVolume)}
        />
      )}
    </AbsoluteFill>
  );
};
