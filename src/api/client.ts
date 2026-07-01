import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { AuthTokens } from '@/types';
// NOTE: authStore imports `api` from this file, so this is a circular import.
// It's safe because useAuthStore is only dereferenced lazily inside the
// response interceptor callback below (after both modules have finished
// loading), never at module-evaluation time.
import { useAuthStore } from '@/store/authStore';

// ── Config ─────────────────────────────────────────────
// Set your API base URL here. During development, use your
// local machine's IP (not localhost — device can't reach that).
// In production, replace with your deployed API URL.
export const BASE_URL = 'https://roots-scaffold-production.up.railway.app/api';

const TOKEN_KEY = 'roots_auth_tokens';

// ── Create axios instance ──────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach access token ──────────
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    const raw = await SecureStore.getItemAsync(TOKEN_KEY);
    if (raw) {
      const tokens: AuthTokens = JSON.parse(raw);
      config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      console.log('[API] Access token attached');
    } else {
      console.log('[API] No token in store');
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — handle 401 + refresh ────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => {
    console.log(`[API] ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    console.log(`[API] ERROR ${error?.response?.status} ${error?.config?.url}:`, error?.message);
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Mark this request as retried up front — applies whether it's the
      // one driving the refresh or one queued behind an in-flight refresh.
      // Without this, a request that comes back 401 again after being
      // replayed with a "refreshed" token could re-enter this block and
      // kick off another refresh cycle indefinitely.
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const raw = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!raw) throw new Error('No refresh token');

        const tokens: AuthTokens = JSON.parse(raw);
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refreshToken: tokens.refreshToken,
        });

        // Server responds with { data: { accessToken, refreshToken } } —
        // NOT { accessToken, refreshToken } at the top level. Reading the
        // wrong shape here used to silently store `Bearer undefined`,
        // which is the root cause of the "looks logged in but shows
        // nothing" bug after the app has been away for >15 min.
        const newTokens: AuthTokens = {
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
          expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
        };

        // Persist via the auth store so storage AND in-memory app state
        // (isAuthenticated, tokens) stay in sync — this file used to only
        // touch SecureStore directly, leaving the UI thinking it was still
        // logged in even when the token underneath had gone bad.
        await useAuthStore.getState().setTokens(newTokens);
        api.defaults.headers.common.Authorization = `Bearer ${newTokens.accessToken}`;
        processQueue(null, newTokens.accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Refresh token itself is dead — this is unrecoverable. Fully log
        // out (clears storage + resets isAuthenticated) and send the user
        // back to the login screen instead of leaving them stranded on a
        // tab bar that can't load any data.
        await useAuthStore.getState().logout();
        router.replace('/auth');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
