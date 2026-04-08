import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/authStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import { Colors } from '@/constants/theme';
import { useRegisterPushToken } from '@/api/hooks';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/(tabs)');
      } else {
        router.replace('/auth');
      }
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.terracotta} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth/index" />
      <Stack.Screen name="onboarding" />
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
  );
}

export default function RootLayout() {
  const loadTokensFromStorage = useAuthStore((s) => s.loadTokensFromStorage);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const appState = useRef(AppState.currentState);
  const { mutate: registerPushToken } = useRegisterPushToken();

  useEffect(() => {
    loadTokensFromStorage();
  }, []);

  useEffect(() => {
    const registerForPush = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'YOUR_EAS_PROJECT_ID', // from app.json extra.eas.projectId
      });
      if (token.data) registerPushToken(token.data);
    };
    registerForPush();
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
