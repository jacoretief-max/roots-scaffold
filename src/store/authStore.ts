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
    try {
      const raw = await SecureStore.getItemAsync(TOKEN_KEY);
      if (raw) {
        const tokens: AuthTokens = JSON.parse(raw);
        set({ tokens });
        // Fetch the user profile to confirm token is still valid
        try {
          const { data } = await api.get('/users/me');
          set({ user: data.data, isAuthenticated: true, isLoading: false });
        } catch {
          // Token invalid or expired — clear and show login
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
