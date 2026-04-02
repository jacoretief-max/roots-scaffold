import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
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
    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens));
    set({ tokens });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ user: null, tokens: null, isAuthenticated: false });
  },

  ensureFreshToken: async () => {
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
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
        await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(newTokens));
        set({ tokens: newTokens });
      } catch {
        // Refresh failed — log out
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        set({ user: null, tokens: null, isAuthenticated: false });
      }
    }
  },

  loadTokensFromStorage: async () => {
    console.log('LOADING TOKENS...');
    try {
      const raw = await SecureStore.getItemAsync(TOKEN_KEY);
      console.log('RAW TOKEN:', raw ? 'found' : 'not found');
      if (raw) {
        const tokens: AuthTokens = JSON.parse(raw);
        set({ tokens });
        try {
          const { data } = await api.get('/users/me');
          console.log('ME RESPONSE:', JSON.stringify(data.data));
          set({ user: data.data, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          console.log('ME ERROR:', err?.message, err?.response?.status);
          await SecureStore.deleteItemAsync(TOKEN_KEY);
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
