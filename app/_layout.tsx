import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, AppState, Animated, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useRegisterPushToken, QueryKeys } from '@/api/hooks';

const BIOMETRICS_KEY = 'rootedin_biometrics_enabled';
const ONBOARDING_KEY = 'rootedin_seen_onboarding';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

// ── Notification-driven cache invalidation + routing ──────────────────────────
// Server tags connection-request pushes with `data.type` (see server.js).
// Connection state lives in each device's own React Query cache — when David
// accepts on his phone, that only clears the "pending" flag in HIS cache.
// Jaco's app has no idea anything changed until something tells it to refetch.
// Invalidating here (on receipt, not just on tap) means the connections list
// updates itself the moment the push arrives, even if you're already sitting
// on the Circle screen.
function invalidateForNotification(data: unknown): { type?: string; eventId?: string } {
  const parsed = (data as { type?: string; eventId?: string } | undefined) ?? {};
  const { type, eventId } = parsed;
  if (type === 'connection_request' || type === 'connection_accepted') {
    queryClient.invalidateQueries({ queryKey: QueryKeys.connections });
    queryClient.invalidateQueries({ queryKey: ['connection_requests'] });
  }
  if (type === 'new_memory') {
    queryClient.invalidateQueries({ queryKey: QueryKeys.memories });
    if (eventId) queryClient.invalidateQueries({ queryKey: QueryKeys.memory(eventId) });
  }
  return parsed;
}

// When a user taps one of these, send them to the relevant screen — Circle
// for connection requests, straight into the memory for a new-memory alert —
// instead of just foregrounding the app with no indication anything changed.
function handleNotificationData(data: unknown) {
  const { type, eventId } = invalidateForNotification(data);
  if (type === 'connection_request' || type === 'connection_accepted') {
    router.push('/(tabs)/circle');
  } else if (type === 'new_memory' && eventId) {
    router.push(`/memory/${eventId}`);
  }
}

// Cold start: the app may have been fully closed and launched by tapping a
// notification. Call this right after landing on the tabs so a pending
// connection-request notification still routes to Circle, not just the
// default tab.
async function checkPendingNotification() {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) handleNotificationData(response.notification.request.content.data);
  } catch {
    // no-op — worst case the user just lands on the default tab
  }
}

// ── Branded splash / biometric prompt ─────────────────────────────────────────
function SplashScreen({ onBiometricRetry }: { onBiometricRetry?: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={splashStyles.container}>
      <Animated.View style={[splashStyles.content, { opacity: fadeAnim }]}>
        <Text style={splashStyles.wordmark}>Rooted In</Text>
        <Text style={splashStyles.tagline}>The people who matter most</Text>
      </Animated.View>
      {onBiometricRetry && (
        <Animated.View style={[splashStyles.biometricPrompt, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={onBiometricRetry} style={splashStyles.biometricBtn}>
            <Text style={splashStyles.biometricBtnText}>Unlock with Face ID</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', gap: Spacing.sm },
  wordmark: {
    fontSize: 36,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    letterSpacing: 0.3,
  },
  biometricPrompt: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  biometricBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  biometricBtnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    fontWeight: '600',
  },
});

// ── Root navigator ─────────────────────────────────────────────────────────────
type AppPhase = 'loading' | 'biometric' | 'ready';

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { mutate: registerPushToken } = useRegisterPushToken();
  const [phase, setPhase] = useState<AppPhase>('loading');
  const hasRouted = useRef(false);

  // Register push token when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const registerForPush = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const token = await Notifications.getExpoPushTokenAsync({
          projectId: '5864b3fe-1869-4837-a321-2d9290e9537b',
        });
        if (token.data) registerPushToken(token.data);
      } catch {
        console.log('Push registration skipped — Expo Go limitation');
      }
    };
    registerForPush();
  }, [isAuthenticated]);

  // Route after loading completes — only once on initial load.
  // Screens handle their own navigation after that (e.g. register → enroll).
  useEffect(() => {
    if (isLoading) return;
    if (hasRouted.current) return;
    hasRouted.current = true;

    (async () => {
      if (isAuthenticated) {
        // Check if biometrics gate is enabled
        const bioEnabled = await SecureStore.getItemAsync(BIOMETRICS_KEY).catch(() => null);
        if (bioEnabled === 'true') {
          setPhase('biometric');
          triggerBiometric();
        } else {
          setPhase('ready');
          router.replace('/(tabs)');
          checkPendingNotification();
        }
      } else {
        // Check if first-time user
        const seenOnboarding = await SecureStore.getItemAsync(ONBOARDING_KEY).catch(() => null);
        setPhase('ready');
        if (seenOnboarding === 'true') {
          router.replace('/auth');
        } else {
          router.replace('/onboarding');
        }
      }
    })();
  }, [isAuthenticated, isLoading]);

  const triggerBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Rooted In',
        fallbackLabel: 'Use password',
      });
      if (result.success) {
        setPhase('ready');
        router.replace('/(tabs)');
        checkPendingNotification();
      }
      // If cancelled/failed — stay on biometric phase so user can retry
    } catch {
      setPhase('ready');
      router.replace('/(tabs)');
      checkPendingNotification();
    }
  };

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="onboarding/enroll" />
        <Stack.Screen name="memory/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="person/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="new-memory" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile/account" options={{ headerShown: false }} />
        <Stack.Screen name="profile/personalise" options={{ headerShown: false }} />
        <Stack.Screen name="profile/password" options={{ headerShown: false }} />
        <Stack.Screen name="profile/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="profile/verification" options={{ headerShown: false }} />
        <Stack.Screen name="profile/security" options={{ headerShown: false }} />
      </Stack>

      {/* Splash overlay — sits on top of the Stack until routing is settled */}
      {(phase === 'loading' || phase === 'biometric') && (
        <View style={StyleSheet.absoluteFill}>
          <SplashScreen
            onBiometricRetry={phase === 'biometric' ? triggerBiometric : undefined}
          />
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const loadTokensFromStorage = useAuthStore((s) => s.loadTokensFromStorage);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    loadTokensFromStorage();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        ensureFreshToken();
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // App already running (foreground or backgrounded, not cold-started) —
  // route directly on tap. The cold-start equivalent is checkPendingNotification()
  // above, called after initial auth routing settles.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationData(response.notification.request.content.data);
    });
    return () => subscription.remove();
  }, []);

  // Notification arrives while the app is already open (foreground) — refresh
  // the relevant data immediately, without requiring the user to tap it or
  // navigate anywhere. This is what fixes "still shows pending until I
  // restart the app".
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      invalidateForNotification(notification.request.content.data);
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" backgroundColor={Colors.background} />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
