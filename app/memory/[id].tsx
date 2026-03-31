import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useMemory, useAddMemoryEntry } from '@/api/hooks';
import { useAuthStore } from '@/store/authStore';
import { MemoryEntry } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

// ── Colour rotation hook ───────────────────────────────
const FALLBACK_COLORS = [
  Colors.terracotta,
  '#7A5C3A',
  Colors.sage,
  '#4A6A7A',
  '#7A4A5C',
];

const useColorRotation = (colors: string[], interval = 2200) => {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (colors.length <= 1) return;
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.6, duration: 400, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setIndex((i) => (i + 1) % colors.length);
    }, interval);
    return () => clearInterval(timer);
  }, [colors.length]);

  return { color: colors[index] ?? FALLBACK_COLORS[0], fadeAnim };
};

// ── Structured view ────────────────────────────────────
const StructuredView = ({
  entries,
  currentUserId,
}: {
  entries: MemoryEntry[];
  currentUserId: string;
}) => (
  <ScrollView
    style={styles.structuredScroll}
    contentContainerStyle={styles.structuredContent}
    showsVerticalScrollIndicator={false}
  >
    {entries.length === 0 && (
      <View style={styles.noEntries}>
        <Text style={styles.noEntriesText}>No perspectives yet.</Text>
        <Text style={styles.noEntriesSub}>Be the first to write your memory.</Text>
      </View>
    )}
    {entries.map((entry) => {
      const isMe = entry.authorId === currentUserId;
      return (
        <View key={entry.id} style={[styles.entryCard, isMe && styles.entryCardMe]}>
          {/* Author row */}
          <View style={styles.entryHeader}>
            <View style={[
              styles.entryAvatar,
              { backgroundColor: entry.author?.avatarColour ?? Colors.terracotta }
            ]}>
              <Text style={styles.entryAvatarText}>
                {entry.author?.displayName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <View>
              <Text style={styles.entryAuthor}>
                {isMe ? 'You' : entry.author?.displayName}
              </Text>
              <Text style={styles.entryTime}>
                {new Date(entry.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </Text>
            </View>
            {entry.isNew && !isMe && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          {/* Memory text */}
          <Text style={styles.entryText}>{entry.text}</Text>
        </View>
      );
    })}
  </ScrollView>
);

// ── Immersive view ────────────────────────────────────
const ImmersiveView = ({
  entries,
  colors,
}: {
  entries: MemoryEntry[];
  colors: string[];
}) => {
  const [entryIndex, setEntryIndex] = useState(0);
  const { color, fadeAnim } = useColorRotation(colors, 5200);
  const driftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (entries.length === 0) return;
    const timer = setInterval(() => {
      setEntryIndex((i) => (i + 1) % entries.length);
      driftAnim.setValue(0);
      Animated.timing(driftAnim, {
        toValue: -20,
        duration: 5000,
        useNativeDriver: true,
      }).start();
    }, 5200);
    return () => clearInterval(timer);
  }, [entries.length]);

  useEffect(() => {
    Animated.timing(driftAnim, {
      toValue: -20,
      duration: 5000,
      useNativeDriver: true,
    }).start();
  }, []);

  const currentEntry = entries[entryIndex];

  return (
    <Animated.View style={[styles.immersive, { backgroundColor: color, opacity: fadeAnim }]}>
      <View style={styles.immersiveOverlay} />

      {currentEntry && (
        <Animated.View style={[
          styles.immersiveContent,
          { transform: [{ translateY: driftAnim }] }
        ]}>
          <Text style={styles.immersiveAuthor}>
            {currentEntry.author?.displayName ?? 'You'}
          </Text>
          <Text style={styles.immersiveText}>{currentEntry.text}</Text>
        </Animated.View>
      )}

      {/* Entry selector dots */}
      {entries.length > 1 && (
        <View style={styles.immersiveDots}>
          {entries.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setEntryIndex(i)}
              style={[styles.immersiveDot, i === entryIndex && styles.immersiveDotActive]}
            />
          ))}
        </View>
      )}

      {entries.length === 0 && (
        <View style={styles.immersiveEmpty}>
          <Text style={styles.immersiveEmptyText}>No memories written yet.</Text>
        </View>
      )}
    </Animated.View>
  );
};

// ── Add perspective input ──────────────────────────────
const AddPerspective = ({ eventId }: { eventId: string }) => {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const { mutate: addEntry, isPending } = useAddMemoryEntry(eventId);

  const handleSubmit = () => {
    if (!text.trim()) return;
    addEntry(text.trim(), {
      onSuccess: () => setText(''),
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.addPerspective, focused && styles.addPerspectiveFocused]}>
        <TextInput
          style={styles.perspectiveInput}
          placeholder="Add your perspective…"
          placeholderTextColor={Colors.textLight}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || isPending) && styles.sendBtnDisabled]}
          onPress={handleSubmit}
          disabled={!text.trim() || isPending}
        >
          <Text style={styles.sendBtnText}>{isPending ? '…' : 'Add'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ── Event screen ───────────────────────────────────────
export default function MemoryEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading } = useMemory(id);
  const { user } = useAuthStore();
  const [view, setView] = useState<'structured' | 'immersive'>('structured');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.terracotta} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.notFound}>Memory not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const bgColors = FALLBACK_COLORS;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Memories</Text>
        </TouchableOpacity>

        {/* View toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'structured' && styles.toggleBtnActive]}
            onPress={() => setView('structured')}
          >
            <Text style={[styles.toggleBtnText, view === 'structured' && styles.toggleBtnTextActive]}>
              Story
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'immersive' && styles.toggleBtnActive]}
            onPress={() => setView('immersive')}
          >
            <Text style={[styles.toggleBtnText, view === 'immersive' && styles.toggleBtnTextActive]}>
              Immersive
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Event title block */}
      <View style={styles.eventMeta}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventDetails}>
          {new Date(event.date).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
          {event.location ? `  ·  ${event.location}` : ''}
        </Text>
        {event.music && (
          <View style={styles.musicChip}>
            <Text style={styles.musicChipText}>
              ♪  {event.music.title} — {event.music.artist}
            </Text>
          </View>
        )}
        {/* Participant avatars */}
        <View style={styles.participants}>
          {event.participants?.slice(0, 6).map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.participantAvatar,
                { backgroundColor: p.avatarColour, marginLeft: i > 0 ? -8 : 0 }
              ]}
            >
              <Text style={styles.participantAvatarText}>
                {p.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          ))}
          {(event.participants?.length ?? 0) > 6 && (
            <View style={[styles.participantAvatar, { backgroundColor: Colors.tan, marginLeft: -8 }]}>
              <Text style={[styles.participantAvatarText, { color: Colors.textDark }]}>
                +{(event.participants?.length ?? 0) - 6}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {view === 'structured' ? (
          <StructuredView
            entries={event.entries ?? []}
            currentUserId={user?.id ?? ''}
          />
        ) : (
          <ImmersiveView
            entries={event.entries ?? []}
            colors={bgColors}
          />
        )}
      </View>

      {/* Add perspective — only in structured view */}
      {view === 'structured' && <AddPerspective eventId={id} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  notFound: {
    fontSize: Typography.body,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  backLink: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    marginTop: Spacing.md,
    fontFamily: Typography.fontFamily,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  backBtn: { paddingVertical: Spacing.sm },
  backBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
  },
  toggleBtnActive: { backgroundColor: Colors.card },
  toggleBtnText: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  toggleBtnTextActive: { color: Colors.terracotta, fontWeight: '700' },

  // Event meta
  eventMeta: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  eventTitle: {
    fontSize: Typography.heading.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
  },
  musicChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginBottom: Spacing.sm,
  },
  musicChipText: {
    fontSize: 12,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  participants: { flexDirection: 'row', marginTop: 4 },
  participantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  participantAvatarText: { fontSize: 11, color: Colors.white, fontWeight: '600' },

  // Content
  content: { flex: 1 },

  // Structured view
  structuredScroll: { flex: 1 },
  structuredContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.md,
  },
  noEntries: { alignItems: 'center', paddingTop: 60 },
  noEntriesText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  noEntriesSub: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
    fontFamily: Typography.fontFamily,
  },
  entryCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    ...Shadows.card,
  },
  entryCardMe: { borderColor: Colors.terracotta + '44' },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  entryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryAvatarText: { fontSize: 13, color: Colors.white, fontWeight: '600' },
  entryAuthor: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  entryTime: { fontSize: 11, color: Colors.textLight },
  newBadge: {
    marginLeft: 'auto',
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeText: { fontSize: 9, color: Colors.white, fontWeight: '700', letterSpacing: 0.8 },
  entryText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    lineHeight: 22,
  },

  // Immersive view
  immersive: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  immersiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  immersiveContent: {
    paddingHorizontal: Spacing.xl * 1.5,
    alignItems: 'center',
  },
  immersiveAuthor: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.fontFamily,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.lg,
  },
  immersiveText: {
    fontSize: 22,
    fontFamily: Typography.fontFamily,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 34,
    fontStyle: 'italic',
  },
  immersiveDots: {
    position: 'absolute',
    bottom: Spacing.xl,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  immersiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  immersiveDotActive: {
    width: 20,
    backgroundColor: Colors.white,
  },
  immersiveEmpty: { alignItems: 'center' },
  immersiveEmptyText: {
    fontSize: Typography.body,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.fontFamily,
  },

  // Add perspective
  addPerspective: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.tan,
    backgroundColor: Colors.card,
    gap: Spacing.sm,
  },
  addPerspectiveFocused: { borderTopColor: Colors.terracotta },
  perspectiveInput: {
    flex: 1,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    maxHeight: 100,
    paddingVertical: Spacing.sm,
  },
  sendBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sendBtnDisabled: { backgroundColor: Colors.tan },
  sendBtnText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
});
