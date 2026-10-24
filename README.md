# Preech Bot

Daily audio Bible studies, Genesis through Revelation. A Python engine writes each study (research pass, then sermon, then pronunciation, then search metadata), renders audio with Kokoro TTS, and saves everything to Supabase. An Expo/React Native app plays them, with search, filters and reading plans.

## Engine

```bash
pip install -r requirements.txt
python bible.py                          # validate canon data, show total studies planned
python main.py --status                  # progress through the Bible
python main.py --auto 2                  # generate the next 2 studies (what the daily workflow runs)
python main.py --audit                   # find skipped passages before the current position
python main.py --fill-gaps 3             # generate skipped passages
python main.py --single "John 1:1-14"    # one-off (add --advance to move the bookmark)
python main.py --auto 1 --no-audio       # test text pipeline only
```

Environment (`.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`; optional `RESEARCH_MODEL`, `DRAFT_MODEL`, `UTILITY_MODEL`, `FALLBACK_MODELS`, `CHUNK_SIZE`.

First-time setup: run `supabase/migrations/20261022_search_and_metadata.sql` in Supabase, then `python backfill.py`.

## App

```bash
cd frontend && npm install && npx expo start
```

Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OPENROUTER_API_KEY` (see security note), optional `EXPO_PUBLIC_CHAT_MODEL`.

See [`RECOMMENDATIONS.md`](RECOMMENDATIONS.md) for the logo brief, cost estimates and the rated improvement list.
