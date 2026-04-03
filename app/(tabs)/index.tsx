import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Animated,
  Dimensions, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemories } from '@/api/hooks';
import { MemoryEvent } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

// Generates a consistent warm palette from a string (title + id)
// Same memory always gets same colours — not random
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

// Group memories by year then month
const groupMemories = (memories: MemoryEvent[]) => {
  const grouped: Record<string, Record<string, MemoryEvent[]>> = {};
  memories.forEach(m => {
    const year = new Date(m.date).getFullYear().toString();
    const month = new Date(m.date).toLocaleString('en-GB', { month: 'long' });
    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];
    grouped[year][month].push(m);
  });
  return grouped;
};

const MONTHS_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ── All Memories grid ───────────────────────────────────
const AllMemoriesGrid = ({ memories }: { memories: MemoryEvent[] }) => {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const grouped = groupMemories(memories);
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  // ── Event grid (mixed sizes) ──
  const EventGrid = ({ events }: { events: MemoryEvent[] }) => {
    const screenWidth = Dimensions.get('window').width;
    const padding = Spacing.lg * 2;
    const gap = Spacing.sm;
    const colWidth = (screenWidth - padding - gap) / 2;

    return (
      <View style={styles.eventGrid}>
        {events.map((event, i) => {
          const palette = getPalette(event.id);
          const isLarge = i % 3 === 0;
          return (
            <TouchableOpacity
              key={event.id}
              style={[
                styles.eventGridItem,
                {
                  width: isLarge ? '100%' : colWidth,
                  height: isLarge ? 180 : 130,
                  backgroundColor: palette[0],
                }
              ]}
              onPress={() => router.push(`/memory/${event.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.cardOverlay} />
              <View style={styles.eventGridContent}>
                <Text style={styles.eventGridTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={styles.eventGridMeta}>
                  {event.location
                    ? `${event.location} · ${new Date(event.date).getFullYear()}`
                    : new Date(event.date).getFullYear().toString()
                  }
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ── Month level ──
  if (selectedYear && selectedMonth) {
    const events = grouped[selectedYear]?.[selectedMonth] ?? [];
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Breadcrumb */}
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => setSelectedMonth(null)}>
            <Text style={styles.breadcrumbLink}>{selectedYear}</Text>
          </TouchableOpacity>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbCurrent}>{selectedMonth}</Text>
        </View>
        <Text style={styles.gridSectionCount}>
          {events.length} {events.length === 1 ? 'memory' : 'memories'}
        </Text>
        <EventGrid events={events} />
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  }

  // ── Year level (with months) ──
  if (selectedYear) {
    const months = MONTHS_ORDER.filter(m => grouped[selectedYear]?.[m]);
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Breadcrumb */}
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => setSelectedYear(null)}>
            <Text style={styles.breadcrumbLink}>All years</Text>
          </TouchableOpacity>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbCurrent}>{selectedYear}</Text>
        </View>

        {months.map(month => {
          const events = grouped[selectedYear][month];
          const palette = getPalette(events[0].id);
          return (
            <TouchableOpacity
              key={month}
              style={styles.monthRow}
              onPress={() => setSelectedMonth(month)}
              activeOpacity={0.85}
            >
              {/* Colour swatch */}
              <View style={[styles.monthSwatch, { backgroundColor: palette[0] }]} />
              <View style={styles.monthInfo}>
                <Text style={styles.monthName}>{month}</Text>
                <Text style={styles.monthCount}>
                  {events.length} {events.length === 1 ? 'memory' : 'memories'}
                </Text>
              </View>
              <Text style={styles.monthChevron}>›</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  }

  // ── Timeline — all years ──
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ paddingBottom: 100 }}>
        {years.map(year => {
          const monthCount = Object.keys(grouped[year]).length;
          const memoryCount = Object.values(grouped[year])
            .reduce((acc, m) => acc + m.length, 0);
          const allEvents = Object.values(grouped[year]).flat();

          return (
            <TouchableOpacity
              key={year}
              style={styles.yearRow}
              onPress={() => setSelectedYear(year)}
              activeOpacity={0.85}
            >
              {/* Left: year + stats */}
              <View style={styles.yearLeft}>
                <Text style={styles.yearNumber}>{year}</Text>
                <Text style={styles.yearStats}>
                  {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}
                  {'  ·  '}
                  {monthCount} {monthCount === 1 ? 'month' : 'months'}
                </Text>
              </View>

              {/* Right: colour swatches preview */}
              <View style={styles.yearSwatches}>
                {allEvents.slice(0, 4).map((e, i) => (
                  <View
                    key={e.id}
                    style={[
                      styles.yearSwatch,
                      { backgroundColor: getPalette(e.id)[0], marginLeft: i > 0 ? -8 : 0 }
                    ]}
                  />
                ))}
              </View>

              <Text style={styles.monthChevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};

// ── Memory card ────────────────────────────────────────
const MemoryCard = ({ item }: { item: MemoryEvent }) => {
  const hasNew = (item.newEntryCount ?? 0) > 0;
  const entryCount = (item as any).entryCount ?? 0;
  const palette = getPalette(item.id);
  const [colorIndex, setColorIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.7, duration: 400, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setColorIndex(i => (i + 1) % palette.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

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
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/memory/${item.id}`)}
      activeOpacity={0.85}
    >
      <Animated.View style={[styles.cardBg, { backgroundColor: palette[colorIndex], opacity: fadeAnim }]} />
      <View style={styles.cardOverlay} />

      {/* Top row */}
      <View style={styles.cardTop}>
        <TouchableOpacity
          style={styles.avatarCluster}
          onPress={(e) => { e.stopPropagation(); toggleExpanded(); }}
          activeOpacity={0.8}
        >
          {/* Collapsed — stacked avatars */}
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

          {/* Expanded — names list */}
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
            <Text style={styles.newBadgeText}>NEW</Text>
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
                {entryCount} {entryCount === 1 ? 'perspective' : 'perspectives'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Memories screen ────────────────────────────────────
export default function MemoriesScreen() {
  const [tab, setTab] = useState<'recent' | 'all'>('recent');
  const { data: memories, isLoading } = useMemories();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Memories</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/new-memory')}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['recent', 'all'] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'recent' ? 'Recent' : 'All Memories'}
            </Text>
            {tab === t && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Feed */}
      {isLoading ? (
        <ActivityIndicator color={Colors.terracotta} style={{ marginTop: 40 }} />
      ) : (
        <>
          {tab === 'recent' ? (
            <FlatList
              data={memories ?? []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MemoryCard item={item} />}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No memories yet.</Text>
                  <Text style={styles.emptySubText}>
                    Tap the + button to create your first.
                  </Text>
                </View>
              }
            />
          ) : (
            <View style={{ flex: 1, paddingHorizontal: Spacing.lg }}>
              {(memories ?? []).length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No memories yet.</Text>
                  <Text style={styles.emptySubText}>
                    Tap the + button to create your first.
                  </Text>
                </View>
              ) : (
                <AllMemoriesGrid memories={memories ?? []} />
              )}
            </View>
          )}
        </>
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
    fontSize: 24,
    color: Colors.white,
    lineHeight: 28,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    marginBottom: Spacing.md,
  },
  tab: { paddingBottom: Spacing.sm },
  tabText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
  },
  tabTextActive: { color: Colors.terracotta },
  tabUnderline: {
    height: 2,
    backgroundColor: Colors.terracotta,
    borderRadius: 1,
    marginTop: 2,
  },

  list: { padding: Spacing.lg, gap: Spacing.md },

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
  participantNames: {
    gap: 4,
  },
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
    paddingVertical: 3,
  },
  newBadgeText: {
    fontSize: 9,
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.8,
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
  avatarOverflow: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  avatarOverflowText: {
    fontSize: 10,
    color: Colors.white,
    fontWeight: '700',
  },
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

  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  emptySubText: { fontSize: 13, color: Colors.textLight, marginTop: 4 },


  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  breadcrumbLink: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
  },
  breadcrumbSep: {
    fontSize: Typography.body,
    color: Colors.textLight,
  },
  breadcrumbCurrent: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  gridSectionCount: {
    fontSize: Typography.label,
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
  },

  // Year timeline
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    gap: Spacing.md,
  },
  yearLeft: { flex: 1 },
  yearNumber: {
    fontSize: 28,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  yearStats: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  yearSwatches: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },

  // Month list
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    gap: Spacing.md,
  },
  monthSwatch: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  monthInfo: { flex: 1 },
  monthName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  monthCount: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  monthChevron: {
    fontSize: 20,
    color: Colors.textLight,
  },

  // Event grid
  eventGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  eventGridItem: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  eventGridContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
  },
  eventGridTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 2,
  },
  eventGridMeta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: Typography.fontFamily,
  },
});
