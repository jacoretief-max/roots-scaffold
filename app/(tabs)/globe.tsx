import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useConnections } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

// ── Timezone config ────────────────────────────────────
const CITY_TIMEZONES: Record<string, { tz: string; region: string }> = {
  // Africa
  'johannesburg': { tz: 'Africa/Johannesburg', region: 'Africa' },
  'cape town':    { tz: 'Africa/Johannesburg', region: 'Africa' },
  'durban':       { tz: 'Africa/Johannesburg', region: 'Africa' },
  'nairobi':      { tz: 'Africa/Nairobi',      region: 'Africa' },
  'lagos':        { tz: 'Africa/Lagos',         region: 'Africa' },
  'cairo':        { tz: 'Africa/Cairo',         region: 'Africa' },
  // Europe
  'london':       { tz: 'Europe/London',        region: 'Europe' },
  'paris':        { tz: 'Europe/Paris',         region: 'Europe' },
  'berlin':       { tz: 'Europe/Berlin',        region: 'Europe' },
  'amsterdam':    { tz: 'Europe/Amsterdam',     region: 'Europe' },
  'madrid':       { tz: 'Europe/Madrid',        region: 'Europe' },
  'rome':         { tz: 'Europe/Rome',          region: 'Europe' },
  'zurich':       { tz: 'Europe/Zurich',        region: 'Europe' },
  'stockholm':    { tz: 'Europe/Stockholm',     region: 'Europe' },
  // Americas
  'new york':     { tz: 'America/New_York',     region: 'Americas' },
  'los angeles':  { tz: 'America/Los_Angeles',  region: 'Americas' },
  'chicago':      { tz: 'America/Chicago',      region: 'Americas' },
  'toronto':      { tz: 'America/Toronto',      region: 'Americas' },
  'denver':       { tz: 'America/Denver',       region: 'Americas' },
  'aurora':       { tz: 'America/Denver',       region: 'Americas' },
  'miami':        { tz: 'America/New_York',     region: 'Americas' },
  'vancouver':    { tz: 'America/Vancouver',    region: 'Americas' },
  'sao paulo':    { tz: 'America/Sao_Paulo',    region: 'Americas' },
  'mexico city':  { tz: 'America/Mexico_City',  region: 'Americas' },
  // Middle East & Asia
  'dubai':        { tz: 'Asia/Dubai',           region: 'Middle East & Asia' },
  'singapore':    { tz: 'Asia/Singapore',       region: 'Middle East & Asia' },
  'tokyo':        { tz: 'Asia/Tokyo',           region: 'Middle East & Asia' },
  'mumbai':       { tz: 'Asia/Kolkata',         region: 'Middle East & Asia' },
  'delhi':        { tz: 'Asia/Kolkata',         region: 'Middle East & Asia' },
  'hong kong':    { tz: 'Asia/Hong_Kong',       region: 'Middle East & Asia' },
  'shanghai':     { tz: 'Asia/Shanghai',        region: 'Middle East & Asia' },
  'seoul':        { tz: 'Asia/Seoul',           region: 'Middle East & Asia' },
  'istanbul':     { tz: 'Europe/Istanbul',      region: 'Middle East & Asia' },
  // Oceania
  'sydney':       { tz: 'Australia/Sydney',     region: 'Oceania' },
  'melbourne':    { tz: 'Australia/Melbourne',  region: 'Oceania' },
  'auckland':     { tz: 'Pacific/Auckland',     region: 'Oceania' },
};

const REGION_ORDER = ['Africa', 'Europe', 'Americas', 'Middle East & Asia', 'Oceania'];

const getCityInfo = (city?: string) => {
  if (!city) return { tz: 'UTC', region: 'Unknown' };
  return CITY_TIMEZONES[city.toLowerCase().trim()] ?? { tz: 'UTC', region: 'Unknown' };
};

const getLocalTime = (city?: string) => {
  const { tz } = getCityInfo(city);
  try {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const hourStr = now.toLocaleString('en-GB', {
      timeZone: tz, hour: '2-digit', hour12: false,
    });
    const hour = parseInt(hourStr, 10);
    const status =
      hour >= 22 || hour < 7 ? 'sleeping'
      : hour >= 9 && hour < 18 ? 'available'
      : 'busy';
    return { time, hour, status };
  } catch {
    return { time: '--:--', hour: 12, status: 'available' as const };
  }
};

// ── Time of day bar ────────────────────────────────────
const TimeOfDayBar = ({ hour }: { hour: number }) => {
  const pct = (hour / 24) * 100;
  const isDay = hour >= 6 && hour < 20;
  const barColor = isDay ? '#EF9F27' : '#3C3489';

  return (
    <View style={styles.timeBar}>
      <View style={styles.timeBarBg}>
        <View style={[styles.timeBarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
        <View style={[styles.timeBarMarker, { left: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
};

const STATUS_COLORS = {
  available: Colors.statusAvailable,
  busy: Colors.statusBusy,
  sleeping: Colors.statusSleeping,
};
const STATUS_LABELS = {
  available: 'Available',
  busy: 'Busy',
  sleeping: 'Sleeping',
};

// ── Connection row ─────────────────────────────────────
const ConnectionRow = ({ item }: { item: any }) => {
  const displayName = item.connectedUser?.displayName ?? 'Unknown';
  const avatarColour = item.connectedUser?.avatarColour ?? Colors.terracotta;
  const city = item.connectedUser?.city ?? '';
  const { time, hour, status } = getLocalTime(city);
  const statusColor = STATUS_COLORS[status as keyof typeof STATUS_COLORS];

  return (
    <TouchableOpacity
      style={styles.connectionRow}
      onPress={() => router.push(`/person/${item.id}`)}
      activeOpacity={0.85}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColour }]}>
        <Text style={styles.avatarText}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>

      {/* Info + time bar */}
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowName}>{displayName}</Text>
          <Text style={[styles.rowStatus, { color: statusColor }]}>
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
          </Text>
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.rowCity}>{city || 'Location not set'}</Text>
          <Text style={styles.rowTime}>{time}</Text>
        </View>
        <TimeOfDayBar hour={hour} />
      </View>
    </TouchableOpacity>
  );
};

// ── Region group header ────────────────────────────────
const RegionHeader = ({
  region,
  count,
  expanded,
  onToggle,
}: {
  region: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) => (
  <TouchableOpacity style={styles.regionHeader} onPress={onToggle} activeOpacity={0.7}>
    <View style={styles.regionLeft}>
      <Text style={styles.regionName}>{region}</Text>
      <Text style={styles.regionCount}>{count} {count === 1 ? 'person' : 'people'}</Text>
    </View>
    <Text style={styles.regionChevron}>{expanded ? '▾' : '▸'}</Text>
  </TouchableOpacity>
);

// ── Globe screen ───────────────────────────────────────
export default function GlobeScreen() {
  const { data: connections = [], isLoading } = useConnections();
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Group connections by region
  const grouped = connections.reduce((acc, c) => {
    const city = (c as any).connectedUser?.city ?? '';
    const { region } = getCityInfo(city);
    if (!acc[region]) acc[region] = [];
    acc[region].push(c);
    return acc;
  }, {} as Record<string, any[]>);

  // Auto-expand all regions on first load
  useEffect(() => {
    if (connections.length > 0 && Object.keys(expandedRegions).length === 0) {
      const initial: Record<string, boolean> = {};
      Object.keys(grouped).forEach(r => { initial[r] = true; });
      setExpandedRegions(initial);
    }
  }, [connections.length]);

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => ({ ...prev, [region]: !prev[region] }));
  };

  const timeStr = currentTime.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });

  const orderedRegions = REGION_ORDER.filter(r => grouped[r]);
  const unknownConnections = grouped['Unknown'] ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Globe</Text>
            <Text style={styles.subtitle}>Your time: {timeStr}</Text>
          </View>
          <View style={styles.headerStats}>
            <Text style={styles.headerStatsNum}>{connections.length}</Text>
            <Text style={styles.headerStatsLabel}>connections</Text>
          </View>
        </View>

        {/* Status legend */}
        <View style={styles.legend}>
          {Object.entries(STATUS_COLORS).map(([key, color]) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendLabel}>
                {STATUS_LABELS[key as keyof typeof STATUS_LABELS]}
              </Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF9F27' }]} />
            <Text style={styles.legendLabel}>Day</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3C3489' }]} />
            <Text style={styles.legendLabel}>Night</Text>
          </View>
        </View>

        {isLoading && (
          <ActivityIndicator color={Colors.terracotta} style={{ marginTop: 40 }} />
        )}

        {!isLoading && connections.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No connections yet</Text>
            <Text style={styles.emptySub}>
              Add people from Connect to see them here grouped by their timezone.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(tabs)/connect')}
            >
              <Text style={styles.emptyBtnText}>Go to Connect</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Grouped by region */}
        {orderedRegions.map(region => (
          <View key={region} style={styles.regionGroup}>
            <RegionHeader
              region={region}
              count={grouped[region].length}
              expanded={expandedRegions[region] ?? true}
              onToggle={() => toggleRegion(region)}
            />
            {(expandedRegions[region] ?? true) && grouped[region].map((c: any) => (
              <ConnectionRow key={c.id} item={c} />
            ))}
          </View>
        ))}

        {/* Unknown location connections */}
        {unknownConnections.length > 0 && (
          <View style={styles.regionGroup}>
            <RegionHeader
              region="Location not set"
              count={unknownConnections.length}
              expanded={expandedRegions['Unknown'] ?? true}
              onToggle={() => toggleRegion('Unknown')}
            />
            {(expandedRegions['Unknown'] ?? true) && unknownConnections.map((c: any) => (
              <ConnectionRow key={c.id} item={c} />
            ))}
          </View>
        )}

        {/* Refresh note */}
        {connections.length > 0 && (
          <Text style={styles.refreshNote}>
            Times refresh every minute · Tap a person to view their profile
          </Text>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  title: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  headerStats: { alignItems: 'flex-end' },
  headerStatsNum: {
    fontSize: 28,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.terracotta,
  },
  headerStatsLabel: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },

  // Region group
  regionGroup: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    overflow: 'hidden',
  },
  regionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.tan + '44',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  regionLeft: { gap: 2 },
  regionName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  regionCount: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  regionChevron: {
    fontSize: 14,
    color: Colors.textLight,
  },

  // Connection row
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  rowInfo: { flex: 1, gap: 3 },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  rowStatus: {
    fontSize: 11,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },
  rowBottomLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCity: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  rowTime: {
    fontSize: 15,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },

  // Time of day bar
  timeBar: { marginTop: 4 },
  timeBarBg: {
    height: 3,
    backgroundColor: Colors.tan,
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  timeBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeBarMarker: {
    position: 'absolute',
    top: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: -3,
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  emptySub: {
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

  // Refresh note
  refreshNote: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
  },
});
