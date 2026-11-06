// Built-in settings. No Node imports: the Remotion bundle reads this too.
export const DEFAULTS = {
  // The app to record (your local dev server). Never point this at production.
  baseUrl: "http://localhost:3000",

  tts: {
    // "sarvam" (default, needs SARVAM_API_KEY) | "openai" (OPENAI_API_KEY)
    // | "none" (captions only, paced by reading speed)
    provider: "sarvam" as "openai" | "sarvam" | "none",
    openai: { model: "gpt-4o-mini-tts", voice: "alloy", speed: 1.0 },
    sarvam: {
      model: "bulbul:v3",
      speaker: "shubh",
      languageCode: "en-IN",
      pace: 1.0,
      sampleRate: 48000,
    },
  },

  record: {
    // Browser layout size (CSS px). Frames are captured at viewport × scale.
    viewport: { width: 1920, height: 1080 },
    scale: 2,
    jpegQuality: 92,
    cursorMoveMs: 700, // glide time to each target
    bufferMs: 400, // pause after each spoken line
    typeDelayMs: 45, // per key when filling
    silentMs: 1200, // length of a step with no narration
    rippleColor: "#0f6e6a", // click ripple
    // Wait until none of these are on the page before acting (loading states).
    loadingSelector: '[data-slot="skeleton"], [aria-busy="true"]',
    // A spec with `auth` that lands here means the saved session expired.
    loginPath: "/login",
  },

  render: {
    width: 3840, // 1920×1080, 2560×1440 or 3840×2160 (16:9 like the viewport)
    height: 2160,
    fps: 30,
    crf: 16, // h264 quality: lower is sharper and bigger
    zoomInMs: 600,
    zoomOutMs: 500,
    maxZoom: 2.2,
    targetFill: 0.45, // zoom until the element is about this share of the frame width
    maxPauseMs: 1500, // idle time between steps (slow loads) is cut to this
    cardBg: "#10273f", // title cards
    cardAccent: "#1f9d55",
    font: "Inter, -apple-system, system-ui, sans-serif",
  },
};

export type Config = typeof DEFAULTS;
export type RenderConfig = Config["render"];
