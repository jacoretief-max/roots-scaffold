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
import { useRegisterPushToken } from '@/api/hooks';

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

  // Route after loading completes
  useEffect(() => {
    if (isLoading) return;

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
      }
      // If cancelled/failed — stay on biometric phase so user can retry
    } catch {
      setPhase('ready');
      router.replace('/(tabs)');
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
