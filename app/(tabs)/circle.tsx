import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import { useConnections } from '@/api/hooks';
import { Connection, DunbarLayer } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, DunbarLayers, Shadows } from '@/constants/theme';

// ── Dunbar ring diagram ────────────────────────────────
const DunbarDiagram = ({
  counts,
  activeLayer,
  onPress,
}: {
  counts: Record<string, number>;
  activeLayer: DunbarLayer | null;
  onPress: (layer: DunbarLayer) => void;
}) => {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radii = [82, 64, 46, 28];
  const layers = ['meaningful', 'active', 'close', 'intimate'] as DunbarLayer[];
  const ringColors = ['#EAE0D0', '#DDD0BA', '#C45A3A22', '#C45A3A44'];

  return (
    <View style={styles.diagramWrap}>
      <Svg width={size} height={size}>
        {radii.map((r, i) => (
          <Circle
            key={layers[i]}
            cx={cx} cy={cy} r={r}
            fill={activeLayer === layers[i] ? '#C45A3A18' : ringColors[i]}
            stroke={activeLayer === layers[i] ? Colors.terracotta : Colors.tan}
            strokeWidth={activeLayer === layers[i] ? 1.5 : 0.5}
          />
        ))}
        <Circle cx={cx} cy={cy} r={8} fill={Colors.terracotta} />
      </Svg>

      {/* Layer count pills */}
      <View style={styles.layerCounts}>
        {DunbarLayers.map((l) => {
          const count = counts[l.key] ?? 0;
          const isActive = activeLayer === l.key;
          return (
            <TouchableOpacity
              key={l.key}
              style={[styles.layerCount, isActive && styles.layerCountActive]}
              onPress={() => onPress(l.key as DunbarLayer)}
            >
              <Text style={[styles.layerCountNum, isActive && styles.layerCountNumActive]}>
                {count}
              </Text>
              <Text style={[styles.layerCountLabel, isActive && styles.layerCountLabelActive]}>
                {l.label}
              </Text>
              <Text style={styles.layerCountLimit}>/ {l.limit}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Layer description */}
      {activeLayer && (
        <View style={styles.layerDesc}>
          <Text style={styles.layerDescText}>
            {DunbarLayers.find(l => l.key === activeLayer)?.description}
          </Text>
        </View>
      )}
    </View>
  );
};

// ── Connection card ────────────────────────────────────
const ConnectionCard = ({ item }: { item: Connection }) => {
  const score = item.score ?? 80;
  const scoreColor =
    score > 75 ? Colors.scoreHealthy
    : score > 50 ? Colors.scoreMedium
    : Colors.scoreLow;

  const displayName = item.connectedUser?.displayName
    ?? (item as any).display_name
    ?? 'Unknown';

  const avatarColour = item.connectedUser?.avatarColour
    ?? (item as any).avatar_colour
    ?? Colors.terracotta;

  const city = item.connectedUser?.city ?? (item as any).city;

  const lastContactText = () => {
    if (!item.lastContactAt) return 'No contact logged';
    const days = Math.floor(
      (Date.now() - new Date(item.lastContactAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/person/${item.id}`)}
      activeOpacity={0.85}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColour }]}>
        <Text style={styles.avatarText}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: Colors.statusAvailable }]} />
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName}>{displayName}</Text>
          <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
        </View>

        <Text style={styles.cardMeta}>
          {item.relation ?? 'Connection'}
          {city ? ` · ${city}` : ''}
        </Text>

        {/* Score bar */}
        <View style={styles.scoreBarBg}>
          <View style={[
            styles.scoreBarFill,
            { width: `${score}%` as any, backgroundColor: scoreColor }
          ]} />
        </View>

        {/* Last contact */}
        <Text style={styles.lastContact}>{lastContactText()}</Text>

        {/* Nudge */}
        {item.nudge && (
          <View style={styles.nudgeRow}>
            <Text style={styles.nudgeText}>{item.nudge}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Circle screen ──────────────────────────────────────
export default function CircleScreen() {
  const [activeLayer, setActiveLayer] = useState<DunbarLayer | null>(null);

  const { data: allConnections = [], isLoading: loadingAll } = useConnections();
  const { data: filtered = [], isLoading: loadingFiltered } = useConnections(
    activeLayer ?? undefined
  );

  const isLoading = loadingAll || loadingFiltered;

  const counts = allConnections.reduce((acc, c) => {
    const layer = c.layer ?? (c as any).layer;
    acc[layer] = (acc[layer] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleLayerPress = (layer: DunbarLayer) => {
    setActiveLayer(prev => prev === layer ? null : layer);
  };

  const displayConnections = activeLayer ? filtered : allConnections;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Circle</Text>

        {/* Dunbar diagram */}
        <DunbarDiagram
          counts={counts}
          activeLayer={activeLayer}
          onPress={handleLayerPress}
        />

        <View style={styles.section}>
          {/* Section label */}
          <Text style={styles.sectionLabel}>
            {activeLayer
              ? `${DunbarLayers.find(l => l.key === activeLayer)?.label} · ${displayConnections.length} ${displayConnections.length === 1 ? 'person' : 'people'}`
              : `All connections · ${allConnections.length}`
            }
          </Text>

          {/* Loading */}
          {isLoading && (
            <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.lg }} />
          )}

          {/* Empty state */}
          {!isLoading && allConnections.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Your circle is empty</Text>
              <Text style={styles.emptyDesc}>
                Go to Connect to search for people and add them to your circle.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/(tabs)/connect')}
              >
                <Text style={styles.emptyBtnText}>Go to Connect</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty filtered state */}
          {!isLoading && allConnections.length > 0 && displayConnections.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                No one in your {DunbarLayers.find(l => l.key === activeLayer)?.label.toLowerCase()} circle yet
              </Text>
              <Text style={styles.emptyDesc}>
                Add people from Connect and assign them to this layer.
              </Text>
            </View>
          )}

          {/* Connection cards */}
          {!isLoading && displayConnections.map((c) => (
            <ConnectionCard key={c.id} item={c} />
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    marginBottom: Spacing.md,
  },

  // Dunbar diagram
  diagramWrap: { alignItems: 'center', paddingVertical: Spacing.lg },
  layerCounts: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.lg,
  },
  layerCount: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    minWidth: 60,
  },
  layerCountActive: { backgroundColor: Colors.terracotta + '18' },
  layerCountNum: {
    fontSize: 24,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  layerCountNumActive: { color: Colors.terracotta },
  layerCountLabel: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 1,
    fontFamily: Typography.fontFamily,
  },
  layerCountLabelActive: { color: Colors.terracotta },
  layerCountLimit: {
    fontSize: 10,
    color: Colors.tan,
    fontFamily: Typography.fontFamily,
  },
  layerDesc: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  layerDescText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Connections
  section: { paddingHorizontal: Spacing.lg },
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
    fontFamily: Typography.fontFamily,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    ...Shadows.card,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, color: Colors.white, fontWeight: '600' },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  cardInfo: { flex: 1 },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  scoreNum: {
    fontSize: 16,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
  cardMeta: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: Spacing.sm,
    fontFamily: Typography.fontFamily,
  },
  scoreBarBg: {
    height: 4,
    backgroundColor: Colors.tan,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  scoreBarFill: { height: '100%', borderRadius: 2 },
  lastContact: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  nudgeRow: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.terracotta + '10',
    borderLeftWidth: 2,
    borderLeftColor: Colors.terracotta,
  },
  nudgeText: {
    fontSize: 12,
    color: Colors.terracottaDark,
    fontStyle: 'italic',
    fontFamily: Typography.fontFamily,
    lineHeight: 17,
  },

  // Empty states
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  emptyBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  emptyBtnText: {
    fontSize: Typography.body,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
});
