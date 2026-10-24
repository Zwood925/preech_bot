import type { TestamentFilter } from './types';

/** Canonical book order + testament. Keep in sync with bible.py. */
const RAW: [string, 'OT' | 'NT'][] = [
  ['Genesis', 'OT'], ['Exodus', 'OT'], ['Leviticus', 'OT'], ['Numbers', 'OT'], ['Deuteronomy', 'OT'],
  ['Joshua', 'OT'], ['Judges', 'OT'], ['Ruth', 'OT'], ['1 Samuel', 'OT'], ['2 Samuel', 'OT'],
  ['1 Kings', 'OT'], ['2 Kings', 'OT'], ['1 Chronicles', 'OT'], ['2 Chronicles', 'OT'], ['Ezra', 'OT'],
  ['Nehemiah', 'OT'], ['Esther', 'OT'], ['Job', 'OT'], ['Psalms', 'OT'], ['Proverbs', 'OT'],
  ['Ecclesiastes', 'OT'], ['Song of Solomon', 'OT'], ['Isaiah', 'OT'], ['Jeremiah', 'OT'],
  ['Lamentations', 'OT'], ['Ezekiel', 'OT'], ['Daniel', 'OT'], ['Hosea', 'OT'], ['Joel', 'OT'],
  ['Amos', 'OT'], ['Obadiah', 'OT'], ['Jonah', 'OT'], ['Micah', 'OT'], ['Nahum', 'OT'],
  ['Habakkuk', 'OT'], ['Zephaniah', 'OT'], ['Haggai', 'OT'], ['Zechariah', 'OT'], ['Malachi', 'OT'],
  ['Matthew', 'NT'], ['Mark', 'NT'], ['Luke', 'NT'], ['John', 'NT'], ['Acts', 'NT'], ['Romans', 'NT'],
  ['1 Corinthians', 'NT'], ['2 Corinthians', 'NT'], ['Galatians', 'NT'], ['Ephesians', 'NT'],
  ['Philippians', 'NT'], ['Colossians', 'NT'], ['1 Thessalonians', 'NT'], ['2 Thessalonians', 'NT'],
  ['1 Timothy', 'NT'], ['2 Timothy', 'NT'], ['Titus', 'NT'], ['Philemon', 'NT'], ['Hebrews', 'NT'],
  ['James', 'NT'], ['1 Peter', 'NT'], ['2 Peter', 'NT'], ['1 John', 'NT'], ['2 John', 'NT'],
  ['3 John', 'NT'], ['Jude', 'NT'], ['Revelation', 'NT'],
];

export const BOOK_ORDER: Record<string, number> = {};
export const BOOK_TESTAMENT: Record<string, 'OT' | 'NT'> = {};
RAW.forEach(([name, t], i) => {
  BOOK_ORDER[name] = i + 1;
  BOOK_TESTAMENT[name] = t;
});

const ALIASES: Record<string, string> = {
  psalm: 'Psalms',
  'song of songs': 'Song of Solomon',
  'songs of solomon': 'Song of Solomon',
  canticles: 'Song of Solomon',
  revelations: 'Revelation',
  'revelation of john': 'Revelation',
  'acts of the apostles': 'Acts',
};

const ORDINALS: [RegExp, string][] = [
  [/^(first|1st)\s+/, '1 '],
  [/^(second|2nd)\s+/, '2 '],
  [/^(third|3rd)\s+/, '3 '],
];

/** Returns the canonical book name if `text` IS a book reference ("The book of Genesis", "gospel of john", "1st John"). */
export function detectBookFromTopic(text: string): string | null {
  let key = text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  key = key
    .replace(/^(the\s+)?(book|books|gospel|epistle|letter|letters)\s+(of|to|according to)\s+(the\s+)?/, '')
    .replace(/^the\s+/, '')
    .replace(/\s+(study|studies|plan)$/, '')
    .trim();
  for (const [re, rep] of ORDINALS) key = key.replace(re, rep);
  key = ALIASES[key] ? ALIASES[key].toLowerCase() : key;
  return RAW.find(([name]) => name.toLowerCase() === key)?.[0] ?? null;
}

export function canonicalSortKey(s: { book: string; book_order?: number | null; chapter?: number | null; start_verse?: number | null }): number {
  const order = s.book_order ?? BOOK_ORDER[s.book] ?? 999;
  return order * 1_000_000 + (s.chapter ?? 0) * 1_000 + (s.start_verse ?? 0);
}

export function testamentCode(filter: TestamentFilter): 'OT' | 'NT' | null {
  return filter === 'old' ? 'OT' : filter === 'new' ? 'NT' : null;
}

export const GENRES = ['Law', 'History', 'Poetry & Wisdom', 'Prophecy', 'Gospel', 'Epistle', 'Apocalyptic'];

/** Mirrors THEME_VOCAB in agents.py (top subset used for quick filter chips). */
export const THEMES = [
  'Identity in Christ', 'Grace', 'Faith', 'Forgiveness', 'Prayer', 'Love', 'Wisdom', 'Suffering', 'Hope',
  'Anxiety & Peace', 'Temptation & Sin', 'Holy Spirit', 'Kingdom of God', 'Worship', 'Obedience',
  'Courage', 'Community & Unity', 'Family & Marriage', 'Leadership', 'Money & Generosity',
  'Calling & Purpose', 'Trust in God', 'Redemption', 'Covenant',
];

export const TOPIC_SUGGESTIONS = [
  'Identity in Christ', 'Anxiety & Peace', 'Forgiveness', 'The book of John', 'Prayer', 'The book of Genesis',
  'Suffering & Hope', 'Wisdom',
];
