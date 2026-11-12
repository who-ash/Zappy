---
name: zappy
description: Turn a web app's user flows into narrated demo or tutorial videos by driving the real app in a browser — visible cursor, click ripples, auto-zoom on each step, optional AI voiceover (OpenAI or Sarvam), background music, burned-in captions plus .srt, full-screen title cards, blurring of private data and a poster image. Also makes short music-led promo/ad videos (kinetic headlines, stickers pinned to the UI, beat-cut, landscape/vertical/square). Use when someone asks for a demo video, product walkthrough, feature video, tutorial, screen recording, launch video, promo, ad or social clip of their app, or says "/zappy".
---

# Zappy

You script a flow as YAML; Zappy plays it in Chromium against the user's running app, captures every repaint as a full-quality frame, voices each line, and renders an mp4 with Remotion. You write the specs and check the result; the engine does the rest.

The engine lives next to this file: `ENGINE=<this skill's directory>/engine`. Everything below runs **from the user's project root**.

## 1. Set up (once per machine)

```bash
cd "$ENGINE" && npm install && npx playwright install chromium
```

Needs Node 22+. The first render also downloads Remotion's headless Chrome (~140 MB). Ask before installing if the user hasn't asked you to set things up.

## 2. Understand the app

Before writing anything, read the app: its routes, the pages for the flow, and the **accessible names** of the controls the flow touches (button text, field labels, link text, ARIA roles). Selectors built from what the user sees are what keep a spec working. Find out:

- the dev server URL (and that it's running — never record production);
- which flows to film, and for whom (new user, admin, …);
- whether the flow needs a signed-in user, and which;
- whether demo data must be reset first (a seed or reset script).

Ask only what you can't find in the code.

## 3. Create the workspace

```bash
"$ENGINE/zappy" init          # creates ./zappy: zappy.config.json, specs/example.yaml, .gitignore
```

Edit `zappy/zappy.config.json` (anything omitted keeps its default):

| Key | Default | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | or env `ZAPPY_BASE_URL` |
| `tts.provider` | `sarvam` | `sarvam` (needs `SARVAM_API_KEY`), `openai` (needs `OPENAI_API_KEY`), `none` = captions only, no key |
| `tts.openai` | `{ model: "gpt-4o-mini-tts", voice: "alloy", speed: 1 }` | |
| `tts.sarvam` | `{ model: "bulbul:v3", speaker: "shubh", languageCode: "en-IN", pace: 1 }` | |
| `record.viewport` | `1920×1080` | browser layout size |
| `record.scale` | `2` | frames are viewport × scale; 2 keeps text sharp when zoomed |
| `record.loadingSelector` | skeletons, `aria-busy` | waits until these are gone before each step |
| `record.loginPath` | `/login` | landing here with `auth` set = session expired |
| `record.rippleColor` | `#0f6e6a` | use the app's brand colour |
| `record.blur` | `[]` | CSS selectors blurred in every video (e.g. `[".user-email", "header .avatar"]`) |
| `render.width/height/fps` | `3840×2160`, `30` | `1920×1080` renders ~4× faster while iterating |
| `render.crf` | `16` | lower = sharper, bigger |
| `render.maxZoom` / `targetFill` | `2.2` / `0.45` | how far a step zooms toward its element |
| `render.cardBg` / `cardAccent` / `font` | navy / green / Inter | title-card look |
| `render.music` / `musicVolume` | `""` / `0.2` | background track, path relative to `zappy/`; loops, dips under the voice, fades out at the end. Use only a file the user supplies or has a licence for. |

**Environment:** Zappy reads `SARVAM_API_KEY`, `OPENAI_API_KEY` and `ZAPPY_BASE_URL` (overrides `baseUrl`). It loads env files without overriding what's already set, so the order of precedence is: shell > `zappy/.env` > `.env.local` > `.env` (project root). Never write keys into specs or the config.

The voice is Sarvam by default, so a first run needs `SARVAM_API_KEY`. If it's missing, tell the user to copy `zappy/.env.example` to `zappy/.env` and fill it in themselves (or run `! export SARVAM_API_KEY=…`). Never ask them to paste a key into the chat. If they have no key, set `"tts": { "provider": "none" }` for a captions-only video.

## 4. Sign in (only for flows behind login)

```bash
"$ENGINE/zappy" login admin http://localhost:3000/login
```

A browser opens; **the user** signs in, then presses Enter in the terminal. The session is saved to `zappy/auth/admin.json` (git-ignored). Specs use it with `auth: admin`. Don't type real passwords yourself; use a demo account.

## 5. Write a spec — one video per file

`zappy/specs/<feature>.yaml`:

```yaml
title: Invite a teammate
startUrl: /settings/members
auth: admin                    # omit to start signed out
before: npm run demo:reset     # optional shell command run first (project root)
blur: [".account-email"]       # optional CSS selectors blurred on every page
poster: 6                      # optional: poster frame time in s (default: mid-video)
steps:
  - action: wait
    value: 300
    zoom: false
    narration: Everyone on your team is listed here.
  - action: click
    selector: { role: button, name: Invite member }
    narration: To add a colleague, press Invite member.
  - action: fill
    selector: { label: Email }
    value: priya@example.com
    narration: Enter their work email.
  - action: click
    selector: { role: button, name: Send invite, exact: true }
    narration: Send it, and they get an email to join.
```

**Actions:** `goto` (value: path), `click`, `fill` (value: text, typed visibly), `select` (value: option), `hover`, `press` (value: key, e.g. `Enter`), `scroll` (value: px), `wait` (value: ms; or with a selector: wait for it to appear).

**Selectors** (only visible matches count; prefer the first that fits):
`{ role: button, name: Save }` · `{ label: Email, exact: true }` · `{ placeholder: Search… }` · `{ text: Welcome back }` · `{ testId: invite-btn }` · `{ css: "#password" }`

**Voice:** set the project default in the config (`tts.openai.voice` or `tts.sarvam.speaker`), override it for one video with a top-level `voice: nova`, or for one line with `voice:` on that step (e.g. two speakers in a dialogue). List voices with `"$ENGINE/zappy" voices`; let the user hear one first with `"$ENGINE/zappy" say "Hello there" --voice nova` (writes `zappy/out/say-nova.wav`).

**Per step:** `narration` (spoken + captioned; empty = a quick silent step), `voice` (this line only), `zoom: false` (stay full-frame; use for large targets like dialogs and camera views), `card` (title card; see below).

**Title cards** — a `wait` with no selector and a `card` shows full-screen over the paused page. Repeat the same card on consecutive steps (YAML anchors) to keep it up across several lines:

```yaml
  - action: wait
    card: &why { eyebrow: Why it matters, title: Hiring on real work, lines: [No CVs, No guesswork] }
    narration: Candidates show what they can do.
  - action: wait
    card: *why
    narration: And you mark the work, not the résumé.
```
Add `check: true` for ticks instead of bullets. A whole explainer can be cards before and after a recorded middle.

**Blur private data:** anything real that can't be swapped for demo data (the signed-in user's email or name, API keys, tokens, customer rows) goes in `blur` as a CSS selector. Use the spec's `blur` for one video and `record.blur` for things shown on every page. Then check stills where it is on screen.

**Variables:** `{name}` anywhere is filled from `zappy/vars.json` (e.g. ids or invite codes that a seed script writes).

### Shape the video

Plan the arc before the steps, and show the user the outline in a few lines:

- **Open on the payoff.** The first 3 seconds show what the viewer gets (the finished result, or a title card that names it), not a loading or settings screen.
- **Problem → action → result.** One line on why this matters, the steps that do it, then the result on screen.
- **End on a next step.** A closing card works: `card: { eyebrow: Try it, title: Invite your team, lines: [Settings → Members] }`.
- **Short.** A feature video is 30–90 s. Two features are two videos.

### Writing good narration
- One short sentence per step, said to the viewer ("Press Save"), present tense, matching what's on screen at that moment.
- The step's action happens as its line starts, and the step lasts as long as its audio — split long explanations across steps.
- Use fictional people and data (`example.com` emails). Never put secrets, real customer data or internal URLs on screen.
- Silent steps (no narration) are for the mechanical clicks between narrated moments.

## 5b. Promo videos (ads, launch clips, social)

For "a launch video", "an ad", "something for X/LinkedIn", use `style: promo`. Same steps and selectors, but no voice: the app plays in a floating window on a brand background, with big headlines above it, stickers on what's clicked, steps cut on the music's beat.

```yaml
title: Invite your team
style: promo
format: vertical            # landscape (default) | vertical (9:16) | square
startUrl: /settings/members
steps:
  - action: wait
    card: { eyebrow: Introducing, title: Team invites }
  - action: click
    selector: { role: button, name: Invite member }
    headline: Bring your team in.                  # stays until the next headline ("" clears)
    sticker: { kind: arrow, text: one click }      # arrow | circle | underline | badge | emoji
  - action: fill
    selector: { label: Email }
    value: sam@example.com
    speed: 2                                       # fast-forward this step
  - action: wait
    card: { eyebrow: Try it, title: yourapp.com }
```

- **Rules:** 15–25 s. The first 2 s are the hook (a card or the result, never a loading screen). Headlines of 3–6 words, in the app's own words, never generic SaaS lines ("streamline your workflow"). At most one sticker on screen at a time; a sticker needs a step with a selector. `narration` is not allowed in a promo.
- **Music matters most here:** set `render.music`, and `render.bpm` to the track's tempo so cuts land on the beat (ask the user, or leave 0 for no snapping).
- **Look:** `render.cardBg` is the background and `render.cardAccent` colours the stickers; set both to the brand's colours.
- **Poster:** the poster frame is also baked in as frame 0, so the platform thumbnail is a good one. Pick it with `poster:` (seconds).
- **Share copy:** after delivering, write `zappy/out/<feature>/share.txt` with a post of at most 280 characters (hook, what it does, link) for the user to post themselves. Never post anything.

## 6. Preview, make, check, fix

```bash
"$ENGINE/zappy" preview <feature>     # runs every step fast: no voice, no capture, no render
"$ENGINE/zappy" make <feature>        # or: make --all
"$ENGINE/zappy" still <feature> 4.5   # PNG of the video at 4.5 s → zappy/out/<feature>/still-4.5s.png
```

**Preview first.** It runs the `before` command and every step in seconds, and fails like `make` does (step named, `failed.png`). Fix selectors there before paying for a make. Add `--show` to let the user watch it in a visible browser.

Output in `zappy/out/<feature>/`: `<feature>.mp4`, `<feature>.srt` (tutorial only), `<feature>.png` (poster frame), `timeline.json` (each step's times), `frames/`, `voice/`.

**One video, then stop.** When asked for several videos, make the first one only and hand it over. Ask about the narration's tone, the voice, the zoom and the pace before writing the other specs. Every later video inherits what they say, so it is cheap to fix now and expensive after `make --all`.

**Always check before saying it's done:** read `timeline.json` for the step start times and render stills at a few of them (a card, a zoomed step, the last step). Look for blank or loading screens, wrong pages, zooms that cut off what matters, and captions that don't match. Fix the spec and remake. TTS is cached, so re-runs only pay for changed lines.

**When a step fails**, the error names the step and saves `failed.png`; look at it. Usual causes: the selector's name doesn't match the visible text (check the page), the control isn't visible yet (add a `wait` with a selector before it), or a duplicate match (add `exact: true` or a narrower selector). A slow page load is trimmed automatically (`render.maxPauseMs`).

## 7. Deliver

Tell the user where the mp4, .srt and poster .png are, the resolution and length, what you blurred, any data you invented, and the command to open it (`open zappy/out/<feature>/<feature>.mp4` on macOS). Offer to change narration, zoom, cards or resolution.
