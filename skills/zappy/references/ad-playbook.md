# Brand ad playbook (for `style: promo`)

Condensed from Xcelerator's *Branding Ad Video Playbook* (Nov 2026). The core rule for every decision: **one audience, one message, one action.**

**Enforced:** `zappy check` (also run by `make`, `render` and `versions` for every promo) turns the measurable parts of this playbook into rules: a signed-off brief with one message, the brand kit and rights declared, footage first, brand in the first 5 s, 7 words or fewer per line, reading-time holds, highlight contrast, one CTA with a link, on screen 2.5 s. `zappy versions` makes the step-11 version set and delivery package (copy with UTM links, licences, checklist, phone preview, version log), and every render is normalised to -14 LUFS. What a person must judge (true claims, releases, tone, the first-time-viewer test) is in each delivery's CHECKLIST.md. If a shot, line or graphic doesn't serve those three, cut it.

## 1. Brief first: `zappy/briefs/<feature>.md`

Write it and get the user's OK before any spec. One page:

| Item | What to write |
|---|---|
| Objective | Awareness, consideration or action. One. |
| Audience | Who exactly, and what they care about (a real person, not "everyone") |
| Single message | One sentence, no "and" |
| Proof | Why they should believe it: what the product visibly does |
| Tone | 2–3 words |
| Platform | Where it runs (decides the shape) |
| Length | Main cut, plus cutdowns if wanted |
| Call to action | One action, and the link it goes to |
| Success metric | How the ad will be judged |

Then a two-column script: time · what we see · words on screen. At ~1 s per 3 words, a 20 s ad holds about 20–30 on-screen words in total.

## 2. Structure

| Length | Shape |
|---|---|
| 6 s | Hook and brand (0–2), one idea (2–5), logo and CTA (5–6) |
| 15 s | Hook (0–3), problem or desire (3–6), proof (6–12), brand and CTA (12–15) |
| 30 s | Hook (0–3), setup (3–8), demo (8–22), payoff (22–26), brand and CTA (26–30) |

## 3. The hook (first 3 s)

- **Open on motion and the result**, not a title card, a logo slate or a fade from black. Mark the strongest finished-state step `hook: true`; it plays first.
- The key words are on screen in the first second (people watch muted).
- Brand cues early through colour and the small logo bug (`brand:`), not a logo slate.
- No clickbait the rest of the ad doesn't deliver.

## 4. Look and motion

- **Minimal and consistent.** One accent colour (`theme`); highlight only the one or two words that carry the message (`*real work*`).
- **3–7 words per headline**, on screen at least 1 s per 3 words and never under 1.5 s. One headline at a time.
- One easing and one entrance throughout (the engine's fade-up; no bounce). Motion only where it explains something.
- **Marks sparingly**: a thin circle or underline on the one detail that proves the line. Not every scene needs one. Labels and chips are rare.
- **Emoji with restraint**: on the proof tiles of the end card, and at most one in a headline. Pick ones that read instantly (🔗 ⏱️ ✅ 📈 🤖). Never decorate with them.
- Real product UI only. Cut setup clicks (`cut: true`) instead of fast-forwarding footage.
- Demo data only: no real people, emails, names or numbers without a source.

## 5. Brand and CTA

- Name and logo early (the bug) and on the end card. Not on every frame.
- End card: logo, one line, up to three proof tiles, **one** CTA (`card.cta`), shown 2–3 s or more.
- The CTA matches the objective: "Learn more" (awareness), "Book a demo" / "Apply by <date>" (action). Urgency only if it's real. Don't invent a URL; ask for it.

## 6. Audio

- Licensed music only, chosen for the emotion; keep the licence and credit (`share.txt`). Cuts land on its beat (`bpm`).
- The ad must work muted: headlines carry the message.

## 7. Platforms and versions

| Placement | Shape | Notes |
|---|---|---|
| LinkedIn, YouTube in-stream, website | 16:9 | Skippable after 5 s: hook and brand in the first 5 s |
| Reels, Shorts, TikTok | 9:16 | Text out of the top 14% and bottom 35% (the engine's vertical layout keeps to this) |
| Feed | 4:5 or 1:1 | Use `square` |

Make the hero in one shape, then `format:` + `zappy render` for the others (no re-recording). Name exports `Brand_Campaign_<len>s_<16x9|9x16>_v<NN>.mp4`, each with a thumbnail of the same shape.

## 8. Review before delivering

Check stills of every scene and say what you checked:

- [ ] A first-time viewer could repeat the single message
- [ ] Hook works in the first 3 s with sound off; brand cues in the first 5 s
- [ ] Every headline is 3–7 words, readable, held long enough
- [ ] End card: logo, one line, one CTA
- [ ] Nothing private or invented on screen; every claim is something the product does
- [ ] Music is licensed and credited
- [ ] Each shape keeps text inside its safe zone
