import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, ChevronLeft, Play, Plus, Trash2, Minus, ListChecks } from 'lucide-react-native';
import type { Sermon, TestamentFilter } from '../lib/types';
import { TOPIC_SUGGESTIONS } from '../lib/bible';
import {
  ReadingPlan,
  PlanOrder,
  buildPlan,
  isDayComplete,
  planMinutes,
  planProgress,
  toggleSermonComplete,
} from '../lib/plans';

interface Props {
  supabase: SupabaseClient;
  openrouterKey: string;
  plans: ReadingPlan[];
  onPlansChange: (plans: ReadingPlan[]) => void;
  onPlay: (sermon: Sermon) => void;
  currentSermonId?: number;
  isPlaying: boolean;
}

const DAY_PRESETS = [7, 14, 30, 60, 90];
const TESTAMENT_OPTIONS: { key: TestamentFilter; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'old', label: 'Old Testament' },
  { key: 'new', label: 'New Testament' },
];
const ORDER_OPTIONS: { key: PlanOrder; label: string }[] = [
  { key: 'canon', label: 'Bible order' },
  { key: 'relevance', label: 'Best match first' },
];

function ProgressBar({ percent }: { percent: number }) {
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${Math.round(percent * 100)}%` }]} />
    </View>
  );
}

export default function PlanScreen({
  supabase,
  openrouterKey,
  plans,
  onPlansChange,
  onPlay,
  currentSermonId,
  isPlaying,
}: Props) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // create form
  const [topic, setTopic] = useState('');
  const [days, setDays] = useState(14);
  const [testament, setTestament] = useState<TestamentFilter>('both'); // preset: both
  const [order, setOrder] = useState<PlanOrder>('canon');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReadingPlan | null>(null);

  const selected = plans.find((p) => p.id === selectedId) || null;

  async function onBuild() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setPreview(null);
    setBuilding(true);
    try {
      const plan = await buildPlan(supabase, { topic, days, testament, order, openrouterKey });
      setPreview(plan);
    } catch (e: any) {
      setError(e?.message || 'Could not build a plan.');
    } finally {
      setBuilding(false);
    }
  }

  function startPlan() {
    if (!preview) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPlansChange([preview, ...plans]);
    setSelectedId(preview.id);
    setPreview(null);
    setTopic('');
    setView('detail');
  }

  function deletePlan(plan: ReadingPlan) {
    Alert.alert('Delete plan?', `"${plan.title}" and its progress will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onPlansChange(plans.filter((p) => p.id !== plan.id));
          setView('list');
        },
      },
    ]);
  }

  function toggle(plan: ReadingPlan, sermonId: number) {
    Haptics.selectionAsync();
    onPlansChange(plans.map((p) => (p.id === plan.id ? toggleSermonComplete(p, sermonId) : p)));
  }

  // ---------------- LIST ----------------
  if (view === 'list') {
    return (
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        <Text style={s.title}>Reading Plans</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => setView('create')}>
          <Plus size={18} color="#FFF" />
          <Text style={s.primaryBtnText}>Create a plan</Text>
        </TouchableOpacity>

        {plans.length === 0 ? (
          <View style={s.empty}>
            <ListChecks size={36} color="#475569" />
            <Text style={s.emptyText}>
              Pick a topic or a book, choose how many days, and Preech Bot will pull the best matching studies into a
              daily plan with a progress tracker.
            </Text>
          </View>
        ) : (
          plans.map((plan) => {
            const prog = planProgress(plan);
            return (
              <TouchableOpacity
                key={plan.id}
                style={s.card}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedId(plan.id);
                  setView('detail');
                }}
              >
                <Text style={s.cardTitle}>{plan.title}</Text>
                <ProgressBar percent={prog.percent} />
                <View style={s.rowBetween}>
                  <Text style={s.muted}>
                    {prog.finished ? 'Completed' : `Day ${prog.nextDay?.day} of ${prog.totalDays}`}
                  </Text>
                  <Text style={s.muted}>{Math.round(prog.percent * 100)}%</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    );
  }

  // ---------------- CREATE ----------------
  if (view === 'create') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 160 }}>
          <TouchableOpacity style={s.backRow} onPress={() => { setView('list'); setPreview(null); setError(null); }}>
            <ChevronLeft size={18} color="#818CF8" />
            <Text style={s.backText}>Plans</Text>
          </TouchableOpacity>
          <Text style={s.title}>Create a Plan</Text>

          <Text style={s.label}>Topic or book</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. The book of Genesis, Identity in Christ"
            placeholderTextColor="#64748B"
            value={topic}
            onChangeText={setTopic}
            returnKeyType="done"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            {TOPIC_SUGGESTIONS.map((t) => (
              <TouchableOpacity key={t} style={s.chip} onPress={() => setTopic(t)}>
                <Text style={s.chipText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.label}>How many days?</Text>
          <View style={s.stepperRow}>
            <TouchableOpacity style={s.stepBtn} onPress={() => setDays(Math.max(1, days - 1))}>
              <Minus size={18} color="#E2E8F0" />
            </TouchableOpacity>
            <Text style={s.stepValue}>{days}</Text>
            <TouchableOpacity style={s.stepBtn} onPress={() => setDays(Math.min(365, days + 1))}>
              <Plus size={18} color="#E2E8F0" />
            </TouchableOpacity>
          </View>
          <View style={s.presetRow}>
            {DAY_PRESETS.map((d) => (
              <TouchableOpacity key={d} style={[s.chip, days === d && s.chipActive]} onPress={() => setDays(d)}>
                <Text style={[s.chipText, days === d && s.chipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Testament</Text>
          <View style={s.segment}>
            {TESTAMENT_OPTIONS.map((o) => (
              <TouchableOpacity key={o.key} style={[s.segBtn, testament === o.key && s.segBtnActive]} onPress={() => setTestament(o.key)}>
                <Text style={[s.segText, testament === o.key && s.segTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Order</Text>
          <View style={s.segment}>
            {ORDER_OPTIONS.map((o) => (
              <TouchableOpacity key={o.key} style={[s.segBtn, order === o.key && s.segBtnActive]} onPress={() => setOrder(o.key)}>
                <Text style={[s.segText, order === o.key && s.segTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.primaryBtn, building && { opacity: 0.6 }]} onPress={onBuild} disabled={building}>
            {building ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryBtnText}>Build my plan</Text>}
          </TouchableOpacity>

          {error && <Text style={s.error}>{error}</Text>}

          {preview && (
            <View style={[s.card, { marginTop: 20 }]}>
              <Text style={s.cardTitle}>{preview.title}</Text>
              <Text style={s.muted}>
                {preview.days.length} days · about {Math.round(planMinutes(preview.days[0]) )} min per day
              </Text>
              {preview.notes.map((n, i) => (
                <Text key={i} style={s.note}>{n}</Text>
              ))}
              <View style={{ marginTop: 10 }}>
                {preview.days.slice(0, 12).map((d) => (
                  <View key={d.day} style={s.previewRow}>
                    <Text style={s.previewDay}>Day {d.day}</Text>
                    <View style={{ flex: 1 }}>
                      {d.sermonIds.map((id) => (
                        <Text key={id} style={s.previewText} numberOfLines={1}>
                          {preview.sermons[id].passage_ref} · {preview.sermons[id].title}
                        </Text>
                      ))}
                    </View>
                  </View>
                ))}
                {preview.days.length > 12 && <Text style={s.muted}>…and {preview.days.length - 12} more days</Text>}
              </View>
              <TouchableOpacity style={[s.primaryBtn, { marginTop: 14 }]} onPress={startPlan}>
                <Text style={s.primaryBtnText}>Start this plan</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---------------- DETAIL ----------------
  if (!selected) {
    return (
      <View style={s.scroll}>
        <TouchableOpacity style={s.backRow} onPress={() => setView('list')}>
          <ChevronLeft size={18} color="#818CF8" />
          <Text style={s.backText}>Plans</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const prog = planProgress(selected);
  return (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={s.rowBetween}>
        <TouchableOpacity style={s.backRow} onPress={() => setView('list')}>
          <ChevronLeft size={18} color="#818CF8" />
          <Text style={s.backText}>Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => deletePlan(selected)}>
          <Trash2 size={18} color="#F87171" />
        </TouchableOpacity>
      </View>
      <Text style={s.title}>{selected.title}</Text>

      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>{prog.finished ? 'Plan complete 🎉' : `Day ${prog.nextDay?.day} of ${prog.totalDays}`}</Text>
          <Text style={s.percent}>{Math.round(prog.percent * 100)}%</Text>
        </View>
        <ProgressBar percent={prog.percent} />
        <Text style={s.muted}>{prog.doneDays} of {prog.totalDays} days finished</Text>
        {!prog.finished && prog.nextDay && (
          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 12 }]}
            onPress={() => onPlay(selected.sermons[prog.nextDay!.sermonIds.find((id) => !selected.completed.includes(id)) ?? prog.nextDay!.sermonIds[0]])}
          >
            <Play size={16} color="#FFF" />
            <Text style={s.primaryBtnText}>Play Day {prog.nextDay.day}</Text>
          </TouchableOpacity>
        )}
      </View>

      {selected.notes.map((n, i) => (
        <Text key={i} style={s.note}>{n}</Text>
      ))}

      {selected.days.map((d) => {
        const done = isDayComplete(selected, d);
        const isNext = prog.nextDay?.day === d.day;
        return (
          <View key={d.day} style={[s.dayCard, isNext && s.dayCardNext, done && { opacity: 0.6 }]}>
            <Text style={s.dayLabel}>DAY {d.day}{isNext ? ' · UP NEXT' : ''}</Text>
            {d.sermonIds.map((id) => {
              const sermon = selected.sermons[id];
              const finished = selected.completed.includes(id);
              const nowPlaying = currentSermonId === id && isPlaying;
              return (
                <View key={id} style={s.sermonRow}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => onPlay(sermon)}>
                    <Text style={s.sermonRef}>{sermon.passage_ref}{nowPlaying ? '  ·  Now playing' : ''}</Text>
                    <Text style={s.sermonTitle} numberOfLines={2}>{sermon.title}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.checkBtn, finished && s.checkBtnDone]} onPress={() => toggle(selected, id)}>
                    {finished && <Check size={16} color="#FFF" />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, paddingHorizontal: 20 },
  title: { color: '#F8FAFC', fontSize: 26, fontFamily: 'Cinzel_700Bold', marginBottom: 16, lineHeight: 32 },
  label: { color: '#94A3B8', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: 'rgba(30, 41, 59, 0.6)', color: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
  chip: { backgroundColor: 'rgba(51, 65, 85, 0.45)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chipActive: { backgroundColor: '#4F46E5', borderColor: '#818CF8' },
  chipText: { color: '#CBD5E1', fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' },
  chipTextActive: { color: '#FFFFFF' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 12 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(51, 65, 85, 0.6)', justifyContent: 'center', alignItems: 'center' },
  stepValue: { color: '#F8FAFC', fontSize: 32, fontFamily: 'Cinzel_700Bold', minWidth: 70, textAlign: 'center' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 18 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(30, 41, 59, 0.6)', borderRadius: 14, padding: 4, marginBottom: 18 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segBtnActive: { backgroundColor: '#4F46E5' },
  segText: { color: '#94A3B8', fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' },
  segTextActive: { color: '#FFFFFF' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4F46E5', paddingVertical: 15, borderRadius: 16 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' },
  error: { color: '#F87171', marginTop: 14, fontFamily: 'PlusJakartaSans_500Medium', lineHeight: 20 },
  note: { color: '#FBBF24', fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 6, fontFamily: 'PlusJakartaSans_500Medium' },
  card: { backgroundColor: 'rgba(30, 41, 59, 0.45)', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 14 },
  cardTitle: { color: '#F8FAFC', fontSize: 17, fontFamily: 'Cinzel_700Bold', marginBottom: 10 },
  percent: { color: '#818CF8', fontSize: 17, fontFamily: 'PlusJakartaSans_700Bold' },
  muted: { color: '#94A3B8', fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  barFill: { height: 8, backgroundColor: '#818CF8', borderRadius: 4 },
  empty: { alignItems: 'center', marginTop: 50, paddingHorizontal: 20, gap: 12 },
  emptyText: { color: '#94A3B8', textAlign: 'center', lineHeight: 22, fontFamily: 'PlusJakartaSans_500Medium' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  backText: { color: '#818CF8', fontFamily: 'PlusJakartaSans_700Bold' },
  previewRow: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
  previewDay: { color: '#818CF8', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, width: 48 },
  previewText: { color: '#CBD5E1', fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' },
  dayCard: { backgroundColor: 'rgba(30, 41, 59, 0.35)', borderRadius: 16, padding: 14, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  dayCardNext: { borderColor: '#6366F1', backgroundColor: 'rgba(30, 27, 75, 0.5)' },
  dayLabel: { color: '#A5B4FC', fontSize: 10, letterSpacing: 1, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 8 },
  sermonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  sermonRef: { color: '#94A3B8', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', textTransform: 'uppercase' },
  sermonTitle: { color: '#F8FAFC', fontSize: 15, fontFamily: 'Cinzel_700Bold', marginTop: 2 },
  checkBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#475569', justifyContent: 'center', alignItems: 'center' },
  checkBtnDone: { backgroundColor: '#22C55E', borderColor: '#22C55E' },
});
