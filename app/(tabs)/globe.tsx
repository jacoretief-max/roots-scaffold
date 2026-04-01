import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, PanResponder, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import { router } from 'expo-router';
import { useConnections } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GLOBE_HEIGHT = SCREEN_WIDTH * 0.85;

const CITY_TIMEZONES: Record<string, string> = {
  'johannesburg': 'Africa/Johannesburg',
  'cape town': 'Africa/Johannesburg',
  'durban': 'Africa/Johannesburg',
  'london': 'Europe/London',
  'paris': 'Europe/Paris',
  'berlin': 'Europe/Berlin',
  'amsterdam': 'Europe/Amsterdam',
  'new york': 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  'chicago': 'America/Chicago',
  'dubai': 'Asia/Dubai',
  'singapore': 'Asia/Singapore',
  'sydney': 'Australia/Sydney',
  'melbourne': 'Australia/Melbourne',
  'tokyo': 'Asia/Tokyo',
  'mumbai': 'Asia/Kolkata',
  'nairobi': 'Africa/Nairobi',
  'toronto': 'America/Toronto',
  'denver': 'America/Denver',
  'aurora': 'America/Denver',
};

const getTimezone = (city?: string): string => {
  if (!city) return 'UTC';
  return CITY_TIMEZONES[city.toLowerCase().trim()] ?? 'UTC';
};

const getLocalTime = (city?: string) => {
  const tz = getTimezone(city);
  try {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const hourStr = now.toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', hour12: false });
    const hour = parseInt(hourStr, 10);
    const status = hour >= 22 || hour < 7 ? 'sleeping' : hour >= 9 && hour < 18 ? 'available' : 'busy';
    return { time, status };
  } catch {
    return { time: '--:--', status: 'available' as const };
  }
};

const STATUS_COLORS = { available: Colors.statusAvailable, busy: Colors.statusBusy, sleeping: Colors.statusSleeping };
const STATUS_LABELS = { available: 'Available', busy: 'Busy', sleeping: 'Sleeping' };

const useGlobe = () => {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0.15, y: 0 });
  const autoSpinRef = useRef(true);
  const objectsRef = useRef<THREE.Object3D[]>([]);

  const onContextCreate = (gl: any) => {
    const renderer = new THREE.WebGLRenderer({ context: gl, antialias: true });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0F1F2E');

    const camera = new THREE.PerspectiveCamera(45, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);
    camera.position.z = 2.8;

    // Stars
    const starPos = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000 * 3; i++) starPos[i] = (Math.random() - 0.5) * 120;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.6 })));

    // Earth sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      new THREE.MeshPhongMaterial({ color: new THREE.Color('#0a1628'), shininess: 20, specular: new THREE.Color('#1a3a6a') })
    );
    scene.add(sphere);
    objectsRef.current.push(sphere);

    // Latitude lines
    const latMat = new THREE.LineBasicMaterial({ color: 0x1a4a8a, transparent: true, opacity: 0.35 });
    [-60, -30, 0, 30, 60].forEach(lat => {
      const pts: THREE.Vector3[] = [];
      const phi = (90 - lat) * (Math.PI / 180);
      for (let lng = 0; lng <= 360; lng += 3) {
        const theta = lng * (Math.PI / 180);
        pts.push(new THREE.Vector3(1.01 * Math.sin(phi) * Math.cos(theta), 1.01 * Math.cos(phi), 1.01 * Math.sin(phi) * Math.sin(theta)));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), latMat);
      scene.add(line);
      objectsRef.current.push(line);
    });

    // Longitude lines
    const lngMat = new THREE.LineBasicMaterial({ color: 0x1a4a8a, transparent: true, opacity: 0.2 });
    for (let lng = 0; lng < 360; lng += 30) {
      const pts: THREE.Vector3[] = [];
      const theta = lng * (Math.PI / 180);
      for (let lat = -90; lat <= 90; lat += 3) {
        const phi = (90 - lat) * (Math.PI / 180);
        pts.push(new THREE.Vector3(1.01 * Math.sin(phi) * Math.cos(theta), 1.01 * Math.cos(phi), 1.01 * Math.sin(phi) * Math.sin(theta)));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lngMat);
      scene.add(line);
      objectsRef.current.push(line);
    }

    // Equator highlight
    const eqPts: THREE.Vector3[] = [];
    for (let lng = 0; lng <= 360; lng += 2) {
      const t = lng * (Math.PI / 180);
      eqPts.push(new THREE.Vector3(1.015 * Math.cos(t), 0, 1.015 * Math.sin(t)));
    }
    const eq = new THREE.Line(new THREE.BufferGeometry().setFromPoints(eqPts), new THREE.LineBasicMaterial({ color: 0xC45A3A, transparent: true, opacity: 0.5 }));
    scene.add(eq);
    objectsRef.current.push(eq);

    // Atmosphere
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 32), new THREE.MeshPhongMaterial({ color: new THREE.Color('#3366cc'), transparent: true, opacity: 0.06, side: THREE.FrontSide })));

    // Lighting
    scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      if (autoSpinRef.current) rotationRef.current.y += 0.003;
      objectsRef.current.forEach(o => { o.rotation.x = rotationRef.current.x; o.rotation.y = rotationRef.current.y; });
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  };

  const handleRotate = (dx: number, dy: number) => {
    autoSpinRef.current = false;
    rotationRef.current.y += dx * 0.008;
    rotationRef.current.x = Math.max(-1.2, Math.min(1.2, rotationRef.current.x + dy * 0.008));
    clearTimeout((handleRotate as any)._t);
    (handleRotate as any)._t = setTimeout(() => { autoSpinRef.current = true; }, 3000);
  };

  const cleanup = () => { cancelAnimationFrame(animFrameRef.current); rendererRef.current?.dispose(); };

  return { onContextCreate, handleRotate, cleanup };
};

const ConnectionItem = ({ item }: { item: any }) => {
  const displayName = item.connectedUser?.displayName ?? 'Unknown';
  const avatarColour = item.connectedUser?.avatarColour ?? Colors.terracotta;
  const city = item.connectedUser?.city ?? '';
  const { time, status } = getLocalTime(city);

  return (
    <TouchableOpacity style={styles.connectionItem} onPress={() => router.push(`/person/${item.id}`)} activeOpacity={0.85}>
      <View style={[styles.avatar, { backgroundColor: avatarColour }]}>
        <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.connectionInfo}>
        <Text style={styles.connectionName}>{displayName}</Text>
        <Text style={styles.connectionCity}>{city || 'Location not set'}</Text>
      </View>
      <View style={styles.timeWrap}>
        <Text style={styles.localTime}>{time}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }]} />
          <Text style={[styles.statusLabel, { color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }]}>
            {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function GlobeScreen() {
  const { data: connections = [], isLoading } = useConnections();
  const { onContextCreate, handleRotate, cleanup } = useGlobe();

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gs) => handleRotate(gs.dx, gs.dy),
  })).current;

  useEffect(() => () => cleanup(), []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.globeWrap} {...panResponder.panHandlers}>
          <GLView style={styles.glView} onContextCreate={onContextCreate} />
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Globe</Text>
            <Text style={styles.overlayTime}>{timeStr} your time</Text>
          </View>
          <View style={styles.dragHint}>
            <Text style={styles.dragHintText}>drag to rotate</Text>
          </View>
        </View>

        <View style={styles.listWrap}>
          <Text style={styles.listLabel}>
            Your circle · {connections.length} {connections.length === 1 ? 'person' : 'people'}
          </Text>

          {isLoading && <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.lg }} />}

          {!isLoading && connections.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No connections yet</Text>
              <Text style={styles.emptySub}>Add people from Connect to see them here.</Text>
            </View>
          )}

          {connections.map((c: any) => <ConnectionItem key={c.id} item={c} />)}

          {connections.length > 0 && (
            <View style={styles.tzNote}>
              <Text style={styles.tzNoteText}>
                Times shown in each person's local timezone based on their city. Add cities in their profile for accurate times.
              </Text>
            </View>
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.globeBackground },
  globeWrap: { width: SCREEN_WIDTH, height: GLOBE_HEIGHT, backgroundColor: Colors.globeBackground },
  glView: { width: SCREEN_WIDTH, height: GLOBE_HEIGHT },
  overlay: { position: 'absolute', top: Spacing.lg, left: Spacing.lg },
  overlayTitle: { fontSize: Typography.heading.lg, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.white, opacity: 0.9 },
  overlayTime: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: Typography.fontFamily, marginTop: 2 },
  dragHint: { position: 'absolute', bottom: Spacing.xl, left: 0, right: 0, alignItems: 'center' },
  dragHintText: { fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: Typography.fontFamily, letterSpacing: 0.8 },
  listWrap: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, marginTop: -24, minHeight: 400 },
  listLabel: { fontSize: Typography.label, color: Colors.terracotta, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: Typography.fontFamily, marginBottom: Spacing.md },
  connectionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.tan, gap: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, color: Colors.white, fontWeight: '600' },
  connectionInfo: { flex: 1 },
  connectionName: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  connectionCity: { fontSize: 12, color: Colors.textLight, marginTop: 2, fontFamily: Typography.fontFamily },
  timeWrap: { alignItems: 'flex-end' },
  localTime: { fontSize: 16, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontFamily: Typography.fontFamily, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: Spacing.xl },
  emptyTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  emptySub: { fontSize: 13, color: Colors.textLight, marginTop: 4, fontFamily: Typography.fontFamily, textAlign: 'center' },
  tzNote: { marginTop: Spacing.lg, padding: Spacing.md, backgroundColor: Colors.tan, borderRadius: BorderRadius.sm },
  tzNoteText: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily, lineHeight: 18, textAlign: 'center' },
});
