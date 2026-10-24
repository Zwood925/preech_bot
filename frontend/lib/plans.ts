import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sermon, TestamentFilter } from './types';
import { BOOK_TESTAMENT, canonicalSortKey, detectBookFromTopic } from './bible';
import { fetchBookSermons, searchSermons } from './api';

const STORAGE_KEY = 'preechbot.plans.v1';
export const AVG_MINUTES_PER_STUDY = 17;

export type PlanOrder = 'canon' | 'relevance';

export interface PlanDay {
  day: number;
  sermonIds: number[];
}

export interface ReadingPlan {
  id: string;
  title: string;
  topic: string;
  testament: TestamentFilter;
  order: PlanOrder;
  createdAt: string;
  days: PlanDay[];
  /** Snapshot of each study so the plan works without loading the whole library. */
  sermons: Record<number, Sermon>;
  completed: number[];
  /** Human-readable notes from the builder (e.g. "trimmed to 14 days"). */
  notes: string[];
}

export interface BuildPlanParams {
  topic: string;
  days: number;
  testament: TestamentFilter;
  order: PlanOrder;
  openrouterKey: string;
}

// ---------- persistence ----------

export async function loadPlans(): Promise<ReadingPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReadingPlan[]) : [];
  } catch {
    return [];
  }
}

export async function savePlans(plans: ReadingPlan[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (e) {
    console.warn('Could not save plans', e);
  }
}

// ---------- progress ----------

export function isDayComplete(plan: ReadingPlan, day: PlanDay): boolean {
  return day.sermonIds.every((id) => plan.completed.includes(id));
}

export function planProgress(plan: ReadingPlan) {
  const totalDays = plan.days.length;
  const doneDays = plan.days.filter((d) => isDayComplete(plan, d)).length;
  const nextDay = plan.days.find((d) => !isDayComplete(plan, d)) ?? null;
  return {
    totalDays,
    doneDays,
    percent: totalDays ? doneDays / totalDays : 0,
    nextDay,
    finished: totalDays > 0 && doneDays === totalDays,
  };
}

export function toggleSermonComplete(plan: ReadingPlan, sermonId: number, done?: boolean): ReadingPlan {
  const has = plan.completed.includes(sermonId);
  const want = done ?? !has;
  if (want === has) return plan;
  return { ...plan, completed: want ? [...plan.completed, sermonId] : plan.completed.filter((i) => i !== sermonId) };
}

export function planMinutes(day: PlanDay): number {
  return day.sermonIds.length * AVG_MINUTES_PER_STUDY;
}

// ---------- building ----------

function distribute(ids: number[], days: number): PlanDay[] {
  const n = Math.max(1, Math.min(days, ids.length));
  const base = Math.floor(ids.length / n);
  const extra = ids.length % n;
  const out: PlanDay[] = [];
  let idx = 0;
  for (let d = 0; d < n; d++) {
    const size = base + (d < extra ? 1 : 0);
    out.push({ day: d + 1, sermonIds: ids.slice(idx, idx + size) });
    idx += size;
  }
  return out;
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * Builds a plan (not yet saved).
 *  - Topic is a book ("The book of Genesis"): every study in that book, in order, spread across the days.
 *  - Otherwise: semantic search for the best-matching studies (one per day), with a per-book cap so one
 *    book can't swamp the plan, ordered by Bible order or by relevance.
 */
export async function buildPlan(supabase: SupabaseClient, p: BuildPlanParams): Promise<ReadingPlan> {
  const topic = p.topic.trim();
  if (!topic) throw new Error('Enter a topic or a book of the Bible.');
  const days = Math.max(1, Math.min(365, Math.round(p.days)));
  const notes: string[] = [];
  const book = detectBookFromTopic(topic);

  let picked: Sermon[];
  let dayList: PlanDay[];
  let title: string;

  if (book) {
    const t = BOOK_TESTAMENT[book];
    if ((p.testament === 'old' && t === 'NT') || (p.testament === 'new' && t === 'OT')) {
      throw new Error(`${book} is in the ${t === 'OT' ? 'Old' : 'New'} Testament. Change the testament filter to include it.`);
    }
    picked = await fetchBookSermons(supabase, book);
    if (picked.length === 0) throw new Error(`No studies for ${book} have been generated yet. Check back soon.`);
    picked.sort((a, b) => canonicalSortKey(a) - canonicalSortKey(b));
    dayList = distribute(picked.map((s) => s.id), days);
    title = `${book}`;
    if (picked.length < days) {
      notes.push(`Only ${picked.length} studies exist for ${book} so far, so the plan was shortened to ${dayList.length} days. New studies arrive daily.`);
    } else if (picked.length > dayList.length) {
      notes.push(`${picked.length} studies spread across ${dayList.length} days (about ${Math.round(picked.length / dayList.length * 10) / 10} per day).`);
    }
  } else {
    const candidates = await searchSermons(supabase, p.openrouterKey, topic, {
      testament: p.testament,
      count: Math.max(days * 4, 40),
      threshold: 0.05,
      requireAudio: true,
    });
    if (candidates.length === 0) throw new Error('No studies matched that topic yet. Try a broader topic or testament = Both.');

    const cap = Math.max(2, Math.ceil(days / 3));
    const perBook: Record<string, number> = {};
    const chosen: Sermon[] = [];
    for (const c of candidates) {
      if (chosen.length >= days) break;
      if ((perBook[c.book] || 0) >= cap) continue;
      perBook[c.book] = (perBook[c.book] || 0) + 1;
      chosen.push(c);
    }
    for (const c of candidates) {
      if (chosen.length >= days) break;
      if (!chosen.includes(c)) chosen.push(c);
    }
    picked =
      p.order === 'canon'
        ? [...chosen].sort((a, b) => canonicalSortKey(a) - canonicalSortKey(b))
        : [...chosen].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    dayList = picked.map((s, i) => ({ day: i + 1, sermonIds: [s.id] }));
    title = titleCase(topic);
    if (picked.length < days) {
      notes.push(`Only ${picked.length} relevant studies were found, so the plan was shortened to ${picked.length} days. The library grows daily.`);
    }
  }

  const sermons: Record<number, Sermon> = {};
  picked.forEach((s) => (sermons[s.id] = s));

  return {
    id: `${Date.now()}`,
    title: `${title} · ${dayList.length}-Day Plan`,
    topic,
    testament: p.testament,
    order: p.order,
    createdAt: new Date().toISOString(),
    days: dayList,
    sermons,
    completed: [],
    notes,
  };
}
