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

## 5b. Brand ads and promos (`style: promo`)

For "an ad", "a launch video", "a brand video", "something for LinkedIn/Reels". Read [references/ad-playbook.md](references/ad-playbook.md) first. The order is the playbook's: **brief → script → spec → check → make → review**. The engine enforces it: `make` and `render` refuse a promo that breaks a playbook rule (list below), and `zappy check <feature>` shows what's wrong without rendering.

1. **Brief.** Copy [templates/brief.md](templates/brief.md) to `zappy/briefs/<feature>.md` and fill every row, then the script table. Show it to the user and get an OK. Ask for anything you can't find, especially the CTA link. Never invent a link, a number or a claim.
2. **Spec**, from the script. Same steps and selectors as a tutorial, no voice:

```yaml
title: Pathways, hire on real work
style: promo
viewport: { width: 1440, height: 900 }   # films smaller, so UI text reads larger in crops
startUrl: /o/acme/results
music: music/track.mp3          # licensed; credit it in share.txt
bpm: 110                        # the track's tempo: cuts land on the beat
brand:                          # the brand kit (required): logo bug + end card
  name: Pathways
  logo: ../public/logo.png        # for light backgrounds
  logoDark: ../public/logo-white.png   # for dark ones (optional)
  font: brand/Inter.woff2         # the brand font file (optional) and its family name
  fontFamily: Inter
  weights: [500, 700]             # two weights only: text, headings
rights:                           # required: what's on screen and in the soundtrack
  people: Fictional demo data     # or "Releases on file for everyone shown"
  music: "Business Moves Vol. 10, Sascha Ende, ende.app, CC BY 4.0"
  font: Inter, SIL Open Font License
adCopy: { headline: Hire on real work, text: "Rank candidates on a real task.", button: Book now }
campaign: Hiring-Launch           # names the files and the UTM links
theme: { bg: "#061f1e", accent: "#0f6e6a", pop: "#3fb5ad" }  # one accent; light bg works too
note: Demo data                 # shown on footage when names and scores are made up
transition: push                # push | cut (hard, on the beat) | zoom
format: landscape               # landscape | vertical (9:16) | square | feed (4:5)
safe: tiktok                    # vertical only: keep clear of TikTok's right-side buttons
sfx: true                       # Zappy's own clicks, whooshes and end sting (default on)
steps:
  - action: wait
    selector: { css: "table tbody tr:first-child td:nth-child(2)" }
    hook: true                  # the result, played first: never open on a card. More hook
                                # steps become Hook B and C variants in `zappy versions`
    layout: split               # split | tilt (angled screen) | full (fills the frame)
    pad: 4.7                    # room around the element in the crop (1.1 tight, 3+ wide)
    headline: Your shortlist, ranked by *real work*.   # 3-7 words; *stars* highlight
  - action: click
    selector: { role: button, name: Start now }
    cut: true                   # runs while recording, never shown
  - action: hover
    selector: { text: Signals }
    layout: tilt
    counter: "01"               # a step number above the headline (explainers, a clock)
    headline: Set the checks *you* care about.
  - action: wait
    card: { stat: { value: "100/100", label: "named the stores *and* the fix." } }
  - action: wait
    card:
      title: Hire on *real work*.
      tiles:                    # up to three proofs, 5 words each; quote titles with commas
        - { emoji: 🔗, title: One link per drive }
      cta: { text: Book a demo, url: example.com/demo }
```

**Voice is optional.** A promo step with `narration:` is voiced (the project's TTS), plays at speed 1, gets a burned-in caption, and the music dips under it. Without narration the ad is music-led and must work muted.

**Cards** go on any step (they hide its footage, so a setup step can carry one): a title (big type), `stat: { value, label }` (the number counts up), `compare: { left, right }` (before / after, 4 lines of 5 words a side), `quote: { text, by }` (7 words or fewer: cut a candidate's line down, never reword it into something they didn't say), `tiles:`, and `cta:` on the last card.

**Pick a format to suit the message, not one template for every ad.** Each of these is a different ad, built from the same footage:

| Format | Shape of it |
|---|---|
| Stat-led | hook footage → big `stat` cards between full-frame shots, `transition: cut` |
| Before / after | hook → `compare` card → `tilt` proof → short `quote` → CTA |
| Question → montage | footage hook (with the question as its headline) → fast `full` shots of 3+ words → the answer → CTA |
| Numbered explainer | hook → `counter: "01"/"02"/"03"` on `tilt` or `split` steps, `transition: zoom` |
| Clock / journey | `counter` timestamps through one task, `full` shots |
| Manifesto | footage hook → short type lines between footage → CTA |
| Bumper (6 s) | one hook shot → logo and CTA |

**The rules `check` enforces** (errors stop the render):
- A brief exists with every field filled.
- `brand:` is set; footage appears in the first 5 s, so the brand shows early.
- The first scene is footage, not a card.
- Headlines and card text are 7 words or fewer; tiles and compare lines 5 or fewer; compare sides 4 lines.
- Every scene stays up at least 1.5 s and 1 s per 3 words. Slow a step down with `speed` below 1, never speed footage past reading.
- Exactly one CTA, on the last scene, with a `url`, on screen 2.5 s or more.
- The brief is signed off (`Approved by:` filled) and its single message has no "and".
- `rights.people` is set; `rights.music` when there's music; `rights.font` and `fontFamily` with a brand font.
- The highlight colour has 3:1 contrast on the background.
- Warnings: a headline or card line that isn't in the brief's script (the ad drifted from what was approved), headlines under 3 words, footage shots over 4 s, a weak contrast for text on the highlight colour.

**What a rule can't check, you do:** every claim on screen is something the product really does (no "one click" for three clicks); `note: Demo data` whenever the people and scores are made up; licensed music, credited; nothing private or real on screen.

- **Versions and delivery:** once the hero passes, run `"$ENGINE/zappy" versions <feature> --note "what changed"`. From the one recording it renders the playbook's set into `zappy/out/<feature>/delivery/vNN/`: the hero in both shapes, a 15 s cut (9:16 and 4:5) when the hero is longer, a 6 s bumper (16:9 and 9:16), and Hook B/C (9:16) from your extra `hook: true` steps. Each file is named `Brand_Campaign_<len>s_<shape>_Hook<A|B|C>_vNN.mp4`, with its poster `.png` and captions `.srt`. Alongside them: `copy.md` (headline, primary text, CTA button and a UTM landing link per file), `LICENCES.md`, `CHECKLIST.md` (the playbook's review, with what zappy checked ticked), and `preview.html` (every version at phone size). Each version is checked too, and the batch is logged in `zappy/versions.csv` for comparing results later.
- **Loudness:** every render's audio is normalised to -14 LUFS (`render.loudness`).
- **High-density vertical:** set `render.width/height` to 2560×1440 for 1440×2560 vertical exports.
- **Poster:** set `poster:` (seconds) on a settled, strong frame. It's also baked in as frame 0.
- **Review** with the playbook's checklist on stills of every scene, then write `zappy/out/<feature>/share.txt`: a post of at most 280 characters plus the music credit, for the user to post themselves. Never post anything.

## 6. Preview, make, check, fix

```bash
"$ENGINE/zappy" preview <feature>     # runs every step fast: no voice, no capture, no render
"$ENGINE/zappy" make <feature>        # or: make --all
"$ENGINE/zappy" check <feature>       # promo: does it follow the ad playbook (also run by make and render)
"$ENGINE/zappy" render <feature>      # re-render from the last recording: picks up spec changes to headlines, stickers, speed, zoom, cards, format, music
"$ENGINE/zappy" still <feature> 4.5   # PNG of the video at 4.5 s → zappy/out/<feature>/still-4.5s.png
```

**Preview first.** It runs the `before` command and every step in seconds, and fails like `make` does (step named, `failed.png`). Fix selectors there before paying for a make. Add `--show` to let the user watch it in a visible browser.

Output in `zappy/out/<feature>/`: `<feature>.mp4`, `<feature>.srt` (tutorial only), `<feature>.png` (poster frame), `timeline.json` (each step's times), `frames/`, `voice/`.

**One video, then stop.** When asked for several videos, make the first one only and hand it over. Ask about the narration's tone, the voice, the zoom and the pace before writing the other specs. Every later video inherits what they say, so it is cheap to fix now and expensive after `make --all`.

**Always check before saying it's done:** read `timeline.json` for the step start times and render stills at a few of them (a card, a zoomed step, the last step). Look for blank or loading screens, wrong pages, zooms that cut off what matters, and captions that don't match. Fix the spec and remake. TTS is cached, so re-runs only pay for changed lines.

**When a step fails**, the error names the step and saves `failed.png`; look at it. Usual causes: the selector's name doesn't match the visible text (check the page), the control isn't visible yet (add a `wait` with a selector before it), or a duplicate match (add `exact: true` or a narrower selector). A slow page load is trimmed automatically (`render.maxPauseMs`).

## 7. Deliver

Tell the user where the mp4, .srt and poster .png are, the resolution and length, what you blurred, any data you invented, and the command to open it (`open zappy/out/<feature>/<feature>.mp4` on macOS). Offer to change narration, zoom, cards or resolution.
