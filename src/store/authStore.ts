import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, AuthTokens } from '@/types';
import api from '@/api/client';

const TOKEN_KEY = 'roots_auth_tokens';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: User) => void;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  logout: () => Promise<void>;
  loadTokensFromStorage: () => Promise<void>;
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
