import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { User, AuthTokens } from '@/types';
import api from '@/api/client';

const TOKEN_KEY = 'roots_auth_tokens';
const BASE_URL = 'https://roots-scaffold-production.up.railway.app/api';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: User) => void;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  logout: () => Promise<void>;
  loadTokensFromStorage: () => Promise<void>;
  ensureFreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tokens: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  setTokens: async (tokens) => {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
    } catch {
      // Fallback for Expo Go development
      await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    }
    set({ tokens });
  },

  logout: async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {}
    set({ user: null, tokens: null, isAuthenticated: false });
  },

  ensureFreshToken: async () => {
    let raw = null;
    try {
      raw = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      raw = await AsyncStorage.getItem(TOKEN_KEY);
    }
    if (!raw) raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (!raw) return;

    const tokens: AuthTokens = JSON.parse(raw);

    // If access token expires in less than 2 minutes, refresh it now
    const twoMinutes = 2 * 60 * 1000;
    if (tokens.expiresAt - Date.now() < twoMinutes) {
      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          { refreshToken: tokens.refreshToken }
        );
        const newTokens: AuthTokens = {
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        try {
          await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(newTokens));
        } catch {
          await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(newTokens));
        }
        set({ tokens: newTokens });
      } catch {
        // Refresh failed — log out
        try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {}
        try { await AsyncStorage.removeItem(TOKEN_KEY); } catch {}
        set({ user: null, tokens: null, isAuthenticated: false });
      }
    }
  },

  loadTokensFromStorage: async () => {
    console.log('LOADING TOKENS...');
    try {
      let raw = null;
      try {
        raw = await SecureStore.getItemAsync(TOKEN_KEY);
      } catch {
        raw = await AsyncStorage.getItem(TOKEN_KEY);
      }
      if (!raw) {
        // Try AsyncStorage fallback
        raw = await AsyncStorage.getItem(TOKEN_KEY);
      }
      console.log('RAW TOKEN:', raw ? 'found' : 'not found');
      if (raw) {
        let tokens: AuthTokens = JSON.parse(raw);

        // If access token is expired (or within 2 min of expiry), refresh it now
        // before attempting /users/me — avoids forced re-login on every restart
        const twoMinutes = 2 * 60 * 1000;
        if (tokens.expiresAt - Date.now() < twoMinutes) {
          try {
            console.log('TOKEN EXPIRED — refreshing...');
            const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
              refreshToken: tokens.refreshToken,
            });
            tokens = {
              accessToken: data.data.accessToken,
              refreshToken: data.data.refreshToken,
              expiresAt: Date.now() + 15 * 60 * 1000,
            };
            try {
              await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
            } catch {
              await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
            }
          } catch (err: any) {
            console.log('REFRESH FAILED — requiring login:', err?.message);
            try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {}
            try { await AsyncStorage.removeItem(TOKEN_KEY); } catch {}
            set({ isLoading: false });
            return;
          }
        }

        set({ tokens });
        try {
          const { data } = await api.get('/users/me');
          console.log('ME RESPONSE:', JSON.stringify(data.data));
          set({ user: data.data, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          console.log('ME ERROR:', err?.message, err?.response?.status);
          try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {}
          try { await AsyncStorage.removeItem(TOKEN_KEY); } catch {}
          set({ isLoading: false });
        }
      } else {
        console.log('NO TOKEN FOUND');
        set({ isLoading: false });
      }
    } catch (err: any) {
      console.log('STORAGE ERROR:', err?.message);
      set({ isLoading: false });
    }
  },
}));
