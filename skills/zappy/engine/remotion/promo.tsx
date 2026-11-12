// A short brand ad: the recorded app in a floating window on a calm brand
// background, one headline at a time, quiet marks on what matters, a small
// logo bug, and an end card with one call to action. One accent colour, one
// easing (fast out, no overshoot), and a soft push at every scene change.
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  continueRender,
  delayRender,
} from "remotion";
import { useEffect, useState } from "react";
import { musicVolume } from "../src/music";
import { promoAt, promoLength, promoSegmentsOf, type Seg } from "../src/promo";
import { type Palette, palette } from "../src/theme";
import type { Timeline, TimelineStep } from "../src/record";
import type { Card, Sticker } from "../src/spec";
import { camera, type DemoProps, frameAt } from "./demo";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// One curve everywhere: a strong ease-out, no overshoot.
const out = Easing.bezier(0.16, 1, 0.3, 1);
const prog = (ms: number, at: number, dur: number) => out(clamp((ms - at) / dur, 0, 1));
const TRANSITION_MS = 600;

type Colors = Palette;

// The brand's two weights (text, headings), set once per frame by Promo before
// its children render. ponytail: module state, fine for one composition per bundle.
let WR = 500;
let WB = 700;

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Fade-up, the single entrance used for everything. */
const fadeUp = (ms: number, at: number, u: number, dist = 14): CSSProperties => {
  const p = prog(ms, at, 420);
  return { opacity: p, transform: `translateY(${(1 - p) * dist * u}px)` };
};

/** Words in *stars* (one word or several) take the highlight colour. Words fade up 50 ms apart. */
function Words({ text, ms, u, c }: { text: string; ms: number; u: number; c: Colors }) {
  let open = false;
  return (
    <>
      {text.split(/\s+/).map((raw, i) => {
        if (raw.startsWith("*")) open = true;
        const hi = open;
        if (/\*[.,!?]?$/.test(raw)) open = false;
        return (
          <span key={`${raw}-${i}`} style={{ display: "inline-block", marginRight: "0.24em", color: hi ? c.hi : undefined, ...fadeUp(ms, i * 50, u, 16) }}>
            {raw.replace(/\*/g, "")}
          </span>
        );
      })}
    </>
  );
}

/** The newest headline shown so far in output order, and when it came in. */
function headlineAt(steps: TimelineStep[], segs: Seg[], k: number) {
  for (let j = k; j >= 0; j--) {
    const h = steps[segs[j].i].headline;
    if (h != null && segs[j].outEnd > segs[j].outStart) return { text: h, from: segs[j].outStart };
  }
  return null;
}

function prevVisible(segs: Seg[], k: number) {
  for (let j = k - 1; j >= 0; j--) if (segs[j].outEnd > segs[j].outStart) return segs[j];
  return null;
}

type Rect = { x: number; y: number; w: number; h: number };

/** A quiet label: dark glass, thin accent edge. */
function Label({ text, x, y, ms, u, c, font, anchor = "center" }: {
  text: string; x: number; y: number; ms: number; u: number; c: Colors; font: string; anchor?: "center" | "left" | "right";
}) {
  const p = prog(ms, 0, 420);
  const tx = anchor === "center" ? "-50%" : anchor === "right" ? "-100%" : "0";
  return (
    <div style={{
      position: "absolute", left: x, top: y, opacity: p,
      transform: `translate(${tx}, calc(-50% + ${(1 - p) * 10 * u}px))`,
      display: "flex", alignItems: "center", gap: 10 * u,
      background: "rgba(10, 18, 18, 0.82)", color: "#fff", fontFamily: font, fontWeight: WR,
      fontSize: 24 * u, padding: `${11 * u}px ${18 * u}px`, borderRadius: 12 * u,
      border: `${1.5 * u}px solid ${rgba(c.hi, 0.55)}`, boxShadow: `0 ${12 * u}px ${30 * u}px rgba(0,0,0,.3)`,
      whiteSpace: "nowrap",
    }}>
      {text}
    </div>
  );
}

function Mark({ s, r, ms, u, W, c, font }: { s: Sticker; r: Rect; ms: number; u: number; W: number; c: Colors; font: string }) {
  const draw = prog(ms, 0, 650);
  const stroke = { fill: "none", stroke: c.hi, strokeWidth: 4 * u, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const dash = (len: number) => ({ strokeDasharray: len, strokeDashoffset: len * (1 - draw) });
  const svg = (children: ReactNode) => (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width="100%" height="100%">{children}</svg>
  );
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (s.kind === "circle") {
    const rx = r.w / 2 + 22 * u;
    const ry = r.h / 2 + 16 * u;
    return svg(<ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...stroke} style={dash(Math.PI * (rx + ry) * 1.1)} />);
  }
  if (s.kind === "underline")
    return svg(<path d={`M${r.x},${r.y + r.h + 12 * u} L${r.x + r.w},${r.y + r.h + 12 * u}`} {...stroke} style={dash(r.w)} />);
  if (s.kind === "arrow") {
    // A short straight leader from a label to the element.
    const left = r.x > W / 2;
    const end = { x: left ? r.x - 10 * u : r.x + r.w + 10 * u, y: cy };
    const start = { x: end.x + (left ? -90 : 90) * u, y: end.y };
    return (
      <>
        {svg(<path d={`M${start.x},${start.y} L${end.x},${end.y}`} {...stroke} style={dash(90 * u)} />)}
        {s.text && <Label text={s.text} x={start.x + (left ? -8 : 8) * u} y={start.y} ms={ms - 150} u={u} c={c} font={font} anchor={left ? "right" : "left"} />}
      </>
    );
  }
  if (s.kind === "badge") return <Label text={s.text ?? "New"} x={r.x + r.w} y={r.y - 34 * u} ms={ms} u={u} c={c} font={font} anchor="right" />;
  return <div style={{ position: "absolute", left: r.x + r.w + 8 * u, top: r.y - 8 * u, fontSize: 52 * u, ...fadeUp(ms, 0, u) }}>{s.text ?? "✨"}</div>;
}

/** Up to a few short notes beside the window: first on the left, then the right. */
function Chips({ chips, ms, u, win, c, font }: { chips: string[]; ms: number; u: number; win: Rect; c: Colors; font: string }) {
  return (
    <>
      {chips.map((text, i) => {
        const right = i % 2 === 1;
        return (
          <Label
            key={text} text={text} ms={ms - 300 - i * 150} u={u} c={c} font={font}
            x={right ? win.x + win.w + 28 * u : win.x - 28 * u}
            y={win.y + win.h * (right ? 0.62 : 0.3)}
            anchor={right ? "right" : "left"}
          />
        );
      })}
    </>
  );
}

function Logo({ tl, size, u, font, ms, ink = "#fff" }: { tl: Timeline; size: number; u: number; font: string; ms: number; ink?: string }) {
  if (!tl.brand) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.32, ...fadeUp(ms, 0, u, 8) }}>
      {(ink === "#ffffff" && tl.brand.logoDark ? tl.brand.logoDark : tl.brand.logo) && (
        <Img src={staticFile((ink === "#ffffff" && tl.brand.logoDark ? tl.brand.logoDark : tl.brand.logo)!)} style={{ height: size, width: "auto" }} />
      )}
      <span style={{ fontFamily: font, fontWeight: WB, fontSize: size * 0.62, color: ink, letterSpacing: -size * 0.01 }}>{tl.brand.name}</span>
    </div>
  );
}

/** A full-frame card: optional emoji, eyebrow, title, then a short list, a bento grid, or the CTA. */
function PromoCard({ card, tl, ms, u, W, H, c, font }: {
  card: Card; tl: Timeline; ms: number; u: number; W: number; H: number; c: Colors; font: string;
}) {
  const tiles = card.tiles ?? [];
  const wide = W > H;
  if (card.stat) {
    // Count up the leading number ("100/100", "22%", "4"), then hold.
    const m = card.stat.value.match(/^(\d[\d,]*)(.*)$/);
    const target = m ? Number(m[1].replace(/,/g, "")) : 0;
    const n = Math.round(target * prog(ms, 100, 900));
    const shown = m ? `${n.toLocaleString("en-IN")}${m[2]}` : card.stat.value;
    const size = (wide ? 300 : 230) * u;
    return (
      <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${W * 0.08}px`, fontFamily: font }}>
        {card.eyebrow && <div style={{ color: c.hi, fontSize: 34 * u, fontWeight: WB, letterSpacing: 2 * u, marginBottom: 10 * u, ...fadeUp(ms, 0, u) }}>{card.eyebrow}</div>}
        <div style={{ color: c.hi, fontSize: size, fontWeight: WB, lineHeight: 0.9, letterSpacing: -size * 0.05, fontVariantNumeric: "tabular-nums", ...fadeUp(ms, 0, u, 30) }}>{shown}</div>
        {card.stat.label && (
          <div style={{ color: c.ink, fontSize: (wide ? 64 : 58) * u, fontWeight: WB, lineHeight: 1.1, letterSpacing: -1.5 * u, marginTop: 30 * u, maxWidth: W * 0.84 }}>
            <Words text={card.stat.label} ms={ms - 350} u={u} c={c} />
          </div>
        )}
      </AbsoluteFill>
    );
  }
  if (card.quote)
    return (
      <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${W * (wide ? 0.12 : 0.08)}px`, fontFamily: font }}>
        <div style={{ color: c.hi, fontSize: 180 * u, lineHeight: 0.6, fontWeight: WB, height: 90 * u, ...fadeUp(ms, 0, u) }}>“</div>
        <div style={{ color: c.ink, fontSize: (wide ? 54 : 50) * u, fontWeight: WR, lineHeight: 1.3, letterSpacing: -0.8 * u, maxWidth: W * 0.78, ...fadeUp(ms, 150, u, 20) }}>{card.quote.text}</div>
        {card.quote.by && <div style={{ color: rgba(c.ink, 0.6), fontSize: 28 * u, fontWeight: WR, marginTop: 34 * u, ...fadeUp(ms, 500, u) }}>— {card.quote.by}</div>}
      </AbsoluteFill>
    );
  if (card.compare) {
    const col = (side: { title: string; lines: string[] }, good: boolean, at: number) => (
      <div style={{
        flex: 1, borderRadius: 26 * u, padding: `${36 * u}px ${38 * u}px`,
        background: good ? rgba(c.hi, 0.1) : rgba(c.ink, 0.04),
        border: `${2 * u}px solid ${good ? rgba(c.hi, 0.6) : rgba(c.ink, 0.1)}`, ...fadeUp(ms, at, u, 24),
      }}>
        <div style={{ color: good ? c.hi : rgba(c.ink, 0.55), fontSize: 24 * u, fontWeight: WB, letterSpacing: 3 * u, textTransform: "uppercase", marginBottom: 26 * u }}>{side.title}</div>
        {side.lines.map((line, i) => (
          <div key={line} style={{ display: "flex", gap: 16 * u, alignItems: "baseline", color: good ? c.ink : rgba(c.ink, 0.5), fontSize: 36 * u, fontWeight: good ? WB : WR, lineHeight: 1.25, marginBottom: 18 * u, textDecoration: good ? "none" : "line-through", textDecorationColor: rgba(c.ink, 0.3), ...fadeUp(ms, at + 250 + i * 120, u) }}>
            <span style={{ color: good ? c.hi : rgba(c.ink, 0.35), textDecoration: "none", fontWeight: WB }}>{good ? "✓" : "✕"}</span>{line}
          </div>
        ))}
      </div>
    );
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `${70 * u}px ${W * 0.07}px`, fontFamily: font }}>
        {card.title && (
          <div style={{ color: c.ink, fontSize: 64 * u, fontWeight: WB, letterSpacing: -2 * u, marginBottom: 44 * u, textAlign: "center" }}>
            <Words text={card.title} ms={ms} u={u} c={c} />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: wide ? "row" : "column", gap: 28 * u, width: "100%" }}>
          {col(card.compare.left, false, 200)}
          {col(card.compare.right, true, 900)}
        </div>
      </AbsoluteFill>
    );
  }
  const cols = tiles.length ? (wide ? Math.min(3, tiles.length) : 2) : 1;
  const rem = tiles.length % cols;
  const span = (i: number) => (i === 0 && rem ? cols - rem + 1 : 1);
  const typeOnly = !tiles.length && !card.lines?.length && !card.cta;
  const titleSize = (typeOnly ? (wide ? 136 : 112) : card.cta ? 80 : tiles.length ? 60 : 84) * u;
  if (typeOnly)
    return (
      <AbsoluteFill style={{ justifyContent: "center", padding: `0 ${W * 0.08}px`, fontFamily: font }}>
        {card.eyebrow && <div style={{ color: c.hi, fontSize: 26 * u, fontWeight: WR, letterSpacing: 4 * u, textTransform: "uppercase", marginBottom: 28 * u, ...fadeUp(ms, 0, u) }}>{card.eyebrow}</div>}
        <div style={{ color: c.ink, fontSize: titleSize, fontWeight: WB, lineHeight: 0.98, letterSpacing: -titleSize * 0.04, maxWidth: W * 0.84 }}>
          <Words text={card.title ?? ""} ms={ms - 100} u={u} c={c} />
        </div>
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `${80 * u}px ${100 * u}px`, fontFamily: font, textAlign: "center" }}>
      {card.cta && <div style={{ marginBottom: 40 * u }}><Logo tl={tl} size={64 * u} u={u} font={font} ms={ms} ink={c.ink} /></div>}
      {card.emoji && <div style={{ fontSize: 60 * u, lineHeight: 1, marginBottom: 22 * u, ...fadeUp(ms, 0, u) }}>{card.emoji}</div>}
      {card.eyebrow && (
        <div style={{ color: c.hi, fontSize: 22 * u, fontWeight: WR, letterSpacing: 4 * u, textTransform: "uppercase", marginBottom: 20 * u, ...fadeUp(ms, 80, u) }}>
          {card.eyebrow}
        </div>
      )}
      <div style={{ color: c.ink, fontSize: titleSize, fontWeight: WB, lineHeight: 1.08, letterSpacing: -titleSize * 0.025, maxWidth: W * 0.8, textWrap: "balance" }}>
        <Words text={card.title ?? ""} ms={ms - 160} u={u} c={c} />
      </div>
      {!tiles.length && card.lines?.length ? (
        <div style={{ display: "flex", flexDirection: wide ? "row" : "column", gap: (wide ? 40 : 18) * u, marginTop: 36 * u }}>
          {card.lines.map((line, i) => (
            <div key={line} style={{ display: "flex", alignItems: "center", gap: 12 * u, color: rgba(c.ink, 0.78), fontSize: 30 * u, fontWeight: WR, ...fadeUp(ms, 600 + i * 60, u) }}>
              <span style={{ color: c.hi, fontWeight: WB }}>✓</span>{line}
            </div>
          ))}
        </div>
      ) : null}
      {tiles.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 18 * u, marginTop: 44 * u, width: W * (wide ? 0.74 : 0.86), textAlign: "left" }}>
          {tiles.map((t, i) => (
            <div key={t.title} style={{
              gridColumn: `span ${span(i)}`, borderRadius: 20 * u, padding: `${26 * u}px ${28 * u}px`,
              background: rgba(c.ink, c.light ? 0.035 : 0.045), border: `${1.5 * u}px solid ${rgba(c.ink, c.light ? 0.1 : 0.1)}`,
              display: "flex", alignItems: "center", gap: 20 * u, ...fadeUp(ms, 500 + i * 60, u, 18),
            }}>
              <div style={{ flex: "none", width: 64 * u, height: 64 * u, borderRadius: 16 * u, background: rgba(c.hi, 0.12), border: `${1.5 * u}px solid ${rgba(c.hi, 0.25)}`, display: "grid", placeItems: "center", fontSize: 32 * u }}>{t.emoji}</div>
              <div>
                <div style={{ color: c.ink, fontSize: 28 * u, fontWeight: WR, lineHeight: 1.15 }}>{t.title}</div>
                {t.text && <div style={{ color: rgba(c.ink, 0.6), fontSize: 21 * u, marginTop: 6 * u, lineHeight: 1.3 }}>{t.text}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {card.cta && (
        <div style={{ marginTop: 48 * u, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * u, ...fadeUp(ms, 700, u) }}>
          <div style={{ background: c.hi, color: c.onHi, fontWeight: WB, fontSize: 32 * u, padding: `${18 * u}px ${44 * u}px`, borderRadius: 999 }}>{card.cta.text}</div>
          {card.cta.url && <div style={{ color: rgba(c.ink, 0.7), fontSize: 26 * u, fontWeight: WR }}>{card.cta.url}</div>}
        </div>
      )}
    </AbsoluteFill>
  );
}

export const Promo = ({ timeline, render, music, posterMs }: DemoProps) => {
  const { fps, width: W, height: H } = useVideoConfig();
  const now = useCurrentFrame();
  // Frame 0 shows the poster frame, so every platform's thumbnail is a good one.
  const frame = now === 0 && posterMs != null ? Math.round((posterMs / 1000) * fps) : now;
  const outMs = (frame / fps) * 1000;
  const { steps, viewport } = timeline;
  const c: Colors = palette(timeline.theme, render);
  [WR, WB] = timeline.brand?.weights ?? [500, 700];
  // The brand font, loaded before the first frame is captured.
  const fontFile = timeline.brand?.font;
  const [fontWait] = useState(() => (fontFile ? delayRender("brand font") : null));
  useEffect(() => {
    if (fontWait == null || !fontFile) return;
    const face = new FontFace(timeline.brand!.fontFamily!, `url(${staticFile(fontFile)})`);
    face.load().then((f) => document.fonts.add(f)).finally(() => continueRender(fontWait));
  }, [fontWait, fontFile, timeline.brand]);
  const segs = promoSegmentsOf(timeline, render);
  const { seg } = promoAt(segs, outMs);
  const k = segs.indexOf(seg);

  const u = Math.min(W, H) / 1080;
  const wide = W > H;
  // Vertical keeps text out of the top 14% and bottom 35% (Meta's Reels safe zone).
  // TikTok's buttons cover the right edge of a vertical frame: keep content left of them.
  const safeR = !wide && timeline.safe === "tiktok" ? W * 0.14 : 0;
  // Title-safe inset for the logo bug and note (5%), and Reels' top 14% in vertical.
  const insetX = W * 0.05;
  const insetY = wide ? H * 0.05 : H * 0.15 - 30 * (Math.min(W, H) / 1080);
  const winW = W * (wide ? 0.66 : 0.88) - safeR;
  const winH = (winW * viewport.height) / viewport.width;
  const winX = (W - safeR - winW) / 2;
  const winY = wide ? (H - winH) * 0.72 : H * 0.36;
  const headTop = wide ? 0 : H * 0.17;
  const kk = winW / viewport.width;
  const font = timeline.brand?.fontFamily ? `"${timeline.brand.fontFamily}", ${render.font}` : render.font;

  const scene = (s: Seg, at: number) => {
    const p = clamp((at - s.outStart) / (s.outEnd - s.outStart), 0, 1);
    const t = s.recStart + p * (s.recEnd - s.recStart);
    const step = steps[s.i];
    const ms = at - s.outStart;
    if (step.card)
      return (
        <AbsoluteFill style={{ right: safeR, width: W - safeR }}>
          <PromoCard card={step.card} tl={timeline} ms={ms} u={u} W={W - safeR} H={H} c={c} font={font} />
        </AbsoluteFill>
      );
    if (step.layout === "full") return full(step, t, p);
    if ((step.layout === "split" || step.layout === "tilt") && step.box) return split(step, t, ms, p);
    const { scale, fx, fy } = camera(steps, t, kk, winW, winH, render);
    const tx = clamp(winW / 2 - fx * scale, winW - winW * scale, 0);
    const ty = clamp(winH / 2 - fy * scale, winH - winH * scale, 0);
    const box = step.sticker && step.box;
    const rect = box && { x: winX + tx + box.x * kk * scale, y: winY + ty + box.y * kk * scale, w: box.width * kk * scale, h: box.height * kk * scale };
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: winX, top: winY, width: winW, height: winH, borderRadius: 16 * u, overflow: "hidden", background: "#fff", boxShadow: `0 ${36 * u}px ${90 * u}px rgba(0,0,0,${c.light ? 0.16 : 0.45}), 0 0 0 ${1.5 * u}px ${c.light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)"}` }}>
          <div style={{ transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
            <Img src={staticFile(`frames/${frameAt(timeline.frames, t).file}`)} style={{ width: winW, height: winH }} />
          </div>
        </div>
        {step.chips && <Chips chips={step.chips} ms={ms} u={u} win={{ x: winX, y: winY, w: winW, h: winH }} c={c} font={font} />}
        {rect && step.sticker && <Mark s={step.sticker} r={rect} ms={ms - 300} u={u} W={W} c={c} font={font} />}
      </AbsoluteFill>
    );
  };

  /**
   * Big type on one side, a tight crop of the step's element on the other,
   * pushing in slowly. Vertical stacks them: type above, crop below.
   */
  const split = (step: TimelineStep, t: number, ms: number, p: number) => {
    const b = step.box!;
    const cw = wide ? W * 0.52 : W * 0.88 - safeR;
    let ch = wide ? H * 0.74 : H * 0.3; // vertical: ends above Reels' bottom 35%
    // Crop: the element plus room around it, at the panel's shape, inside the page.
    const pad = step.pad ?? 1.5;
    const rw = Math.min(viewport.width, Math.max(b.width * pad, (b.height * pad * cw) / ch));
    let rh = (rw * ch) / cw;
    // Too tall for the page at this shape (a wide element): keep its whole
    // width and make the panel shorter instead of cutting the element off.
    if (rh > viewport.height) {
      rh = viewport.height;
      ch = (cw * rh) / rw;
    }
    const cx0 = wide ? W * 0.43 : (W - safeR - cw) / 2;
    const cy0 = wide ? (H - ch) / 2 : H * 0.36;
    const rx = clamp(b.x + b.width / 2 - rw / 2, 0, viewport.width - rw);
    const ry = clamp(b.y + b.height / 2 - rh / 2, 0, viewport.height - rh);
    const s = (cw / rw) * (1 + 0.04 * p); // slow push-in
    const imgW = viewport.width * s;
    const imgH = viewport.height * s;
    const ox = -(rx + rw / 2) * s + cw / 2;
    const oy = -(ry + rh / 2) * s + ch / 2;
    const headSize = (wide ? 84 : 78) * u;
    const head = headlineAt(steps, segs, k);
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: cx0, top: cy0, width: cw, height: ch, borderRadius: 20 * u, overflow: "hidden", background: "#fff",
          // Tilt: an angled screen that slowly turns toward the viewer.
          transform: step.layout === "tilt" ? (wide ? `perspective(${2400 * u}px) rotateY(${-18 + 8 * p}deg) rotateX(${5 - 2 * p}deg)` : `perspective(${2200 * u}px) rotateX(${16 - 6 * p}deg)`) : undefined,
          boxShadow: `0 ${40 * u}px ${100 * u}px rgba(0,0,0,${c.light ? 0.18 : 0.5}), 0 0 0 ${1.5 * u}px ${c.light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)"}` }}>
          <Img src={staticFile(`frames/${frameAt(timeline.frames, t).file}`)} style={{ position: "absolute", left: ox, top: oy, width: imgW, height: imgH, maxWidth: "none" }} />
        </div>
        {head?.text && (
          <div style={{ position: "absolute", left: wide ? W * 0.07 : W * 0.08, top: wide ? 0 : H * 0.17, width: wide ? W * 0.33 : W * 0.84 - safeR, height: wide ? H : H * 0.17, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {step.counter && <Counter text={step.counter} ms={ms} />}
            <div style={{ fontFamily: font, fontSize: headSize, fontWeight: WB, lineHeight: 1.02, letterSpacing: -headSize * 0.035, color: c.ink, textAlign: "left" }}>
              <Words key={head.from} text={head.text} ms={outMs - head.from} u={u} c={c} />
            </div>
          </div>
        )}
      </AbsoluteFill>
    );
  };

  const Counter = ({ text, ms }: { text: string; ms: number }) => (
    <div style={{ fontFamily: font, color: c.hi, fontSize: 34 * u, fontWeight: WB, letterSpacing: 2 * u, marginBottom: 18 * u, fontVariantNumeric: "tabular-nums", ...fadeUp(ms, 0, u) }}>{text}</div>
  );

  /** The step's footage fills the frame (cropped around its element, or centred), headline as a caption. */
  const full = (step: TimelineStep, t: number, p: number) => {
    const b = step.box;
    const pad = step.pad ?? 2;
    let rw: number;
    let rh: number;
    if (b) {
      rw = Math.min(viewport.width, Math.max(b.width * pad, (b.height * pad * W) / H));
      rh = (rw * H) / W;
      if (rh > viewport.height) { rh = viewport.height; rw = (rh * W) / H; }
    } else {
      rh = Math.min(viewport.height, (viewport.width * H) / W);
      rw = (rh * W) / H;
    }
    const cx = b ? b.x + b.width / 2 : viewport.width / 2;
    const cy = b ? b.y + b.height / 2 : viewport.height / 2;
    // Vertical captions sit at the top, so the element sits lower (62% down).
    const ay = wide ? 0.5 : 0.62;
    const rx = clamp(cx - rw / 2, 0, viewport.width - rw);
    const ry = clamp(cy - rh * ay, 0, viewport.height - rh);
    const s = (W / rw) * (1 + 0.06 * p); // slow push-in
    const head = headlineAt(steps, segs, k);
    const headSize = (wide ? 76 : 72) * u;
    return (
      <AbsoluteFill style={{ background: "#fff", overflow: "hidden" }}>
        <Img src={staticFile(`frames/${frameAt(timeline.frames, t).file}`)} style={{ position: "absolute", left: -(rx + rw / 2) * s + W / 2, top: -(ry + rh * ay) * s + H * ay, width: viewport.width * s, height: viewport.height * s, maxWidth: "none" }} />
        {head?.text && (
          <AbsoluteFill style={{
            justifyContent: wide ? "flex-end" : "flex-start",
            padding: wide ? `0 ${W * 0.06}px ${H * 0.08}px` : `${H * 0.19}px ${W * 0.07}px 0`,
            background: wide ? `linear-gradient(to top, ${rgba(c.bg, 0.92)} 0%, ${rgba(c.bg, 0.6)} 28%, transparent 55%)` : `linear-gradient(to bottom, ${rgba(c.bg, 0.94)} 0%, ${rgba(c.bg, 0.7)} 24%, transparent 42%)`,
          }}>
            {step.counter && <Counter text={step.counter} ms={outMs - head.from} />}
            <div style={{ fontFamily: font, fontSize: headSize, fontWeight: WB, lineHeight: 1.04, letterSpacing: -headSize * 0.03, color: c.ink, maxWidth: W * 0.8 - safeR }}>
              <Words key={head.from} text={head.text} ms={outMs - head.from} u={u} c={c} />
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  };

  // A soft push at a scene change: setup steps cut between, a hook jump, or into or out of a card.
  const prev = prevVisible(segs, k);
  const into = outMs - seg.outStart;
  const change = !!prev && (prev.i !== seg.i - 1 || !!steps[prev.i].card !== !!steps[seg.i].card);
  const mode = timeline.transition ?? "push";
  const q = mode !== "cut" && change && into < TRANSITION_MS ? clamp(into / TRANSITION_MS, 0, 1) : 1;
  const qOut = out(clamp(q / 0.5, 0, 1));
  const qIn = Math.min(prev ? 1 : prog(outMs, 0, 700), out(clamp((q - 0.3) / 0.7, 0, 1)));

  const onCard = !!steps[seg.i].card;
  const lay = steps[seg.i].layout;
  const isSplit = lay === "full" || ((lay === "split" || lay === "tilt") && !!steps[seg.i].box);
  const head = onCard || isSplit ? null : headlineAt(steps, segs, k);
  const headSize = wide ? Math.min(winY * 0.32, 72 * u) : 76 * u;
  const totalMs = promoLength(segs);
  const visible = segs.filter((g) => g.outEnd > g.outStart);
  const voiced = visible.filter((g) => steps[g.i].audio);
  const spoken = voiced.map((g) => ({ start: g.outStart, end: g.outStart + steps[g.i].audioMs }));
  // Sound design: a whoosh on each scene change, a soft click as a shown click lands, a sting on the CTA.
  const sfx = visible.flatMap((g, j) => {
    const st = steps[g.i];
    const p0 = visible[j - 1];
    const events: { kind: "whoosh" | "click" | "sting"; at: number }[] = [];
    if (p0 && (p0.i !== g.i - 1 || !!steps[p0.i].card !== !!st.card)) events.push({ kind: "whoosh", at: g.outStart - 120 });
    if (!st.card && st.action === "click") events.push({ kind: "click", at: g.outStart + 60 });
    if (st.card?.cta) events.push({ kind: "sting", at: g.outStart + 150 });
    return events;
  });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 55% at 50% 0%, ${rgba(c.accent, 0.28)} 0%, transparent 70%), radial-gradient(ellipse 90% 70% at 50% 110%, rgba(0,0,0,${c.light ? 0.06 : 0.35}) 0%, transparent 70%), ${c.bg}` }}>
      {/* The logo bug (on a pill over full-frame footage) and the note sit above every scene. */}
      {head?.text && (
        <div style={{ position: "absolute", left: 0, right: safeR, top: headTop, height: winY - headTop, padding: `0 ${70 * u}px`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: font, fontSize: headSize, fontWeight: WB, lineHeight: 1.1, letterSpacing: -headSize * 0.025, color: c.ink, textAlign: "center", textWrap: "balance" }}>
            {steps[seg.i].counter && <Counter text={steps[seg.i].counter!} ms={outMs - head.from} />}
            <Words key={head.from} text={head.text} ms={outMs - head.from} u={u} c={c} />
          </div>
        </div>
      )}
      {qOut < 1 && prev && (
        <AbsoluteFill style={{ opacity: 1 - qOut, transform: mode === "zoom" ? `scale(${1 + 0.25 * qOut})` : `translateY(${-qOut * 4}%) scale(${1 - 0.03 * qOut})` }}>
          {scene(prev, prev.outEnd - 1)}
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ opacity: qIn, transform: mode === "zoom" ? `scale(${0.85 + 0.15 * qIn})` : `translateY(${(1 - qIn) * 4}%) scale(${0.97 + 0.03 * qIn})` }}>
        {scene(seg, outMs)}
      </AbsoluteFill>
      {!onCard && timeline.brand && (
        <div style={{ position: "absolute", left: insetX, top: insetY, ...(lay === "full" && { background: rgba(c.bg, 0.88), padding: `${10 * u}px ${18 * u}px`, borderRadius: 999 }) }}>
          <Logo tl={timeline} size={38 * u} u={u} font={font} ms={outMs - 400} ink={c.ink} />
        </div>
      )}
      {!onCard && timeline.note && (
        <div style={{ position: "absolute", right: insetX + safeR, top: insetY + 6 * u, fontFamily: font, fontSize: 20 * u, fontWeight: WR, letterSpacing: 1.5 * u, textTransform: "uppercase", color: rgba(c.ink, 0.75), background: rgba(c.bg, 0.88), border: `${1.5 * u}px solid ${rgba(c.ink, 0.18)}`, padding: `${7 * u}px ${14 * u}px`, borderRadius: 999 }}>
          {timeline.note}
        </div>
      )}
      {/* Voiceover: each voiced scene's line from its start; captions burned in for sound-off viewers. */}
      {voiced.map((g) => (
        <Sequence key={`v${g.i}`} from={Math.round((g.outStart / 1000) * fps)} layout="none">
          <Audio src={staticFile(steps[g.i].audio!)} />
        </Sequence>
      ))}
      {steps[seg.i].audio && steps[seg.i].narration && outMs - seg.outStart < steps[seg.i].audioMs + 300 && (
        <div style={{ position: "absolute", left: 0, right: safeR, top: wide ? H * 0.86 : H * 0.6, display: "flex", justifyContent: "center", padding: `0 ${W * 0.06}px` }}>
          <div style={{ fontFamily: font, fontWeight: WR, fontSize: (wide ? 34 : 38) * u, lineHeight: 1.3, color: "#fff", background: "rgba(10, 16, 16, 0.82)", padding: `${10 * u}px ${22 * u}px`, borderRadius: 12 * u, textAlign: "center", maxWidth: W * 0.8 }}>
            {steps[seg.i].narration}
          </div>
        </div>
      )}
      {timeline.sfx && sfx.map((e, n) => (
        <Sequence key={`s${n}`} from={Math.max(0, Math.round((e.at / 1000) * fps))} layout="none">
          <Audio src={staticFile(`sfx/${e.kind}.wav`)} volume={e.kind === "sting" ? 0.5 : 0.35} />
        </Sequence>
      ))}
      {music && <Audio src={staticFile(music)} loop volume={() => musicVolume((now / fps) * 1000, spoken, totalMs, render.musicVolume)} />}
    </AbsoluteFill>
  );
};
