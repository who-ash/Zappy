// Injected into every page: a visible cursor and a click ripple, driven by
// the recorder through window.__demo. Kept as a string so it runs unbundled.
/** `color`: the ripple, as #rrggbb. `blur`: CSS selectors to blur (private data). */
export const cursorScript = (color: string, blur: string[] = []) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const blurCss = blur.length
    ? `${blur.join(", ")} { filter: blur(14px) !important; }`
    : "";
  return `(() => {
  if (window.__demo) return;
  const css = \`
    #__demo-cursor { position: fixed; left: 0; top: 0; width: 34px; height: 34px;
      z-index: 2147483647; pointer-events: none; will-change: transform;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .__demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none;
      width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
      border: 3px solid rgba(${r},${g},${b},.9); background: rgba(${r},${g},${b},.25);
      animation: __demo-ripple 600ms ease-out forwards; }
    @keyframes __demo-ripple { to { transform: scale(4.5); opacity: 0; } }
    nextjs-portal { display: none !important; } /* Next.js dev badge */\` + ${JSON.stringify(blurCss)};
  // Styles go in as early as possible (often before <head> exists), so the dev
  // badge stays hidden while a streamed page loads; mount() rechecks.
  const style = document.createElement("style");
  style.textContent = css;
  const addStyle = () => {
    const root = document.head || document.documentElement;
    if (root && !style.isConnected) root.appendChild(style);
  };
  addStyle();
  let x = innerWidth / 2, y = innerHeight / 2, el;
  const mount = () => {
    addStyle();
    if (el && el.isConnected) return;
    el = document.createElement("div");
    el.id = "__demo-cursor";
    el.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2l16 11-7 1.5L9.5 22z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    el.style.transform = \`translate(\${x - 4}px, \${y - 2}px)\`;
    document.body.appendChild(el);
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  window.__demo = {
    set(nx, ny) { mount(); x = nx; y = ny; el.style.transform = \`translate(\${x - 4}px, \${y - 2}px)\`; },
    move(nx, ny, ms) {
      mount();
      const fx = x, fy = y, t0 = performance.now();
      return new Promise((done) => {
        const frame = (now) => {
          const p = Math.min(1, (now - t0) / ms), e = ease(p);
          window.__demo.set(fx + (nx - fx) * e, fy + (ny - fy) * e);
          p < 1 ? requestAnimationFrame(frame) : done();
        };
        requestAnimationFrame(frame);
      });
    },
    ripple(rx, ry) {
      const r = document.createElement("div");
      r.className = "__demo-ripple";
      r.style.left = rx + "px";
      r.style.top = ry + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
  };
  if (document.body) mount();
  else addEventListener("DOMContentLoaded", mount);
})();`;
};
