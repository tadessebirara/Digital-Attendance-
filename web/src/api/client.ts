import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from './types';

export type { ApiResponse, ApiAxiosResponse } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 8000,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
const failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue.length = 0;
};

apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => response,
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // Don't retry if the failing request is itself a refresh/logout call
      const url = originalRequest.url || '';
      if (url.includes('/auth/refresh') || url.includes('/auth/logout')) {
        return Promise.reject(error.response?.data ?? error);
      }

      const errorCode = error.response.data?.code;
      if (
        errorCode === 'TOKEN_VERSION_EXPIRED' ||
        errorCode === 'TOKEN_VERSION_MISMATCH' ||
        errorCode === 'TOKEN_VERSION_MISSING' ||
        errorCode === 'ACCOUNT_NOT_ACTIVE' ||
        errorCode === 'SESSION_EXPIRED'
      ) {
        console.warn('Security Event: Session invalidated by server.');
        window.location.href = '/login?reason=session_invalidated';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers && token) {
            originalRequest.headers.Authorization = `Bearer ${token as string}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return new Promise((resolve, reject) => {
        // Try sessionStorage first, fall back to localStorage for existing sessions
        const rt = sessionStorage.getItem('rt') ?? localStorage.getItem('rt');
        apiClient
          .post<{ accessToken: string; refreshToken?: string }>('/auth/refresh',
            rt ? { refreshToken: rt } : {}
          )
          .then((refreshRes: AxiosResponse<ApiResponse<{ accessToken: string; refreshToken?: string }>>) => {
            const body = refreshRes.data;
            const newToken = body.data?.accessToken;
            const newRt = body.data?.refreshToken;
            if (!body.success || !newToken) {
              processQueue(new Error('Refresh failed'), null);
              window.location.href = '/login?reason=session_expired';
              reject(error);
              return;
            }
            setAccessToken(newToken);
            if (newRt) {
              sessionStorage.setItem('rt', newRt);
              localStorage.removeItem('rt'); // clean up legacy
            }
            processQueue(null, newToken);
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(apiClient(originalRequest));
          })
          .catch((err: AxiosError<ApiResponse>) => {
            processQueue(err, null);
            window.location.href = '/login?reason=session_expired';
            reject(err);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    return Promise.reject(error.response?.data ?? error);
  }
);

export default apiClient;
