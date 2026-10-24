import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sermon, TestamentFilter } from './types';
import { BOOK_TESTAMENT, testamentCode } from './bible';

/** List queries never pull sermon_text or embedding (they're huge once there are thousands of rows). */
export const LEAN_COLUMNS =
  'id, passage_ref, title, book, chapter, start_verse, audio_url, created_at, summary, testament, genre, book_order, tags';
/** Used if the SQL migration hasn't been applied yet. */
export const BASE_COLUMNS = 'id, passage_ref, title, book, chapter, start_verse, audio_url, created_at';

export const CHAT_MODEL = process.env.EXPO_PUBLIC_CHAT_MODEL || 'google/gemini-2.5-flash';

export async function embedText(apiKey: string, text: string): Promise<number[] | null> {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: text }),
  });
  const data = await res.json();
  return data?.data?.[0]?.embedding ?? null;
}

export async function fetchSermonText(supabase: SupabaseClient, id: number): Promise<string | null> {
  const { data, error } = await supabase.from('sermons').select('sermon_text').eq('id', id).single();
  return error ? null : (data?.sermon_text as string);
}

export interface SearchOptions {
  testament?: TestamentFilter;
  genre?: string | null;
  count?: number;
  threshold?: number;
  requireAudio?: boolean;
}

/** Semantic search with filters. Falls back to the legacy RPC if match_sermons_v2 isn't installed yet. */
export async function searchSermons(
  supabase: SupabaseClient,
  apiKey: string,
  query: string,
  opts: SearchOptions = {}
): Promise<Sermon[]> {
  const { testament = 'both', genre = null, count = 10, threshold = 0.1, requireAudio = false } = opts;
  const embedding = await embedText(apiKey, query);
  if (!embedding) throw new Error('Could not create a search embedding. Check your OpenRouter key.');

  const v2 = await supabase.rpc('match_sermons_v2', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: count,
    filter_testament: testamentCode(testament),
    filter_genre: genre,
    require_audio: requireAudio,
  });
  if (!v2.error && v2.data) return v2.data as Sermon[];

  // Legacy fallback (pre-migration): filter client-side.
  const legacy = await supabase.rpc('match_sermons', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: count * 3,
  });
  if (legacy.error || !legacy.data) throw new Error(legacy.error?.message || v2.error?.message || 'Search failed');
  const code = testamentCode(testament);
  return (legacy.data as any[])
    .filter((r) => !code || BOOK_TESTAMENT[r.book] === code)
    .filter((r) => !requireAudio || !!r.audio_url)
    .slice(0, count)
    .map(({ sermon_text, embedding: _e, ...rest }) => rest as Sermon);
}

/** Every study in one book, in reading order. */
export async function fetchBookSermons(supabase: SupabaseClient, book: string): Promise<Sermon[]> {
  const run = (cols: string) =>
    supabase
      .from('sermons')
      .select(cols)
      .eq('book', book)
      .order('chapter', { ascending: true })
      .order('start_verse', { ascending: true })
      .range(0, 999);
  let res: any = await run(LEAN_COLUMNS);
  if (res.error) res = await run(BASE_COLUMNS);
  if (res.error) throw new Error(res.error.message);
  return (res.data as Sermon[]).filter((s) => !!s.audio_url);
}
