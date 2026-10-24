export interface Sermon {
  id: number;
  passage_ref: string;
  title: string;
  book: string;
  chapter?: number | null;
  start_verse?: number | null;
  /** Loaded lazily when a sermon is opened (list queries are "lean" and omit it). */
  sermon_text?: string;
  audio_url: string;
  created_at?: string;
  summary?: string | null;
  testament?: 'OT' | 'NT' | null;
  genre?: string | null;
  book_order?: number | null;
  tags?: string[] | null;
  similarity?: number;
}

export type TestamentFilter = 'both' | 'old' | 'new';
