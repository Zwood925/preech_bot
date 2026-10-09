import React, { useEffect, useState, useRef } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import {
  Canvas,
  Circle,
  Blur,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Home,
  Headphones,
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Bookmark,
  MessageSquare,
  Search,
  Sparkles,
  Calendar,
  Share2,
  Quote,
  Download,
  CheckCircle2,
  X,
  ChevronRight,
  AlertCircle,
} from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useFonts, Cinzel_700Bold, Cinzel_900Black } from '@expo-google-fonts/cinzel';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { supabase } from './supabase';

import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync();

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0, 0.8];
const OPENROUTER_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

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

  const [activeTab, setActiveTab] = useState<'home' | 'player' | 'library'>('home');
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [currentSermon, setCurrentSermon] = useState<Sermon | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isVectorSearching, setIsVectorSearching] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [speedIndex, setSpeedIndex] = useState<number>(0);
  
  // Debug State
  const [debugError, setDebugError] = useState<string | null>(null);

  // Offline Download State
  const [downloadedSermonIds, setDownloadedSermonIds] = useState<number[]>([]);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Bookmark Modal
  const [bookmarkModalVisible, setBookmarkModalVisible] = useState<boolean>(false);
  const [bookmarkTime, setBookmarkTime] = useState<number>(0);
  const [noteText, setNoteText] = useState<string>('');

  // Ask Pastor Chat Modal
  const [chatVisible, setChatVisible] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

  // Social Share Card Modal
  const [shareModalVisible, setShareModalVisible] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const cardViewShotRef = useRef<any>(null);

  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);

  const badgePulse = useSharedValue(1);
  const documentDir = (FileSystem as any).documentDirectory || '';

  useEffect(() => {
    badgePulse.value = withRepeat(
      withTiming(1.2, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    
    // Safety timeout to prevent infinite spinner
    const timeout = setTimeout(() => {
      if (loading || !fontsLoaded) {
        setDebugError(`Loading timed out after 8 seconds.\nFonts Loaded: ${fontsLoaded}\nSermons Fetched: ${sermons.length > 0}`);
        setLoading(false);
      }
    }, 8000);

    fetchAllSermons().finally(() => clearTimeout(timeout));
  }, [fontsLoaded]);

  useEffect(() => {
    if (currentSermon) {
      checkIfDownloaded(currentSermon.id);
    }
  }, [currentSermon]);

  useEffect(() => {
    if (!loading && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loading, fontsLoaded]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgePulse.value }],
  }));

  

  async function fetchAllSermons() {
    try {
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        setDebugError(`Missing Env Vars!\nURL: ${url ? 'OK' : 'MISSING'}\nKEY: ${key ? 'OK' : 'MISSING'}`);
        return;
      }

      const { data, error } = await supabase
        .from('sermons')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        console.error('Error fetching sermons:', error);
        setDebugError(`DB Error: ${error.message}`);
      }
      if (data && data.length > 0) {
        setSermons(data);
        if (!currentSermon) {
          selectSermon(data[0], false);
        }
      } else {
        if (!error) setDebugError('No studies found in database.');
      }
    } catch (err: any) {
      console.error(err);
      setDebugError(`Exception: ${err.message || String(err)}`);
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

  function playFromHome(sermon: Sermon) {
    selectSermon(sermon, true);
    setActiveTab('player');
  }

  async function checkIfDownloaded(sermonId: number) {
    const localUri = `${documentDir}sermon_${sermonId}.mp3`;
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && !downloadedSermonIds.includes(sermonId)) {
      setDownloadedSermonIds((prev) => [...prev, sermonId]);
    }
  }

  async function downloadSermonForOffline(sermon: Sermon) {
    if (!sermon.audio_url) return;
    const localUri = `${documentDir}sermon_${sermon.id}.mp3`;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsDownloading(true);

    try {
      const downloadRes = await FileSystem.downloadAsync(sermon.audio_url, localUri);
      if (downloadRes.status === 200) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDownloadedSermonIds((prev) => [...prev, sermon.id]);
        setAudioUrl(localUri);
      }
    } catch (err) {
      console.error('Offline download failed:', err);
    } finally {
      setIsDownloading(false);
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

  function openShareModal(quoteText: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedQuote(quoteText);
    setShareModalVisible(true);
  }

  async function exportAndShareCard() {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (cardViewShotRef.current) {
        const uri = await captureRef(cardViewShotRef, {
          format: 'png',
          quality: 1,
        });
        await Sharing.shareAsync(uri);
      }
    } catch (err) {
      console.error('Failed to capture or share quote card:', err);
    }
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

  const paragraphs = currentSermon?.sermon_text.split('\n\n') || [];
  const activeParagraphIndex = Math.min(
    paragraphs.length - 1,
    Math.floor(progressPercent * paragraphs.length)
  );

  // Diagnostic Error Render
  if (debugError) {
    return (
      <View style={[styles.center, { padding: 32 }]}>
        <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
        <Text style={{ color: '#F8FAFC', fontSize: 20, fontWeight: '700', marginBottom: 16 }}>Diagnostic Error</Text>
        <Text style={{ color: '#EF4444', textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 12 }}>
          {debugError}
        </Text>
        <TouchableOpacity style={{ marginTop: 24, backgroundColor: '#312E81', padding: 12, borderRadius: 12 }} onPress={() => { setDebugError(null); setLoading(true); fetchAllSermons(); }}>
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Retry Connection</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
      {/* Background Liquid Aura */}
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

      {/* Background Watermark */}
      <View style={styles.watermarkWrapper} pointerEvents="none">
        <Text style={styles.watermarkText}>
          {currentSermon?.book.toUpperCase() || 'PREECH'}
        </Text>
      </View>

      {/* 1. HOME TAB */}
      {activeTab === 'home' && (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          <View style={styles.topHeader}>
            <View style={styles.headerPillRow}>
              <Text style={styles.editorialSubHeader}>PREECH BOT</Text>
              <View style={styles.dailyBadgeWrapper}>
                <Animated.View style={[styles.pulseDot, badgeAnimatedStyle]} />
                <Text style={styles.dailyBadgeText}>UPDATED TODAY</Text>
              </View>
            </View>
            <Text style={styles.serifHeroTitle}>Daily Edition</Text>
          </View>

          {/* Today's Featured Study Hero */}
          {currentSermon && (
            <View style={styles.homeHeroCardContainer}>
              <LinearGradient
                style={StyleSheet.absoluteFill}
                colors={['#312E81', '#1E1B4B', '#0F172A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.homeHeroInner}>
                <View style={styles.homeHeroBadgeRow}>
                  <View style={styles.badgeCapsule}>
                    <Sparkles size={12} color="#A5B4FC" />
                    <Text style={styles.badgeText}>{currentSermon.passage_ref}</Text>
                  </View>
                  <Text style={styles.homeHeroIssueText}>STUDY #{currentSermon.id}</Text>
                </View>

                <Text style={styles.homeHeroTitle}>{currentSermon.title}</Text>
                <Text style={styles.homeHeroSubtitle}>
                  EXEGETICAL COMMENTARY & AUDIO REFLECTION
                </Text>

                <TouchableOpacity
                  style={styles.homePlayCTA}
                  onPress={() => playFromHome(currentSermon)}
                >
                  <Play size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
                  <Text style={styles.homePlayCTAText}>Play Today's Study</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Recent Daily Broadcasts Feed */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeaderLabel}>Recent Daily Broadcasts</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sermons.slice(0, 8).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recentIssueCard}
                  onPress={() => playFromHome(item)}
                >
                  <BlurView intensity={35} tint="dark" style={styles.recentIssueInner}>
                    <Text style={styles.recentIssuePassage}>{item.passage_ref}</Text>
                    <Text style={styles.recentIssueTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.recentIssueFooter}>
                      <Text style={styles.recentIssueAction}>Listen</Text>
                      <ChevronRight size={14} color="#818CF8" />
                    </View>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {/* 2. PLAYER TAB */}
      {activeTab === 'player' && (
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          <View style={styles.topHeader}>
            <View style={styles.headerPillRow}>
              <View style={styles.badgeCapsule}>
                <Sparkles size={12} color="#A5B4FC" />
                <Text style={styles.badgeText}>{currentSermon?.passage_ref || 'Scripture'}</Text>
              </View>

              <View style={styles.dailyBadgeWrapper}>
                <Animated.View style={[styles.pulseDot, badgeAnimatedStyle]} />
                <Text style={styles.dailyBadgeText}>NEW STUDIES DAILY</Text>
              </View>
            </View>

            <Text style={styles.serifHeroTitle}>{currentSermon?.title || 'No Sermon Selected'}</Text>
          </View>

          {/* Magazine Hero Header */}
          <View style={styles.magazineHeroContainer}>
            <LinearGradient
              style={StyleSheet.absoluteFill}
              colors={['#312E81', '#1E1B4B', '#0F172A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.magazineHeroInner}>
              <View style={styles.magazineTopBar}>
                <Text style={styles.magazineIssueLabel}>
                  STUDY #{currentSermon?.id || '01'}
                </Text>
                <View style={styles.magazineDateTag}>
                  <Calendar size={11} color="#94A3B8" />
                  <Text style={styles.magazineDateText}>DAILY EXEGESIS</Text>
                </View>
              </View>

              <Text style={styles.magazineCoverTitle}>{currentSermon?.book} Study</Text>
              <Text style={styles.magazineCoverSubtext}>
                Spoken Exegetical Commentary & Reflection
              </Text>
            </View>
          </View>

          {/* Player Card */}
          <BlurView intensity={45} tint="dark" style={styles.glassPlayerCard}>
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

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.glassActionPill} onPress={openBookmarkModal}>
                <Bookmark size={14} color="#818CF8" />
                <Text style={styles.actionPillText}>Bookmark</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.glassActionPill}
                onPress={() => currentSermon && downloadSermonForOffline(currentSermon)}
                disabled={isDownloading || (currentSermon ? downloadedSermonIds.includes(currentSermon.id) : false)}
              >
                {isDownloading ? (
                  <ActivityIndicator size="small" color="#818CF8" />
                ) : currentSermon && downloadedSermonIds.includes(currentSermon.id) ? (
                  <>
                    <CheckCircle2 size={14} color="#22C55E" />
                    <Text style={[styles.actionPillText, { color: '#4ADE80' }]}>Saved</Text>
                  </>
                ) : (
                  <>
                    <Download size={14} color="#818CF8" />
                    <Text style={styles.actionPillText}>Offline</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.glassActionPill}
                onPress={() => openShareModal(paragraphs[activeParagraphIndex] || currentSermon?.title || '')}
              >
                <Share2 size={14} color="#818CF8" />
                <Text style={styles.actionPillText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.highlightActionPill} onPress={() => setChatVisible(true)}>
                <MessageSquare size={14} color="#FFFFFF" />
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
                    onLongPress={() => openShareModal(bm.note)}
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

          {/* Interactive Transcript */}
          <View style={styles.transcriptContainer}>
            <Text style={styles.sectionHeaderLabel}>Interactive Transcript</Text>
            {paragraphs.map((pText, pIdx) => {
              const isCurrent = pIdx === activeParagraphIndex && player.playing;
              return (
                <TouchableOpacity
                  key={pIdx}
                  activeOpacity={0.8}
                  style={[
                    styles.paragraphBlock,
                    isCurrent && styles.activeParagraphBlock,
                  ]}
                  onLongPress={() => openShareModal(pText)}
                >
                  <Text
                    style={[
                      styles.transcriptBodyText,
                      isCurrent && styles.activeTranscriptText,
                    ]}
                  >
                    {pText}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* 3. LIBRARY TAB */}
      {activeTab === 'library' && (
        <View style={styles.libraryContainer}>
          <Text style={styles.serifLibraryTitle}>Sermon Library</Text>

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
                  onPress={() => playFromHome(item)}
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

      {/* Floating 3-Tab Nav */}
      <BlurView intensity={60} tint="dark" style={styles.floatingNavGlass}>
        <TouchableOpacity
          style={styles.navTab}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('home');
          }}
        >
          <Home size={20} color={activeTab === 'home' ? '#818CF8' : '#64748B'} />
          <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('player');
          }}
        >
          <Headphones size={20} color={activeTab === 'player' ? '#818CF8' : '#64748B'} />
          <Text style={[styles.navText, activeTab === 'player' && styles.navTextActive]}>Playing</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
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

      {/* Social Quote Share Card Modal */}
      <Modal visible={shareModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <BlurView intensity={85} tint="dark" style={styles.shareModalContent}>
            <View style={styles.shareHeaderRow}>
              <Text style={styles.modalTitleText}>Share Story Card</Text>
              <TouchableOpacity style={styles.closeIconBtn} onPress={() => setShareModalVisible(false)}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.shareScrollView} showsVerticalScrollIndicator={false}>
              <ViewShot ref={cardViewShotRef} options={{ format: 'png', quality: 1.0 }}>
                <View style={styles.exportableCardContainer}>
                  <LinearGradient
                    style={StyleSheet.absoluteFill}
                    colors={['#1E1B4B', '#312E81', '#0F172A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={styles.exportableCardHeader}>
                    <Sparkles size={14} color="#818CF8" />
                    <Text style={styles.exportableBrandText}>PREECH BOT • DAILY EXEGETICAL STUDY</Text>
                  </View>

                  <Quote size={24} color="rgba(129, 140, 248, 0.4)" style={{ marginBottom: 8 }} />
                  <Text style={styles.exportableQuoteText}>"{selectedQuote}"</Text>

                  <View style={styles.exportableCardFooter}>
                    <Text style={styles.exportableRefText}>{currentSermon?.passage_ref}</Text>
                    <Text style={styles.exportableTitleText}>{currentSermon?.title}</Text>
                  </View>
                </View>
              </ViewShot>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShareModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareExportBtn} onPress={exportAndShareCard}>
                <Share2 size={16} color="#FFFFFF" />
                <Text style={styles.shareExportBtnText}>Export & Share</Text>
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
  headerPillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  editorialSubHeader: { color: '#818CF8', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1.5 },
  badgeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
  badgeText: { color: '#C7D2FE', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' },

  dailyBadgeWrapper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(34, 197, 94, 0.12)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.3)' },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  dailyBadgeText: { color: '#4ADE80', fontSize: 10, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.8 },

  serifHeroTitle: { color: '#F8FAFC', fontSize: 28, fontFamily: 'Cinzel_700Bold', lineHeight: 34 },

  homeHeroCardContainer: { borderRadius: 24, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  homeHeroInner: { padding: 22 },
  homeHeroBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  homeHeroIssueText: { color: '#94A3B8', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1 },
  homeHeroTitle: { color: '#FFFFFF', fontSize: 24, fontFamily: 'Cinzel_700Bold', lineHeight: 32, marginBottom: 6 },
  homeHeroSubtitle: { color: '#CBD5E1', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1, marginBottom: 18 },
  homePlayCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 16 },
  homePlayCTAText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' },

  recentIssueCard: { width: 170, marginRight: 12, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  recentIssueInner: { padding: 14, minHeight: 115, justifyContent: 'space-between', backgroundColor: 'rgba(30, 41, 59, 0.4)' },
  recentIssuePassage: { color: '#A5B4FC', fontSize: 10, fontFamily: 'PlusJakartaSans_700Bold', textTransform: 'uppercase' },
  recentIssueTitle: { color: '#F8FAFC', fontSize: 14, fontFamily: 'Cinzel_700Bold', marginVertical: 4 },
  recentIssueFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  recentIssueAction: { color: '#818CF8', fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' },

  magazineHeroContainer: {
    height: 125,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  magazineHeroInner: { flex: 1, padding: 16, justifyContent: 'space-between' },
  magazineTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  magazineIssueLabel: { color: '#818CF8', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, letterSpacing: 1.5 },
  magazineDateTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  magazineDateText: { color: '#94A3B8', fontSize: 10, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1 },
  magazineCoverTitle: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Cinzel_700Bold' },
  magazineCoverSubtext: { color: '#CBD5E1', fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' },

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

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)' },
  glassActionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(51, 65, 85, 0.4)', paddingVertical: 10, borderRadius: 12 },
  actionPillText: { color: '#C7D2FE', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },
  highlightActionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#4338CA', paddingVertical: 10, borderRadius: 12 },
  highlightPillText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11 },

  sectionContainer: { marginBottom: 20 },
  sectionHeaderLabel: { color: '#94A3B8', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  bookmarkChip: { backgroundColor: 'rgba(30, 41, 59, 0.6)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, marginRight: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', maxWidth: 150 },
  chipTime: { color: '#818CF8', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  chipNote: { color: '#E2E8F0', fontSize: 12, marginTop: 2, fontFamily: 'PlusJakartaSans_500Medium' },

  transcriptContainer: { backgroundColor: 'rgba(30, 41, 59, 0.4)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 100 },
  paragraphBlock: { padding: 10, borderRadius: 12, marginBottom: 8 },
  activeParagraphBlock: { backgroundColor: 'rgba(99, 102, 241, 0.15)', borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.3)' },
  transcriptBodyText: { color: '#CBD5E1', fontSize: 16, lineHeight: 28, fontFamily: 'PlusJakartaSans_500Medium' },
  activeTranscriptText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold' },

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

  shareModalContent: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  shareHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  closeIconBtn: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
  },
  shareScrollView: {
    flexGrow: 0,
    marginVertical: 6,
  },
  exportableCardContainer: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  exportableCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  exportableBrandText: {
    color: '#818CF8',
    fontSize: 9,
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 1,
  },
  exportableQuoteText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    lineHeight: 24,
    marginBottom: 16,
  },
  exportableCardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 10,
  },
  exportableRefText: {
    color: '#C7D2FE',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase',
  },
  exportableTitleText: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_500Medium',
    marginTop: 2,
  },
  shareExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  shareExportBtnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
  },

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