-- Preech Bot: categorisation + search upgrades.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- After running, backfill existing rows:   python backfill.py            (free, testament/genre/order)
--                                          python backfill.py --metadata (LLM summaries/themes + re-embed)

alter table public.sermons
  add column if not exists summary    text,
  add column if not exists testament  text,   -- 'OT' | 'NT'
  add column if not exists genre      text,   -- Law, History, Poetry & Wisdom, Prophecy, Gospel, Epistle, Apocalyptic
  add column if not exists book_order int,    -- 1..66 canonical order
  add column if not exists word_count int,
  add column if not exists research   jsonb;  -- original-language research dossier (for future "word cards")

create index if not exists sermons_testament_idx  on public.sermons (testament);
create index if not exists sermons_genre_idx      on public.sermons (genre);
create index if not exists sermons_canon_idx      on public.sermons (book_order, chapter, start_verse);
-- If `tags` is text[] or jsonb this GIN index speeds up theme filtering; if it errors, `tags` is another type: skip it.
create index if not exists sermons_tags_idx       on public.sermons using gin (tags);
-- Approximate nearest-neighbour index for the 1536-dim embeddings (matters once there are thousands of rows).
create index if not exists sermons_embedding_idx  on public.sermons using hnsw (embedding vector_cosine_ops);

-- Semantic search with optional filters. Returns LEAN rows (no sermon_text / embedding) so the app stays fast.
create or replace function public.match_sermons_v2(
  query_embedding   vector(1536),
  match_threshold   float   default 0.1,
  match_count       int     default 10,
  filter_testament  text    default null,
  filter_genre      text    default null,
  require_audio     boolean default false
)
returns table (
  id          bigint,
  passage_ref text,
  title       text,
  book        text,
  chapter     int,
  start_verse int,
  audio_url   text,
  summary     text,
  testament   text,
  genre       text,
  book_order  int,
  created_at  timestamptz,
  similarity  float
)
language sql stable
as $$
  select
    s.id::bigint, s.passage_ref::text, s.title::text, s.book::text, s.chapter::int, s.start_verse::int,
    s.audio_url::text, s.summary::text, s.testament::text, s.genre::text, s.book_order::int,
    s.created_at::timestamptz,
    (1 - (s.embedding <=> query_embedding))::float as similarity
  from public.sermons s
  where s.embedding is not null
    and (filter_testament is null or s.testament = filter_testament)
    and (filter_genre     is null or s.genre     = filter_genre)
    and (not require_audio or (s.audio_url is not null and s.audio_url <> ''))
    and (1 - (s.embedding <=> query_embedding)) > match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_sermons_v2 to anon, authenticated;
