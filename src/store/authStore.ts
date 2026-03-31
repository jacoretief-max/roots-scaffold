import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, AuthTokens } from '@/types';

const TOKEN_KEY = 'roots_auth_tokens';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: User) => void;
  setTokens: (tokens: AuthTokens) => void;
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
    // Store refresh token in secure enclave (Keychain/Keystore)
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
        // Check if access token is still valid
        if (tokens.expiresAt > Date.now()) {
          set({ tokens, isLoading: false });
        } else {
          // Expired — will trigger refresh on first API call
          set({ tokens, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
