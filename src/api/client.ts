import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { AuthTokens } from '@/types';

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

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const raw = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!raw) throw new Error('No refresh token');

        const tokens: AuthTokens = JSON.parse(raw);
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refreshToken: tokens.refreshToken,
        });

        const newTokens: AuthTokens = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
        };

        await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(newTokens));
        api.defaults.headers.common.Authorization = `Bearer ${newTokens.accessToken}`;
        processQueue(null, newTokens.accessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Clear tokens — user must log in again
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
