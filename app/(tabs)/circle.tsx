import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
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
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radii = [90, 70, 50, 30];
  const layers = ['meaningful', 'active', 'close', 'intimate'] as DunbarLayer[];
  const ringColors = ['#EAE0D0', '#D4C8B4', '#C45A3A33', '#C45A3A66'];

  return (
    <View style={styles.diagramWrap}>
      <Svg width={size} height={size}>
        {radii.map((r, i) => (
          <Circle
            key={layers[i]}
            cx={cx} cy={cy} r={r}
            fill={activeLayer === layers[i] ? '#C45A3A22' : ringColors[i]}
            stroke={activeLayer === layers[i] ? Colors.terracotta : Colors.tan}
            strokeWidth={activeLayer === layers[i] ? 1.5 : 0.5}
          />
        ))}
        {/* Centre dot */}
        <Circle cx={cx} cy={cy} r={8} fill={Colors.terracotta} />
      </Svg>

      {/* Tappable count labels below diagram */}
      <View style={styles.layerCounts}>
        {DunbarLayers.map((l) => (
          <TouchableOpacity
            key={l.key}
            style={[styles.layerCount, activeLayer === l.key && styles.layerCountActive]}
            onPress={() => onPress(l.key as DunbarLayer)}
          >
            <Text style={[styles.layerCountNum, activeLayer === l.key && styles.layerCountNumActive]}>
              {counts[l.key] ?? 0}
            </Text>
            <Text style={[styles.layerCountLabel, activeLayer === l.key && styles.layerCountLabelActive]}>
              {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Layer description when filter active */}
      {activeLayer && (
        <View style={styles.layerDesc}>
          <Text style={styles.layerDescText}>
            {DunbarLayers.find((l) => l.key === activeLayer)?.description}
          </Text>
        </View>
      )}
    </View>
  );
};

// ── Connection card ────────────────────────────────────
const ConnectionCard = ({ item }: { item: Connection }) => {
  const scoreColor =
    item.score > 75 ? Colors.scoreHealthy
    : item.score > 50 ? Colors.scoreMedium
    : Colors.scoreLow;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/person/${item.id}`)}
      activeOpacity={0.85}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: item.connectedUser?.avatarColour ?? Colors.tan }]}>
        <Text style={styles.avatarText}>
          {item.connectedUser?.displayName.charAt(0).toUpperCase() ?? '?'}
        </Text>
        {/* Status dot */}
        <View style={[styles.statusDot, { backgroundColor: Colors.statusAvailable }]} />
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.connectedUser?.displayName}</Text>
        <Text style={styles.cardMeta}>
          {item.relation} · {item.connectedUser?.city}
        </Text>

        {/* Score bar */}
        <View style={styles.scoreBarBg}>
          <View style={[styles.scoreBarFill, { width: `${item.score}%`, backgroundColor: scoreColor }]} />
        </View>

        {/* Nudge */}
        {item.nudge && (
          <Text style={styles.nudge}>{item.nudge}</Text>
        )}
      </View>

      {/* Score number */}
      <Text style={[styles.scoreNum, { color: scoreColor }]}>{item.score}</Text>
    </TouchableOpacity>
  );
};

// ── Circle screen ──────────────────────────────────────
export default function CircleScreen() {
  const [activeLayer, setActiveLayer] = useState<DunbarLayer | null>(null);
  const { data: connections = [], isLoading } = useConnections(activeLayer ?? undefined);

  // Count per layer
  const { data: allConnections = [] } = useConnections();
  const counts = allConnections.reduce((acc, c) => {
    acc[c.layer] = (acc[c.layer] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleLayerPress = (layer: DunbarLayer) => {
    setActiveLayer((prev) => (prev === layer ? null : layer));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Circle</Text>

        <DunbarDiagram
          counts={counts}
          activeLayer={activeLayer}
          onPress={handleLayerPress}
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {activeLayer
              ? `${DunbarLayers.find((l) => l.key === activeLayer)?.label} connections`
              : 'All connections'}
          </Text>

          {connections.map((c) => (
            <ConnectionCard key={c.id} item={c} />
          ))}
        </View>
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
    marginBottom: Spacing.lg,
  },

  // Dunbar diagram
  diagramWrap: { alignItems: 'center', paddingVertical: Spacing.lg },
  layerCounts: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginTop: Spacing.lg,
  },
  layerCount: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  layerCountActive: { backgroundColor: Colors.terracotta + '18' },
  layerCountNum: {
    fontSize: 20,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  layerCountNumActive: { color: Colors.terracotta },
  layerCountLabel: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  layerCountLabelActive: { color: Colors.terracotta },
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
  section: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
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
    ...Shadows.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, color: Colors.white, fontWeight: '600' },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  cardMeta: { fontSize: 12, color: Colors.textLight, marginTop: 1, marginBottom: 6 },
  scoreBarBg: {
    height: 4,
    backgroundColor: Colors.tan,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 2 },
  nudge: {
    fontSize: 12,
    color: Colors.terracottaDark,
    fontStyle: 'italic',
    marginTop: 5,
    lineHeight: 17,
  },
  scoreNum: {
    fontSize: 18,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
});
