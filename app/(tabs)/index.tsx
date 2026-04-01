import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Animated,
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

// ── Memory card ────────────────────────────────────────
const MemoryCard = ({ item }: { item: MemoryEvent }) => {
  const hasNew = (item.newEntryCount ?? 0) > 0;
  const palette = getPalette(item.id);
  const [colorIndex, setColorIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.7,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
      setColorIndex(i => (i + 1) % palette.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/memory/${item.id}`)}
      activeOpacity={0.85}
    >
      {/* Animated background */}
      <Animated.View
        style={[
          styles.cardBg,
          { backgroundColor: palette[colorIndex], opacity: fadeAnim }
        ]}
      />

      {/* Dark gradient overlay */}
      <View style={styles.cardOverlay} />

      {/* Top row: avatars + new badge */}
      <View style={styles.cardTop}>
        <View style={styles.avatarRow}>
          {item.participants?.slice(0, 4).map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.avatar,
                { backgroundColor: p.avatarColour, marginLeft: i > 0 ? -8 : 0 }
              ]}
            >
              <Text style={styles.avatarText}>
                {p.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
        {hasNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </View>

      {/* Bottom: title + meta */}
      <View style={styles.cardBottom}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardMeta}>
          {item.location
            ? `${item.location} · ${new Date(item.date).getFullYear()}`
            : new Date(item.date).getFullYear().toString()
          }
        </Text>
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
        <View style={styles.tabs}>
          {(['recent', 'all'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tab}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'recent' ? 'Recent' : 'All Memories'}
              </Text>
              {tab === t && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Feed */}
      {isLoading ? (
        <ActivityIndicator color={Colors.terracotta} style={{ marginTop: 40 }} />
      ) : (
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
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/new-memory')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 0,
  },
  headerTitle: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  tabs: { flexDirection: 'row', gap: Spacing.xl },
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
  avatarRow: { flexDirection: 'row' },
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
    marginBottom: 2,
  },
  cardMeta: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  emptySubText: { fontSize: 13, color: Colors.textLight, marginTop: 4 },

  fab: {
    position: 'absolute',
    bottom: 90,
    right: Spacing.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.fab,
  },
  fabIcon: { fontSize: 28, color: Colors.white, lineHeight: 32 },
});
