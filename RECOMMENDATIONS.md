# Preech Bot: Recommendations, Logo Brief & Cost Notes

## 1. Logo / icon brief (for your image model)

I can't generate raster images from here. I can write an SVG by hand if you'd rather have a coded vector logo. For an image model, use the brief below.

**Brand palette (from the app):** background `#070A12` (near-black navy), primary indigo `#4F46E5`, light indigo `#818CF8`, pale `#C7D2FE`. Suggested new accent: warm gold `#F5C26B` (a "lamp light" color that contrasts with the cold indigo).

**Four concepts, in my order of preference:**

1. **Lamp + sound wave (best fit).** An ancient oil lamp whose flame is a small vertical waveform. It ties to "Your word is a lamp to my feet" and to audio.
   > *Prompt:* "Minimal flat vector app icon, a classical oil lamp seen from the side with the flame drawn as a vertical audio waveform of five rounded bars, warm gold #F5C26B on deep navy #070A12 background, subtle indigo #4F46E5 glow behind the flame, bold simple shapes, no text, no gradients except the soft glow, centered, generous padding, 1024x1024, square canvas, no rounded corners, no border."
2. **Open book + rising waveform.** Open book whose pages lift into sound-wave arcs.
   > *Prompt:* "Flat minimal app icon, an open book viewed from the front, the top edge of the pages rising into three concentric sound-wave arcs, indigo #818CF8 and pale #C7D2FE lines on navy #070A12, geometric, no text, centered, 1024x1024, full-bleed square background."
3. **Aleph + Alpha monogram (leans into the original-language focus).** A single glyph that fuses the Hebrew א and the Greek Α.
   > *Prompt:* "Minimal monogram app icon that fuses the Hebrew letter aleph and the Greek capital alpha into one elegant glyph, thin gold #F5C26B strokes on navy #070A12, a faint indigo radial glow, symmetrical, no other text, 1024x1024 square."
4. **Scroll / dove + headphones.** Most literal and most generic. I would avoid it.

**Files to produce (the existing ones in `frontend/assets/` are test placeholders):**

| File | Size | Notes |
|---|---|---|
| `icon.png` | 1024x1024 | No transparency, no pre-rounded corners (iOS rounds it). |
| `android-icon-foreground.png` | 1024x1024 transparent | Keep the whole mark inside the center ~66% (about a 680px circle) or Android will crop it. |
| `android-icon-background.png` | 1024x1024 | Solid `#070A12` or a subtle gradient. |
| `android-icon-monochrome.png` | 1024x1024 transparent | Single-color (white) silhouette of the mark. |
| `splash.png` | ~1024 wide, transparent | The mark only, since the splash background is `#070A12`. |
| `favicon.png` | 48x48 | Downscale the icon. |

Tips: ask for "flat, vector style, no text" (image models garble text). Generate 8 or more variants and pick one. Take the best to an SVG tracer (Vectorizer.ai) so you can produce all the sizes crisply. [`frontend/app.json`](frontend/app.json) is already wired to these filenames, so you only need to replace the files. I also added the missing `android` block, which was why the Android icons weren't used.

---

## 2. Setup steps for what was added (do these once)

1. **Run the SQL migration** in the Supabase SQL editor: [`supabase/migrations/20261022_search_and_metadata.sql`](supabase/migrations/20261022_search_and_metadata.sql). It adds the categorization columns, indexes, and the `match_sermons_v2` search function.
2. **Backfill existing studies** (free): `python backfill.py`. Then, to give old studies summaries/themes and re-embed them (a few cents): `python backfill.py --metadata`.
3. **Check for skipped verses:** `python main.py --audit`. The old code had Genesis 25 at 18 verses (it has 34), so Genesis 25:19-34 was likely skipped. The new verse table now picks that up automatically. `--fill-gaps N` generates any other missed passages.
4. **Test the new prompt before committing to 3,165 studies.** Run `python main.py --single "Matthew 5:1-12" --no-audio` (the Beatitudes, your "blessed" example) and compare it to an old study. Try other models by setting `DRAFT_MODEL` / `RESEARCH_MODEL`.
5. Add the GitHub repo secrets as before. Models can be changed without code edits through repo **Variables** (`RESEARCH_MODEL`, `DRAFT_MODEL`, `UTILITY_MODEL`).

---

## 3. Models and cost (estimates; verify current OpenRouter pricing)

The whole Bible at the default chunking is **3,165 studies**. At 2 per day that is about 4.3 years; at 5 per day about 1.7 years. Raise `--auto` in the workflow to go faster.

| Setup | Approx. cost / study | Whole Bible |
|---|---|---|
| Research + Draft on Claude Sonnet 4.5 (default) | ~$0.12 | ~$380 |
| Research on Sonnet, Draft on Gemini 2.5 Pro | ~$0.09 | ~$285 |
| Both on Gemini 2.5 Pro | ~$0.08 | ~$245 |
| Everything on Gemini 2.5 Flash | ~$0.02 | ~$60 |

**What I'd do:** keep the **research** stage on the strongest model, since that stage decides whether the language insights are actually interesting and accurate. The drafting stage is the one you can downgrade if you need to save money. Don't use free-tier models for this. The old prompt asked for ~2,800 words but capped output at 3,500 tokens, so long sermons were being cut off.

---

## 4. What changed in the sermon prompts (and why)

- **Two-stage pipeline.** A "biblical languages scholar" pass finds only the words that earn a place (concrete image, English flattening, canonical echo, wordplay/grammar, ancient practice) and rates each as established / probable / debated. A second pass writes the sermon from that dossier.
- **Picture, Pivot, Press** is the rule for every word study. Show the concrete image, show what English hides and how it changes this verse, then land it with a question. The prompt includes a model paragraph (John 1:14 "tabernacled") and an explicit ban on circular glosses like "unity means to be united, which is significant because we should be united."
- **Real verse text** is now fetched (World English Bible via bible-api.com) and given to the model, so it quotes Scripture instead of recalling it.
- **Genre-aware guidance** for narrative, poetry, prophecy, gospel, epistle and apocalyptic, plus an intro to each book on its first study and a one-line bridge from the previous study.
- **Pronunciation fix.** The old "rewrite the whole sermon for TTS" pass was costly and could truncate. Now a cheap model returns a small pronunciation map applied only to the audio copy, so the transcript on screen keeps clean spellings.
- **A note on honesty:** your "Blessed / sailors steering a ship" example is a very popular teaching, but I can't verify the sailor claim, and scholars dispute that etymology. The solid, interesting story for "blessed" is the Hebrew *ashre* (from a root about walking straight / advancing) and Greek *makarios*. The new prompt tells the model to label debated claims as debated and to avoid unverified popular claims. For a Bible study app that trust matters more than a flashy fact.

---

## 5. Recommendations, rated

**Scale:** 4 = do soon (important, or big payoff for small effort). 3 = worth doing. 2 = nice to have. 1 = skip (lots of effort for little payoff).

| # | Recommendation | Rating | Effort | Notes |
|---|---|:-:|:-:|---|
| 1 | **Move the OpenRouter key out of the app.** `EXPO_PUBLIC_*` values are bundled into the app and can be extracted; anyone could spend your credits. Put embeddings/chat behind a Supabase Edge Function (or similar) with a rate limit. | **4** | Medium | The most important item here. |
| 2 | **Audio storage size.** I fixed this (mono 48 kbps, ~6 MB each, about 19 GB for the Bible; the old setting would have been ~75 GB). Supabase free tier is 1 GB, so plan on Pro or Cloudflare R2. | **4** | Done / small | |
| 3 | **Show the scripture text in the player** (we already fetch it; store it in a `passage_text` column and show it above the transcript). | **4** | Small | Big perceived quality for little work. |
| 4 | **"Word cards" UI.** The research dossier is now stored in `sermons.research` (jsonb). Show tappable cards (original script, transliteration, the picture, the pivot). | **4** | Medium | Highlights your best feature; the data is already being saved. |
| 5 | **Resume where you left off** (save playback position per study). | **4** | Small | Expected in any audio app. |
| 6 | **Lock-screen controls.** Background playback is enabled; add `player.setActiveForLockScreen(true, {...})` metadata. | **3** | Small | |
| 7 | **Retry failed audio** (`--retry-audio` for rows with `TTS_FAILED`). | **3** | Small | |
| 8 | **Daily plan reminder notification** ("Day 5: Identity in Christ"). | **3** | Medium | Good for plan completion. |
| 9 | **Theological tradition setting** (not built yet: add a `THEOLOGICAL_TRADITION` env var, e.g. "evangelical, Reformed-friendly", and inject it into the draft prompt). | **3** | Small | LLMs drift; decide the stance you want. |
| 10 | **"Report an issue" button** writing to a `feedback` table. | **3** | Small | Cheap quality control over 3,000+ AI studies. |
| 11 | **Spot-check pipeline:** a script that samples 1 in 25 studies for a human read. | **3** | Small | |
| 12 | **Chat grounded across the whole library** (RAG), not just the current study. | **3** | Medium | |
| 13 | **Make the offline download actually play** (the downloaded file isn't used when you re-open a study). | **3** | Small | |
| 14 | **Better TTS voice** (OpenAI / ElevenLabs). Kokoro is free and decent; premium voices cost roughly $0.01-0.02/min, i.e. ~$500-1,000 for the whole Bible. | **2** | Small code, high cost | Try on a handful first. |
| 15 | **Streaks and listening stats.** | **2** | Small | |
| 16 | **Crash reporting (Sentry).** | **2** | Small | Before public release. |
| 17 | **Accounts + cross-device sync** of plans/bookmarks (Supabase Auth + RLS). Bookmarks are currently global to whoever uses the anon key. | **2** (4 if multi-user) | High | |
| 18 | **Reconsider the name "Preech Bot"** for store listings. | **2** | Small | |
| 19 | **Android / web builds.** | **2** | Medium | |
| 20 | **Real audio waveform** (the current bars are decorative). | **1** | High | Little payoff. |
| 21 | **Multiple Bible translations / commentary integrations.** | **1** | High | Licensing is a headache. |
| 22 | **Custom player engine / more visual effects.** | **1** | High | The current look is already strong. |

**Best "impressive for little effort" picks:** #3 (scripture text in the player), #5 (resume position), #10 (report button), #6 (lock screen), then #4 (word cards).

---

## 6. Known caveats

- The verse-count table is validated against the known per-book totals (31,102 verses), but it's standard Protestant versification. Some translations number a few verses differently. If a passage ever looks cut off, `python bible.py` and `--audit` help spot it.
- Progression order is Genesis to Revelation. When it finishes Revelation 22, `--auto` stops cleanly.
- Reading plans are stored on the device (AsyncStorage). They don't sync across devices (see #17).
- Topic plans use semantic search, so results get better as more studies exist. Early on, a 30-day "Identity in Christ" plan may be trimmed to the number of relevant studies found, and the app tells you when that happens.
- The TypeScript compiles cleanly and the Python was syntax-checked and unit-tested for the Bible logic, but I couldn't run the app on a device or call the LLM/Supabase from here, so do the one-study test in section 2 before enabling the daily job.
