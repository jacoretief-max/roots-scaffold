import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, PanResponder, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { router } from 'expo-router';
import { useConnections } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GLOBE_HEIGHT = SCREEN_WIDTH * 0.9;

// ── Status helpers ─────────────────────────────────────
const getStatus = (): 'available' | 'busy' | 'sleeping' => {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 7) return 'sleeping';
  if (hour >= 9 && hour < 18) return 'available';
  return 'busy';
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

// ── Globe renderer ────────────────────────────────────
const useGlobe = () => {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);
  const rotationRef = useRef({ x: 0.2, y: 0 });
  const autoSpinRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onContextCreate = useCallback((gl: any) => {
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setPixelRatio(1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0F1F2E');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.z = 2.8;
    cameraRef.current = camera;

    // ── Stars ──
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 100;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
    });
    scene.add(new THREE.Points(starGeometry, starMaterial));

    // ── Ocean ──
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
    const oceanMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#0d2b5e'),
      shininess: 60,
      specular: new THREE.Color('#1a4a8a'),
    });
    const ocean = new THREE.Mesh(earthGeometry, oceanMaterial);
    scene.add(ocean);
    earthRef.current = ocean;

    // ── Land using shader — no texture upload needed ──────
    const landGeometry = new THREE.SphereGeometry(1.002, 64, 64);
    const landMaterial = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {},
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;

        float ellipse(vec2 p, vec2 center, vec2 radius) {
          vec2 d = (p - center) / radius;
          return dot(d, d);
        }

        void main() {
          vec2 uv = vUv;
          bool isLand = false;

          // North America
          if (ellipse(uv, vec2(0.18, 0.38), vec2(0.10, 0.14)) < 1.0) isLand = true;
          // South America
          if (ellipse(uv, vec2(0.22, 0.62), vec2(0.065, 0.13)) < 1.0) isLand = true;
          // Europe
          if (ellipse(uv, vec2(0.52, 0.33), vec2(0.055, 0.08)) < 1.0) isLand = true;
          // Africa
          if (ellipse(uv, vec2(0.53, 0.55), vec2(0.075, 0.14)) < 1.0) isLand = true;
          // Asia
          if (ellipse(uv, vec2(0.68, 0.35), vec2(0.18, 0.12)) < 1.0) isLand = true;
          // Australia
          if (ellipse(uv, vec2(0.78, 0.65), vec2(0.07, 0.06)) < 1.0) isLand = true;
          // Greenland
          if (ellipse(uv, vec2(0.29, 0.20), vec2(0.04, 0.05)) < 1.0) isLand = true;

          if (!isLand) discard;

          // Sage green with lighting
          float light = dot(vNormal, normalize(vec3(1.0, 0.5, 1.0))) * 0.4 + 0.6;
          gl_FragColor = vec4(0.18 * light, 0.42 * light, 0.16 * light, 1.0);
        }
      `,
    });
    const land = new THREE.Mesh(landGeometry, landMaterial);
    scene.add(land);
    earthRef.current = ocean;

    // ── Atmosphere ──
    const atmosphereGeometry = new THREE.SphereGeometry(1.15, 64, 64);
    const atmosphereMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#4488ff'),
      transparent: true,
      opacity: 0.08,
      side: THREE.FrontSide,
    });
    scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));

    const outerAtmosphereGeometry = new THREE.SphereGeometry(1.25, 64, 64);
    const outerAtmosphereMaterial = new THREE.MeshPhongMaterial({
      color: new THREE.Color('#2255cc'),
      transparent: true,
      opacity: 0.04,
      side: THREE.FrontSide,
    });
    scene.add(new THREE.Mesh(outerAtmosphereGeometry, outerAtmosphereMaterial));

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0x333355, 0.8));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0x334466, 0.3);
    fillLight.position.set(-5, -3, -5);
    scene.add(fillLight);

    // ── Animation loop ──
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (autoSpinRef.current) {
        rotationRef.current.y += 0.002;
      }

      ocean.rotation.x = rotationRef.current.x;
      ocean.rotation.y = rotationRef.current.y;
      land.rotation.x = rotationRef.current.x;
      land.rotation.y = rotationRef.current.y;

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    animate();
  }, []);

  const handleRotate = useCallback((dx: number, dy: number) => {
    autoSpinRef.current = false;
    rotationRef.current.y += dx * 0.008;
    rotationRef.current.x += dy * 0.008;
    rotationRef.current.x = Math.max(-1.2, Math.min(1.2, rotationRef.current.x));

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      autoSpinRef.current = true;
    }, 3000);
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    rendererRef.current?.dispose();
  }, []);

  return { onContextCreate, handleRotate, cleanup };
};

// ── Connection list item ───────────────────────────────
const ConnectionListItem = ({ item }: { item: any }) => {
  const displayName = item.connectedUser?.displayName ?? 'Unknown';
  const avatarColour = item.connectedUser?.avatarColour ?? Colors.terracotta;
  const city = item.connectedUser?.city ?? '';
  const status = getStatus();

  return (
    <TouchableOpacity
      style={styles.connectionItem}
      onPress={() => router.push(`/person/${item.id}`)}
      activeOpacity={0.85}
    >
      <View style={[styles.connectionAvatar, { backgroundColor: avatarColour }]}>
        <Text style={styles.connectionAvatarText}>
          {displayName.charAt(0).toUpperCase()}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
      </View>
      <View style={styles.connectionInfo}>
        <Text style={styles.connectionName}>{displayName}</Text>
        {city ? <Text style={styles.connectionCity}>{city}</Text> : null}
      </View>
      <View style={[styles.statusBadge, { borderColor: STATUS_COLORS[status] + '44' }]}>
        <View style={[styles.statusDotSmall, { backgroundColor: STATUS_COLORS[status] }]} />
        <Text style={[styles.statusLabel, { color: STATUS_COLORS[status] }]}>
          {STATUS_LABELS[status]}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ── Globe screen ───────────────────────────────────────
export default function GlobeScreen() {
  const { onContextCreate, handleRotate, cleanup } = useGlobe();
  const { data: connections = [], isLoading } = useConnections();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        handleRotate(gestureState.dx, gestureState.dy);
      },
    })
  ).current;

  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        {/* Globe */}
        <View
          style={styles.globeWrap}
          {...panResponder.panHandlers}
        >
          <GLView
            style={styles.glView}
            onContextCreate={onContextCreate}
          />

          {/* Title overlay */}
          <View style={styles.globeOverlay}>
            <Text style={styles.globeTitle}>Globe</Text>
          </View>
        </View>

        {/* Connection list */}
        <View style={styles.listWrap}>
          <Text style={styles.listLabel}>
            Your circle · {connections.length} {connections.length === 1 ? 'person' : 'people'}
          </Text>

          {isLoading && (
            <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.lg }} />
          )}

          {!isLoading && connections.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No connections yet.</Text>
              <Text style={styles.emptySub}>Add people from Connect.</Text>
            </View>
          )}

          {connections.map((c: any) => (
            <ConnectionListItem key={c.id} item={c} />
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.globeBackground },

  // Globe
  globeWrap: {
    width: SCREEN_WIDTH,
    height: GLOBE_HEIGHT,
    backgroundColor: Colors.globeBackground,
  },
  glView: {
    width: SCREEN_WIDTH,
    height: GLOBE_HEIGHT,
  },
  globeOverlay: {
    position: 'absolute',
    top: Spacing.lg,
    left: Spacing.lg,
  },
  globeTitle: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
    opacity: 0.9,
  },

  // Connection list
  listWrap: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    marginTop: -24,
    minHeight: Dimensions.get('window').height * 0.5,
  },
  listLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
  },

  // Connection item
  connectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    gap: Spacing.md,
  },
  connectionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionAvatarText: { fontSize: 16, color: Colors.white, fontWeight: '600' },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  connectionInfo: { flex: 1 },
  connectionName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  connectionCity: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
    fontFamily: Typography.fontFamily,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 0.5,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: Spacing.xl },
  emptyText: {
    fontSize: Typography.body,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
    fontFamily: Typography.fontFamily,
  },
});
