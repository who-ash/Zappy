# Zappy

Turn app flows into demo videos.

Zappy is an agent skill. Describe the flow you want filmed, and your coding agent writes a short YAML script for it. Zappy then plays the script against your running web app and renders a polished mp4:

- **Real app, sharp capture:** every repaint is saved as a full-quality frame, not a compressed screen recording.
- **Cursor and click ripples**, plus a smooth zoom onto each step's element.
- **Voiceover** from OpenAI or Sarvam TTS, or captions only.
- **Burned-in captions** and a matching `.srt` file.
- **Title cards** for intros, tips and outros.
- **Background music** that dips under the voice.
- **Blur** for private data (emails, names, tokens) by CSS selector.
- **Poster image** beside every video, for embeds.
- **Promo mode** for short, music-led ads: kinetic headlines, stickers pinned to the UI, beat cuts, 16:9, 9:16 or 1:1.
- **Preview** that runs a flow in seconds to catch broken steps before rendering.
- **Signed-in flows** through a saved browser session.

## Install

**Claude Code (plugin):**

```bash
/plugin marketplace add who-ash/Zappy
/plugin install zappy@zappy
```

**Any agent** (Claude Code, Cursor, Codex, Copilot, Gemini CLI, …) via the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add https://github.com/who-ash/Zappy --skill zappy
```

**Manually:**

```bash
git clone https://github.com/who-ash/Zappy && rsync -a Zappy/skills/zappy/ ~/.claude/skills/zappy/
```

Then set up the engine once (needs Node 22 or later):

```bash
cd ~/.claude/skills/zappy/engine && npm install && npx playwright install chromium
```

## Use

Start your app's dev server, then ask your agent:

> /zappy make a demo video of signing up and creating a first project

The agent reads your app, writes `zappy/specs/<feature>.yaml` and runs the engine. It checks stills from the result, fixes anything that looks wrong, and hands you `zappy/out/<feature>/<feature>.mp4`.

You can also run it by hand from your project root:

```bash
ENGINE=~/.claude/skills/zappy/engine
$ENGINE/zappy init                                      # ./zappy workspace
$ENGINE/zappy login admin http://localhost:3000/login   # only for signed-in flows
$ENGINE/zappy preview <feature>                         # quick dry run, no render
$ENGINE/zappy make <feature>                            # or: make --all
$ENGINE/zappy still <feature> 5                         # PNG at 5 s, to check
```

[`skills/zappy/SKILL.md`](skills/zappy/SKILL.md) covers the spec format, config, voice and title cards.

## Voice

Set `tts.provider` in `zappy/zappy.config.json`:

| Provider | Key | Notes |
|---|---|---|
| `sarvam` (default) | `SARVAM_API_KEY` | Bulbul v3; pick the speaker with `tts.sarvam.speaker` (`shubh`, `priya`, `ritu`, …) |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini-tts`; pick the voice with `tts.openai.voice` |
| `none` | no key | captions only, no audio |

`zappy init` writes `zappy/.env.example` listing these; copy it to `zappy/.env` (git-ignored) and fill in your key.

Choose the voice for the whole project in the config (`tts.openai.voice` / `tts.sarvam.speaker`), for one video with `voice:` at the top of its spec, or for a single line with `voice:` on that step. Preview before choosing:

```bash
$ENGINE/zappy voices                                  # list voices (* = current)
$ENGINE/zappy say "Welcome to the dashboard" --voice nova   # → zappy/out/say-nova.wav
```

Put keys in your shell environment, `zappy/.env`, or your project's `.env.local` / `.env` (that order wins). `ZAPPY_BASE_URL` overrides `baseUrl`. Clips are cached, so a re-render only pays for lines you changed.

## Notes

- Record only against a local or staging app with demo data, never production.
- `zappy/auth/` holds saved sessions; the generated `.gitignore` keeps it out of git.
- Output size and frame rate are set in `render` in `zappy/zappy.config.json`. Smaller sizes render faster while you iterate.

## License

MIT
