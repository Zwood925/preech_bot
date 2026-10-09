import React, { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  Canvas,
  Circle,
  Blur,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Bookmark,
  MessageSquare,
  Search,
  BookOpen,
  Headphones,
  Sparkles,
  Share2,
} from 'lucide-react-native';
import { useFonts, Cinzel_700Bold, Cinzel_900Black } from '@expo-google-fonts/cinzel';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { supabase } from './supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0, 0.8];
const OPENROUTER_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

// Mock waveform heights for the visualizer
const WAVEFORM_BARS = [
  0.3, 0.5, 0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 1.0, 0.5, 0.8, 0.3, 0.6, 0.9, 0.4, 0.7,
  0.5, 0.8, 0.3, 0.6, 1.0, 0.7, 0.4, 0.9, 0.5, 0.8, 0.3, 0.6, 0.9, 0.4, 0.7, 0.5,
  0.8, 0.3, 0.6, 1.0, 0.7, 0.4, 0.9, 0.5,
];

interface Sermon {
  id: number;
  passage_ref: string;
  title: string;
  book: string;
  chapter?: number;
  sermon_text: string;
  audio_url: string;
  created_at: string;
  similarity?: number;
}

interface BookmarkItem {
  id: number;
  timestamp_seconds: number;
  note: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Cinzel_700Bold,
    Cinzel_900Black,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_700Bold,
  });

  const [activeTab, setActiveTab] = useState<'player' | 'library'>('player');
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [currentSermon, setCurrentSermon] = useState<Sermon | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isVectorSearching, setIsVectorSearching] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [speedIndex, setSpeedIndex] = useState<number>(0);

  // Bookmark Modal
  const [bookmarkModalVisible, setBookmarkModalVisible] = useState<boolean>(false);
  const [bookmarkTime, setBookmarkTime] = useState<number>(0);
  const [noteText, setNoteText] = useState<string>('');

  // Ask Pastor Chat Modal
  const [chatVisible, setChatVisible] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);

  // Reanimated Shared Values for Fluid Background
  const animX = useSharedValue(SCREEN_WIDTH * 0.3);
  const animY = useSharedValue(180);

  useEffect(() => {
    animX.value = withRepeat(
      withTiming(SCREEN_WIDTH * 0.7, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    animY.value = withRepeat(
      withTiming(260, { duration: 8000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    fetchAllSermons();
  }, []);

  async function fetchAllSermons() {
    try {
      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .order('id', { ascending: false });

      if (error) console.error('Error fetching sermons:', error);
      if (data && data.length > 0) {
        setSermons(data);
        if (!currentSermon) {
          selectSermon(data[0], false);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function selectSermon(sermon: Sermon, autoPlay: boolean = true) {
    Haptics.selectionAsync();
    setCurrentSermon(sermon);
    setChatMessages([]);
    fetchBookmarks(sermon.id);

    if (sermon.audio_url) {
      setAudioUrl(sermon.audio_url);
      if (autoPlay && player) {
        try {
          player.replace(sermon.audio_url);
          player.play();
        } catch (err) {
          console.warn('Audio swap deferred:', err);
        }
      }
    }
  }

  async function fetchBookmarks(sermonId: number) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('sermon_id', sermonId)
      .order('timestamp_seconds', { ascending: true });

    if (!error && data) {
      setBookmarks(data);
    }
  }

  function togglePlayback() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!audioUrl) return;
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  function cycleSpeed() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    const newSpeed = SPEED_OPTIONS[nextIndex];
    setSpeedIndex(nextIndex);
    player.setPlaybackRate(newSpeed);
  }

  function skip(seconds: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = status.currentTime || 0;
    const target = Math.max(0, Math.min(current + seconds, status.duration || 0));
    player.seekTo(target);
  }

  function openBookmarkModal() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    player.pause();
    setBookmarkTime(status.currentTime || 0);
    setNoteText('');
    setBookmarkModalVisible(true);
  }

  async function saveBookmark() {
    if (!currentSermon) return;

    const { data, error } = await supabase
      .from('bookmarks')
      .insert({
        sermon_id: currentSermon.id,
        timestamp_seconds: bookmarkTime,
        note: noteText.trim() || 'Bookmarked moment',
      })
      .select();

    if (!error && data) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBookmarks([...bookmarks, data[0]].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
    }
    setBookmarkModalVisible(false);
  }

  async function performVectorSearch() {
    if (!searchQuery.trim()) {
      fetchAllSermons();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVectorSearching(true);
    try {
      const embRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/text-embedding-3-small',
          input: searchQuery,
        }),
      });
      const embData = await embRes.json();
      const queryEmbedding = embData?.data?.[0]?.embedding;

      if (queryEmbedding) {
        const { data, error } = await supabase.rpc('match_sermons', {
          query_embedding: queryEmbedding,
          match_threshold: 0.1,
          match_count: 10,
        });

        if (!error && data) {
          setSermons(data);
        }
      }
    } catch (err) {
      console.error('Vector search error:', err);
    } finally {
      setIsVectorSearching(false);
    }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || !currentSermon) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg = chatInput.trim();
    setChatInput('');
    const updatedHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(updatedHistory);
    setIsChatLoading(true);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [
            {
              role: 'system',
              content: `You are a thoughtful, pastoral scholar. Answer questions based on the following sermon context:\n\nPassage: ${currentSermon.passage_ref}\nTitle: ${currentSermon.title}\nTranscript: ${currentSermon.sermon_text}\n\nProvide practical, concise, encouraging answers (2-3 paragraphs max).`,
            },
            ...updatedHistory,
          ],
        }),
      });

      const resData = await response.json();
      const assistantReply =
        resData.choices?.[0]?.message?.content ||
        'I could not generate an answer at this time. Please check your network connection.';

      setChatMessages([...updatedHistory, { role: 'assistant', content: assistantReply }]);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsChatLoading(false);
    }
  }

  function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  const currentPos = status.currentTime || 0;
  const duration = status.duration || 1;
  const progressPercent = Math.min(1, Math.max(0, currentPos / duration));

  if (loading || !fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#818CF8" />
        <Text style={styles.loadingText}>PREECH BOT</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Living Skia GPU Liquid Aurora Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Canvas style={{ flex: 1 }}>
          <Circle cx={SCREEN_WIDTH * 0.5} cy={200} r={220}>
            <RadialGradient
              c={vec(SCREEN_WIDTH * 0.5, 200)}
              r={220}
              colors={[
                player.playing ? 'rgba(99, 102, 241, 0.35)' : 'rgba(79, 70, 229, 0.2)',
                'rgba(14, 165, 233, 0.12)',
                'transparent',
              ]}
            />
            <Blur blur={60} />
          </Circle>
        </Canvas>
      </View>

      {/* Large Background Watermark for Visual Depth */}
      <View style={styles.watermarkWrapper} pointerEvents="none">
        <Text style={styles.watermarkText}>
          {currentSermon?.book.toUpperCase() || 'PREECH'}
        </Text>
      </View>

      {activeTab === 'player' ? (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.topHeader}>
            <View style={styles.badgeCapsule}>
              <Sparkles size={12} color="#A5B4FC" />
              <Text style={styles.badgeText}>{currentSermon?.passage_ref || 'Scripture'}</Text>
            </View>
            <Text style={styles.serifHeroTitle}>{currentSermon?.title || 'No Sermon Selected'}</Text>
          </View>

          {/* Artistic Scripture Visual Cover Art Card */}
          <View style={styles.artCardContainer}>
            <LinearGradient
              style={StyleSheet.absoluteFill}
              colors={['#4F46E5', '#06B6D4', '#0F172A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <BlurView intensity={20} tint="dark" style={styles.artCardGlass}>
              <Text style={styles.artCardChapterText}>
                {currentSermon?.book} {currentSermon?.chapter ? `Chapter ${currentSermon.chapter}` : ''}
              </Text>
              <Text style={styles.artCardSubtext}>AUDIO EXEGETICAL STUDY</Text>
            </BlurView>
          </View>

          {/* Frosted Audio Player Card */}
          <BlurView intensity={45} tint="dark" style={styles.glassPlayerCard}>
            {/* Custom Interactive Skia Waveform Scrubber */}
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.waveformContainer}
              onPress={(e) => {
                const clickX = e.nativeEvent.locationX;
                const containerWidth = SCREEN_WIDTH - 80;
                const targetPercent = Math.max(0, Math.min(1, clickX / containerWidth));
                player.seekTo(targetPercent * duration);
                Haptics.selectionAsync();
              }}
            >
              <View style={styles.waveformRow}>
                {WAVEFORM_BARS.map((heightFactor, idx) => {
                  const barProgress = idx / WAVEFORM_BARS.length;
                  const isActive = barProgress <= progressPercent;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.waveformBar,
                        {
                          height: Math.max(8, heightFactor * 32),
                          backgroundColor: isActive ? '#818CF8' : 'rgba(255, 255, 255, 0.15)',
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </TouchableOpacity>

            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentPos)}</Text>
              <Text style={styles.timeText}>-{formatTime(Math.max(0, duration - currentPos))}</Text>
            </View>

            {/* Transport Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity style={styles.speedCapsule} onPress={cycleSpeed}>
                <Text style={styles.speedText}>{SPEED_OPTIONS[speedIndex]}x</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconCircleBtn} onPress={() => skip(-10)}>
                <RotateCcw size={20} color="#CBD5E1" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.glowingPlayBtn} onPress={togglePlayback}>
                {player.playing ? (
                  <Pause size={28} color="#FFFFFF" />
                ) : (
                  <Play size={28} color="#FFFFFF" style={{ marginLeft: 3 }} />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconCircleBtn} onPress={() => skip(10)}>
                <RotateCw size={20} color="#CBD5E1" />
              </TouchableOpacity>
            </View>

            {/* Secondary Action Row */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.glassActionPill} onPress={openBookmarkModal}>
                <Bookmark size={15} color="#818CF8" />
                <Text style={styles.actionPillText}>Bookmark</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.highlightActionPill} onPress={() => setChatVisible(true)}>
                <MessageSquare size={15} color="#FFFFFF" />
                <Text style={styles.highlightPillText}>Ask Pastor</Text>
              </TouchableOpacity>
            </View>
          </BlurView>

          {/* Bookmarks Carousel */}
          {bookmarks.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionHeaderLabel}>Saved Bookmarks</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {bookmarks.map((bm) => (
                  <TouchableOpacity
                    key={bm.id}
                    style={styles.bookmarkChip}
                    onPress={() => {
                      Haptics.selectionAsync();
                      player.seekTo(bm.timestamp_seconds);
                    }}
                  >
                    <Text style={styles.chipTime}>{formatTime(bm.timestamp_seconds)}</Text>
                    <Text style={styles.chipNote} numberOfLines={1}>
                      {bm.note}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Transcript Reader */}
          <View style={styles.transcriptContainer}>
            <Text style={styles.sectionHeaderLabel}>Sermon Transcript</Text>
            <Text style={styles.transcriptBodyText}>
              {currentSermon?.sermon_text || 'Select a sermon from the library.'}
            </Text>
          </View>
        </ScrollView>
      ) : (
        /* Library View */
        <View style={styles.libraryContainer}>
          <Text style={styles.serifLibraryTitle}>Sermon Library</Text>

          {/* AI Vector Search Input */}
          <View style={styles.searchBarRow}>
            <TextInput
              style={styles.searchBarFlex}
              placeholder="Search concepts, topics, or scripture..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={performVectorSearch}
            />
            <TouchableOpacity style={styles.searchBtnSquare} onPress={performVectorSearch}>
              {isVectorSearching ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Search size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={sermons}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchAllSermons();
                }}
                tintColor="#818CF8"
              />
            }
            renderItem={({ item }) => {
              const isSelected = currentSermon?.id === item.id;
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.cardTouchWrapper}
                  onPress={() => selectSermon(item, true)}
                >
                  <BlurView
                    intensity={isSelected ? 50 : 25}
                    tint="dark"
                    style={[styles.libraryGlassCard, isSelected && styles.activeLibraryCard]}
                  >
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.cardBadgeText}>{item.passage_ref}</Text>
                      {item.similarity && (
                        <Text style={styles.matchScoreText}>
                          {Math.round(item.similarity * 100)}% match
                        </Text>
                      )}
                      {isSelected && player.playing && (
                        <View style={styles.playingPill}>
                          <Headphones size={11} color="#22C55E" />
                          <Text style={styles.playingText}>Now Playing</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.serifCardTitle}>{item.title}</Text>
                    <Text style={styles.cardSnippetText} numberOfLines={2}>
                      {item.sermon_text}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Floating Bottom Nav */}
      <BlurView intensity={60} tint="dark" style={styles.floatingNavGlass}>
        <TouchableOpacity
          style={[styles.navTab, activeTab === 'player' && styles.navTabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('player');
          }}
        >
          <Headphones size={20} color={activeTab === 'player' ? '#818CF8' : '#64748B'} />
          <Text style={[styles.navText, activeTab === 'player' && styles.navTextActive]}>Playing</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'library' && styles.navTabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('library');
          }}
        >
          <BookOpen size={20} color={activeTab === 'library' ? '#818CF8' : '#64748B'} />
          <Text style={[styles.navText, activeTab === 'library' && styles.navTextActive]}>
            Library ({sermons.length})
          </Text>
        </TouchableOpacity>
      </BlurView>

      {/* Bookmark Modal */}
      <Modal visible={bookmarkModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <BlurView intensity={70} tint="dark" style={styles.modalGlassBox}>
            <Text style={styles.modalTitleText}>Add Note at {formatTime(bookmarkTime)}</Text>
            <TextInput
              style={styles.modalInputArea}
              placeholder="What insight stood out to you?"
              placeholderTextColor="#64748B"
              value={noteText}
              onChangeText={setNoteText}
              multiline
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBookmarkModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveBookmark}>
                <Text style={styles.saveBtnText}>Save Bookmark</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* Ask Pastor Chat Drawer */}
      <Modal visible={chatVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <BlurView intensity={85} tint="dark" style={styles.chatModalGlass}>
            <View style={styles.chatHeaderRow}>
              <Text style={styles.chatTitleText}>Ask About This Sermon</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setChatVisible(false);
                }}
              >
                <Text style={styles.chatCloseText}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.chatScrollView} showsVerticalScrollIndicator={false}>
              {chatMessages.length === 0 ? (
                <Text style={styles.emptyChatText}>
                  Ask any question about {currentSermon?.passage_ref} or how to apply this message to your life.
                </Text>
              ) : (
                chatMessages.map((msg, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.chatBubble,
                      msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
                    ]}
                  >
                    <Text style={styles.chatBubbleText}>{msg.content}</Text>
                  </View>
                ))
              )}
              {isChatLoading && (
                <ActivityIndicator size="small" color="#818CF8" style={{ marginVertical: 12 }} />
              )}
            </ScrollView>

            <View style={styles.chatInputBarRow}>
              <TextInput
                style={styles.chatInputFlex}
                placeholder="Type your question..."
                placeholderTextColor="#64748B"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMessage}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={sendChatMessage}>
                <Text style={styles.chatSendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A12', paddingTop: 55 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#070A12' },
  loadingText: { marginTop: 12, color: '#818CF8', fontFamily: 'Cinzel_700Bold', letterSpacing: 2 },
  scrollArea: { flex: 1, paddingHorizontal: 20 },

  watermarkWrapper: { position: 'absolute', top: 120, left: 10, right: 0, opacity: 0.03 },
  watermarkText: { color: '#FFFFFF', fontSize: 72, fontFamily: 'Cinzel_900Black', letterSpacing: -2 },

  topHeader: { marginBottom: 16 },
  badgeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
    marginBottom: 8,
  },
  badgeText: { color: '#C7D2FE', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
  serifHeroTitle: { color: '#F8FAFC', fontSize: 25, fontFamily: 'Cinzel_700Bold', lineHeight: 33 },

  artCardContainer: {
    height: 140,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artCardGlass: { padding: 16, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  artCardChapterText: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Cinzel_700Bold' },
  artCardSubtext: { color: '#94A3B8', fontSize: 10, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1.5, marginTop: 2 },

  glassPlayerCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.45)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  waveformContainer: { height: 44, justifyContent: 'center', marginBottom: 6 },
  waveformRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  waveformBar: { flex: 1, borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  timeText: { color: '#94A3B8', fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' },

  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 8 },
  speedCapsule: { backgroundColor: 'rgba(51, 65, 85, 0.6)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  speedText: { color: '#F8FAFC', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  iconCircleBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(51, 65, 85, 0.5)', justifyContent: 'center', alignItems: 'center' },
  glowingPlayBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)' },
  glassActionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(51, 65, 85, 0.4)', paddingVertical: 10, borderRadius: 12 },
  actionPillText: { color: '#C7D2FE', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  highlightActionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#4338CA', paddingVertical: 10, borderRadius: 12 },
  highlightPillText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },

  sectionContainer: { marginBottom: 20 },
  sectionHeaderLabel: { color: '#94A3B8', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  bookmarkChip: { backgroundColor: 'rgba(30, 41, 59, 0.6)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginRight: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', maxWidth: 150 },
  chipTime: { color: '#818CF8', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  chipNote: { color: '#E2E8F0', fontSize: 12, marginTop: 2, fontFamily: 'PlusJakartaSans_500Medium' },

  transcriptContainer: { backgroundColor: 'rgba(30, 41, 59, 0.4)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 100 },
  transcriptBodyText: { color: '#CBD5E1', fontSize: 16, lineHeight: 28, fontFamily: 'PlusJakartaSans_500Medium' },

  libraryContainer: { flex: 1, paddingHorizontal: 20 },
  serifLibraryTitle: { color: '#F8FAFC', fontSize: 28, fontFamily: 'Cinzel_700Bold', marginBottom: 16 },
  searchBarRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  searchBarFlex: { flex: 1, backgroundColor: 'rgba(30, 41, 59, 0.6)', color: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: 'PlusJakartaSans_500Medium', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)' },
  searchBtnSquare: { backgroundColor: '#4F46E5', borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },

  cardTouchWrapper: { marginBottom: 12 },
  libraryGlassCard: { backgroundColor: 'rgba(30, 41, 59, 0.4)', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', overflow: 'hidden' },
  activeLibraryCard: { borderColor: '#6366F1', backgroundColor: 'rgba(30, 27, 75, 0.5)' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardBadgeText: { color: '#A5B4FC', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, textTransform: 'uppercase' },
  matchScoreText: { color: '#10B981', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },
  playingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34, 197, 94, 0.15)', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10 },
  playingText: { color: '#22C55E', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, textTransform: 'uppercase' },
  serifCardTitle: { color: '#F8FAFC', fontSize: 18, fontFamily: 'Cinzel_700Bold', marginBottom: 6 },
  cardSnippetText: { color: '#94A3B8', fontSize: 13, lineHeight: 19, fontFamily: 'PlusJakartaSans_500Medium' },

  floatingNavGlass: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: 'rgba(7, 10, 18, 0.8)', paddingBottom: 28, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)' },
  navTab: { flex: 1, alignItems: 'center', gap: 4 },
  navTabActive: {},
  navText: { color: '#64748B', fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' },
  navTextActive: { color: '#F8FAFC', fontFamily: 'PlusJakartaSans_700Bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalGlassBox: { width: '100%', backgroundColor: 'rgba(30, 41, 59, 0.85)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  modalTitleText: { color: '#F8FAFC', fontSize: 18, fontFamily: 'Cinzel_700Bold', marginBottom: 14 },
  modalInputArea: { backgroundColor: '#070A12', color: '#F8FAFC', borderRadius: 14, padding: 14, minHeight: 90, textAlignVertical: 'top', marginBottom: 18, fontFamily: 'PlusJakartaSans_500Medium' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelBtnText: { color: '#94A3B8', fontFamily: 'PlusJakartaSans_700Bold' },
  saveBtn: { backgroundColor: '#4F46E5', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12 },
  saveBtnText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold' },

  chatModalGlass: { width: '100%', height: '82%', backgroundColor: 'rgba(30, 41, 59, 0.9)', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  chatHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.08)' },
  chatTitleText: { color: '#F8FAFC', fontSize: 18, fontFamily: 'Cinzel_700Bold' },
  chatCloseText: { color: '#818CF8', fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' },
  chatScrollView: { flex: 1, marginBottom: 12 },
  emptyChatText: { color: '#94A3B8', textAlign: 'center', marginTop: 40, fontSize: 14, lineHeight: 22, fontFamily: 'PlusJakartaSans_500Medium' },
  chatBubble: { padding: 14, borderRadius: 16, marginBottom: 10, maxWidth: '85%' },
  userBubble: { backgroundColor: '#4F46E5', alignSelf: 'flex-end' },
  assistantBubble: { backgroundColor: 'rgba(51, 65, 85, 0.6)', alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  chatBubbleText: { color: '#F8FAFC', fontSize: 14, lineHeight: 22, fontFamily: 'PlusJakartaSans_500Medium' },
  chatInputBarRow: { flexDirection: 'row', gap: 10 },
  chatInputFlex: { flex: 1, backgroundColor: '#070A12', color: '#F8FAFC', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'PlusJakartaSans_500Medium' },
  chatSendBtn: { backgroundColor: '#4F46E5', borderRadius: 14, paddingHorizontal: 18, justifyContent: 'center' },
  chatSendBtnText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold' },
});