# Zappy: quick install (VS Code / Cursor)

1. **Have Node 22+** and your web app running locally (e.g. `npm run dev` → `http://localhost:3000`).
2. **Add the skill** from your project root, then pick **Cursor** or **GitHub Copilot** (VS Code) when asked:
   ```bash
   npx skills add https://github.com/who-ash/Zappy --skill zappy
   ```
3. **Optional voiceover:** put `SARVAM_API_KEY` or `OPENAI_API_KEY` in your `.env`. No key = captions only.
4. **Open the agent chat** (Cursor: Agent mode · VS Code: Copilot Chat → Agent) and paste the prompt below. The first run installs the engine (Playwright + Chromium) by itself.

## Prompt

```
Use the zappy skill to make a 30-second demo video of signing up and creating a first project in my app at http://localhost:3000. Check the stills, fix anything that looks off, and give me the mp4.
```

Video lands in `zappy/out/<feature>/<feature>.mp4`.
