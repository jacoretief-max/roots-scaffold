import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Animated,
  Dimensions, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Circle, Line } from 'react-native-svg';
import { useMemories, QueryKeys } from '@/api/hooks';
import { useAuthStore } from '@/store/authStore';
import { MemoryEvent } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

// ── Search icon ─────────────────────────────────────────
const IconSearch = ({ color }: { color: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={11} cy={11} r={7} />
    <Line x1={21} y1={21} x2={16.65} y2={16.65} />
  </Svg>
);

// Fields searched: heading, location, date, and tagged people — deliberately
// NOT the memory-entry/"take" text, per product decision.
const matchesSearch = (event: MemoryEvent, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const dateLabel = new Date(event.date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).toLowerCase();
  const haystacks = [
    event.title,
    event.location,
    dateLabel,
    event.date,
    ...(event.participants ?? []).map((p: any) => p.displayName ?? ''),
  ];
  return haystacks.some(h => (h ?? '').toLowerCase().includes(q));
};

// Generates a consistent warm palette from a string (title + id)
const WARM_PALETTES = [
  ['#C45A3A', '#9A3A22', '#E8593C'],   // terracotta
  ['#4A7A52', '#2D5C38', '#6B9E74'],   // sage
  ['#7A5C3A', '#5C3D1E', '#A67C52'],   // warm brown
  ['#4A6A7A', '#2D4E5C', '#6B8E9E'],   // slate blue
  ['#7A4A5C', '#5C2D3E', '#9E6B7C'],   // dusty rose
  ['#534AB7', '#3C3489', '#7F77DD'],   // purple
  ['#BA7517', '#854F0B', '#EF9F27'],   // amber
  ['#1D9E75', '#0F6E56', '#5DCAA5'],   // teal
];

const getPalette = (id: string): string[] => {
  const index = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return WARM_PALETTES[index % WARM_PALETTES.length];
};

// Group memories by "Month Year", most recent first
const groupByMonth = (memories: MemoryEvent[]) => {
  const groups: { label: string; events: MemoryEvent[] }[] = [];
  const map = new Map<string, MemoryEvent[]>();
  const sorted = [...memories].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  sorted.forEach(m => {
    const label = new Date(m.date).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
    if (!map.has(label)) {
      map.set(label, []);
      groups.push({ label, events: map.get(label)! });
    }
    map.get(label)!.push(m);
  });
  return groups;
};

// ── Grid card with Ken Burns effect ────────────────────
const GridCard = ({ event, width }: { event: MemoryEvent; width: number }) => {
  const palette = getPalette(event.id);
  const photo = (event.media ?? [])[0] ?? null;
  const hasNew = (event.newEntryCount ?? 0) > 0;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!photo) return;
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1.12, duration: 9000, useNativeDriver: true }),
          Animated.timing(translateAnim, { toValue: -6, duration: 9000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1, duration: 9000, useNativeDriver: true }),
          Animated.timing(translateAnim, { toValue: 0, duration: 9000, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [photo]);

  return (
    <View style={hasNew ? [styles.gridCardRing, { width }] : { width }}>
      <TouchableOpacity
        style={[styles.gridCard, !photo && { backgroundColor: palette[0] }]}
        onPress={() => router.push(`/memory/${event.id}`)}
        activeOpacity={0.85}
      >
        {photo && (
          <Animated.Image
            source={{ uri: photo }}
            style={[
              StyleSheet.absoluteFillObject,
              { transform: [{ scale: scaleAnim }, { translateX: translateAnim }] },
            ]}
            resizeMode="cover"
          />
        )}
        <View style={styles.cardOverlay} />
        <View style={styles.gridCardContent}>
          <Text style={styles.gridCardTitle} numberOfLines={3}>
            {event.title}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

// ── All Memories grid ───────────────────────────────────
// groupByDate=false renders a single flat grid with no month headers — used
// for search results, where grouping a handful of scattered matches by month
// tends to look sparse rather than helpful.
const AllMemoriesGrid = ({ memories, groupByDate = true }: { memories: MemoryEvent[]; groupByDate?: boolean }) => {
  const screenWidth = Dimensions.get('window').width;
  const padding = Spacing.lg * 2;
  const gap = Spacing.sm;
  const colWidth = (screenWidth - padding - gap) / 2;
  const monthGroups = groupByDate ? groupByMonth(memories) : [{ label: '', events: memories }];

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {monthGroups.map(({ label, events }) => (
        <View key={label || 'flat'} style={styles.monthGroup}>
          {!!label && <Text style={styles.monthGroupHeader}>{label}</Text>}
          <View style={styles.twoColGrid}>
            {events.map(event => (
              <GridCard key={event.id} event={event} width={colWidth} />
            ))}
          </View>
        </View>
      ))}
      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// ── Your Turn card (compact, horizontal row) ────────────
const YourTurnCard = ({ item }: { item: MemoryEvent }) => {
  const palette = getPalette(item.id);
  const participants = item.participants ?? [];
  const visibleParticipants = participants.slice(0, 3);
  const overflowCount = participants.length - 3;
  const entryCount = (item as any).entryCount ?? 0;

  return (
    <TouchableOpacity
      style={[styles.yourTurnCard, { backgroundColor: palette[0] }]}
      onPress={() => router.push(`/memory/${item.id}`)}
      activeOpacity={0.85}
    >
      <View style={styles.cardOverlay} />

      {/* Participant avatars */}
      <View style={styles.yourTurnAvatarRow}>
        {visibleParticipants.map((p: any, i: number) => (
          <View
            key={`${p.id}-${i}`}
            style={[styles.yourTurnAvatar, { backgroundColor: p.avatarColour, marginLeft: i > 0 ? -6 : 0 }]}
          >
            <Text style={styles.yourTurnAvatarText}>
              {p.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        ))}
        {overflowCount > 0 && (
          <View style={[styles.yourTurnAvatar, styles.yourTurnAvatarOverflow, { marginLeft: -6 }]}>
            <Text style={styles.yourTurnAvatarOverflowText}>+{overflowCount}</Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.yourTurnCardTitle} numberOfLines={2}>
        {item.title}
      </Text>

      {/* CTA */}
      <View style={styles.yourTurnCta}>
        <Text style={styles.yourTurnCtaText}>
          {entryCount === 1 ? '1 take' : `${entryCount} takes`} · add yours →
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ── Memory card (full-width, recent feed) ───────────────
const MemoryCard = ({ item }: { item: MemoryEvent }) => {
  const hasNew = (item.newEntryCount ?? 0) > 0;
  const entryCount = (item as any).entryCount ?? 0;
  const newCount = item.newEntryCount ?? 0;
  const palette = getPalette(item.id);
  const photos = (item.media ?? []).slice(0, 3);
  const usePhotos = photos.length > 0;
  const cycleLength = usePhotos ? photos.length : palette.length;

  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (cycleLength <= 1) return;
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
      setIndex(i => (i + 1) % cycleLength);
    }, 3000);
    return () => clearInterval(interval);
  }, [cycleLength]);

  const toggleExpanded = () => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(expandAnim, {
      toValue,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
    setExpanded(!expanded);
  };

  const participants = item.participants ?? [];
  const visibleParticipants = participants.slice(0, 4);
  const overflowCount = participants.length - 4;

  return (
    <View style={hasNew ? styles.cardRing : null}>
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/memory/${item.id}`)}
      activeOpacity={0.85}
    >
      {usePhotos ? (
        <Animated.View style={[styles.cardBg, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: photos[index] }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        </Animated.View>
      ) : (
        <Animated.View style={[styles.cardBg, { backgroundColor: palette[index], opacity: fadeAnim }]} />
      )}
      <View style={styles.cardOverlay} />

      {/* Top row */}
      <View style={styles.cardTop}>
        <TouchableOpacity
          style={styles.avatarCluster}
          onPress={(e) => { e.stopPropagation(); toggleExpanded(); }}
          activeOpacity={0.8}
        >
          {!expanded && (
            <View style={styles.avatarRow}>
              {visibleParticipants.map((p: any, i: number) => (
                <View
                  key={`${p.id}-${i}`}
                  style={[styles.avatar, { backgroundColor: p.avatarColour, marginLeft: i > 0 ? -8 : 0 }]}
                >
                  <Text style={styles.avatarText}>
                    {p.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              ))}
              {overflowCount > 0 && (
                <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -8 }]}>
                  <Text style={styles.avatarOverflowText}>+{overflowCount}</Text>
                </View>
              )}
            </View>
          )}

          {expanded && (
            <Animated.View
              style={[
                styles.participantNames,
                { opacity: expandAnim, transform: [{ scale: expandAnim }] }
              ]}
            >
              {participants.map((p: any) => (
                <View key={p.id} style={styles.participantNameRow}>
                  <View style={[styles.avatarSmall, { backgroundColor: p.avatarColour }]}>
                    <Text style={styles.avatarSmallText}>
                      {p.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.participantNameText}>{p.displayName}</Text>
                </View>
              ))}
            </Animated.View>
          )}
        </TouchableOpacity>

        {hasNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>
              {newCount === 1 ? '1 new' : `${newCount} new`}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom */}
      <View style={styles.cardBottom}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMeta}>
            {item.location
              ? `${item.location} · ${new Date(item.date).getFullYear()}`
              : new Date(item.date).getFullYear().toString()
            }
          </Text>
          {entryCount > 0 && (
            <View style={styles.perspectiveCount}>
              <Text style={styles.perspectiveCountText}>
                {entryCount === 1 ? '1 take' : `${entryCount} takes`}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
    </View>
  );
};

// ── Home feed (Your turn + Recent) ──────────────────────
const HomeFeed = ({ memories }: { memories: MemoryEvent[] }) => {
  // "Your turn": participant memories where someone else has added a perspective but I haven't yet
  const yourTurn = memories.filter(m =>
    !m.hasMyEntry && ((m as any).entryCount ?? 0) > 0
  );

  // Sort: unread first, then by server order (already createdAt desc)
  const recent = [...memories].sort((a, b) => {
    const aNew = (a.newEntryCount ?? 0) > 0 ? 1 : 0;
    const bNew = (b.newEntryCount ?? 0) > 0 ? 1 : 0;
    return bNew - aNew;
  });

  const hasUnread = recent.some(m => (m.newEntryCount ?? 0) > 0);
  const allCaughtUp = memories.length > 0 && !hasUnread && yourTurn.length === 0;

  return (
    <FlatList
      data={recent}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MemoryCard item={item} />}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          {allCaughtUp && (
            <View style={styles.caughtUp}>
              <Text style={styles.caughtUpText}>You're all caught up</Text>
              <Text style={styles.caughtUpSub}>No new takes since your last visit.</Text>
            </View>
          )}
          {yourTurn.length > 0 && (
            <View style={styles.yourTurnSection}>
              <Text style={styles.sectionLabel}>Your turn</Text>
              <FlatList
                data={yourTurn}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <YourTurnCard item={item} />}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.yourTurnList}
                ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
              />
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No memories yet.</Text>
          <Text style={styles.emptySubText}>
            Tap the + button to create your first.
          </Text>
        </View>
      }
    />
  );
};

// ── Memories screen ────────────────────────────────────
export default function MemoriesScreen() {
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState<'mine' | 'all'>('all');
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: memories, isLoading } = useMemories();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Safety net alongside the new-memory push invalidation in app/_layout.tsx —
  // catches delayed/dropped pushes or notifications permission never granted.
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.memories });
    }, [queryClient])
  );

  const handleOpenTimeline = () => setShowAll(true);
  const handleBackFromTimeline = () => {
    setShowAll(false);
    setSearchActive(false);
    setSearchQuery('');
    setViewMode('all');
  };

  const timelineMemories = useMemo(() => {
    let list = memories ?? [];
    if (viewMode === 'mine' && currentUserId) {
      list = list.filter(
        (m) => m.createdByUserId === currentUserId || (m.participantIds ?? []).includes(currentUserId)
      );
    }
    if (searchQuery.trim()) {
      list = list.filter((m) => matchesSearch(m, searchQuery));
    }
    return list;
  }, [memories, viewMode, searchQuery, currentUserId]);

  const isFiltering = !!searchQuery.trim();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {showAll ? (
          <TouchableOpacity onPress={handleBackFromTimeline} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Memories</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.headerTitle}>Memories</Text>
        )}

        <View style={styles.headerRight}>
          {!showAll && (
            <TouchableOpacity
              style={styles.allBtn}
              onPress={handleOpenTimeline}
              activeOpacity={0.7}
            >
              <Text style={styles.allBtnText}>Timeline</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/new-memory')}
            activeOpacity={0.85}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Timeline toolbar — Mine/All toggle + search, only on the Timeline screen */}
      {showAll && (
        <View style={styles.timelineToolbar}>
          {searchActive ? (
            <View style={styles.searchRow}>
              <IconSearch color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by person, place, date, or title"
                placeholderTextColor={Colors.textLight}
                autoFocus
              />
              <TouchableOpacity
                onPress={() => { setSearchActive(false); setSearchQuery(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.searchCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.toolbarRow}>
              <View style={styles.viewToggle}>
                <TouchableOpacity
                  style={[styles.viewToggleOption, viewMode === 'mine' && styles.viewToggleOptionActive]}
                  onPress={() => setViewMode('mine')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewToggleText, viewMode === 'mine' && styles.viewToggleTextActive]}>
                    Mine
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewToggleOption, viewMode === 'all' && styles.viewToggleOptionActive]}
                  onPress={() => setViewMode('all')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.viewToggleText, viewMode === 'all' && styles.viewToggleTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.searchIconBtn}
                onPress={() => setSearchActive(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSearch color={Colors.terracotta} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={Colors.terracotta} style={{ marginTop: 40 }} />
      ) : showAll ? (
        <View style={{ flex: 1, paddingHorizontal: Spacing.lg }}>
          {timelineMemories.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {isFiltering
                  ? 'No memories match your search.'
                  : viewMode === 'mine'
                  ? "You haven't created or been tagged in any memories yet."
                  : 'No memories yet.'}
              </Text>
              {!isFiltering && viewMode === 'all' && (
                <Text style={styles.emptySubText}>Tap the + button to create your first.</Text>
              )}
            </View>
          ) : (
            <AllMemoriesGrid memories={timelineMemories} groupByDate={!isFiltering} />
          )}
        </View>
      ) : (
        <HomeFeed memories={memories ?? []} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  backBtn: {
    paddingVertical: 4,
  },
  backBtnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  allBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.terracotta,
  },
  allBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    fontWeight: '600',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.fab,
  },
  addBtnText: {
    fontSize: 22,
    color: Colors.white,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  // ── Timeline toolbar (Mine/All toggle + search) ───────
  timelineToolbar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewToggle: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  viewToggleOption: {
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  viewToggleOptionActive: {
    backgroundColor: Colors.terracotta + '18',
    borderColor: Colors.terracotta,
  },
  viewToggleText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  viewToggleTextActive: {
    color: Colors.terracotta,
    fontWeight: '600',
  },
  searchIconBtn: {
    padding: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    paddingVertical: 6,
  },
  searchCancel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    fontWeight: '600',
  },

  list: { padding: Spacing.lg, gap: Spacing.md },

  // ── Your turn section ─────────────────────────────────
  yourTurnSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  yourTurnList: {
    paddingRight: Spacing.lg,
  },
  yourTurnCard: {
    width: 180,
    height: 140,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    padding: Spacing.md,
    justifyContent: 'space-between',
    ...Shadows.card,
  },
  yourTurnAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yourTurnAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  yourTurnAvatarText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  yourTurnAvatarOverflow: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  yourTurnAvatarOverflowText: {
    fontSize: 9,
    color: Colors.white,
    fontWeight: '700',
  },
  yourTurnCardTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
    lineHeight: 18,
    flex: 1,
    marginVertical: 4,
  },
  yourTurnCta: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  yourTurnCtaText: {
    fontSize: 10,
    color: Colors.white,
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
  },

  // ── Full-width memory card ────────────────────────────
  cardRing: {
    borderRadius: BorderRadius.md + 3,
    borderWidth: 2.5,
    borderColor: Colors.terracotta,
    padding: 2,
  },
  card: {
    height: 220,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadows.card,
  },
  cardBg: { ...StyleSheet.absoluteFillObject },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  avatarCluster: {
    minHeight: 36,
    justifyContent: 'center',
  },
  avatarRow: { flexDirection: 'row' },
  participantNames: { gap: 4 },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatarSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: { fontSize: 9, color: Colors.white, fontWeight: '700' },
  participantNameText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  avatarText: { fontSize: 12, color: Colors.white, fontWeight: '600' },
  newBadge: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadgeText: {
    fontSize: 9,
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.8,
    lineHeight: 11,
    includeFontPadding: false,
  },
  cardBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md },
  cardTitle: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    color: Colors.white,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardMeta: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: Typography.fontFamily },
  avatarOverflow: { backgroundColor: 'rgba(255,255,255,0.25)' },
  avatarOverflowText: { fontSize: 10, color: Colors.white, fontWeight: '700' },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  perspectiveCount: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  perspectiveCountText: {
    fontSize: 10,
    color: Colors.white,
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
  },

  caughtUp: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  caughtUpText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  caughtUpSub: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  emptySubText: { fontSize: 13, color: Colors.textLight, marginTop: 4 },

  // ── All Memories — month-grouped 2-column grid ────────
  monthGroup: { marginBottom: Spacing.xl },
  monthGroupHeader: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  twoColGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridCardRing: {
    borderRadius: BorderRadius.md + 3,
    borderWidth: 2.5,
    borderColor: Colors.terracotta,
    padding: 2,
  },
  gridCard: {
    height: 140,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  gridCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
  },
  gridCardTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
    lineHeight: 18,
  },
});
