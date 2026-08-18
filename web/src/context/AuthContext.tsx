import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient, { setAccessToken } from '../api/client';
import { socketService } from '../services/socket.service';
import { useNotificationStore } from '../store/useNotificationStore';

const REFRESH_TOKEN_KEY = 'rt';

// sessionStorage is preferred over localStorage for the refresh token —
// it is cleared when the browser tab closes, reducing the XSS exposure window.
// The token is still accessible to JS on the same origin, so proper CSP headers
// remain the main defence. Switch to httpOnly cookies if the backend is
// same-origin or configured with proper CORS credentials.
const _storage = sessionStorage;

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: 'ADMIN' | 'HR' | 'EMPLOYEE';
  status: string;
  profilePicture?: string;
  department?: string;
  position?: string;
  employeeId?: string;
  permissions?: string[];
}

interface LoginPayload {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => void;
  hasRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      try {
        // Try sessionStorage first, fall back to localStorage for existing sessions
        const storedRt = _storage.getItem(REFRESH_TOKEN_KEY) ?? localStorage.getItem(REFRESH_TOKEN_KEY);
        // Migrate any old localStorage token to sessionStorage on first load
        if (!_storage.getItem(REFRESH_TOKEN_KEY) && localStorage.getItem(REFRESH_TOKEN_KEY)) {
          _storage.setItem(REFRESH_TOKEN_KEY, localStorage.getItem(REFRESH_TOKEN_KEY)!);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
        const refreshRes = await apiClient.post<{ accessToken: string; refreshToken?: string }>(
          '/auth/refresh',
          storedRt ? { refreshToken: storedRt } : {},
          { timeout: 5000 }
        );
        const refreshBody = refreshRes.data;
        if (refreshBody.success && refreshBody.data?.accessToken) {
          const newToken = refreshBody.data.accessToken;
          setAccessToken(newToken);
          if (refreshBody.data?.refreshToken) {
            _storage.setItem(REFRESH_TOKEN_KEY, refreshBody.data.refreshToken);
          }
          const profileRes = await apiClient.get<{ user: User }>('/auth/me');
          const pBody = profileRes.data;
          if (pBody.success && pBody.data?.user) {
            const u = pBody.data.user;
            setUser(u);
            socketService.connect(u.id, newToken);
            useNotificationStore.getState().initSocketListeners();
            useNotificationStore.getState().fetchNotifications();
          }
        }
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    verifyToken();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    const r = await apiClient.post<LoginPayload>('/auth/login', { email, password });
    const body = r.data;
    if (body.success && body.data) {
      const { accessToken: newToken, refreshToken: newRt, user: userData } = body.data;
      if (!newToken || !userData) return null;
      setAccessToken(newToken);
      if (newRt) _storage.setItem(REFRESH_TOKEN_KEY, newRt);
      setUser(userData);
      socketService.connect(userData.id, newToken);
      useNotificationStore.getState().initSocketListeners();
      useNotificationStore.getState().fetchNotifications();
      return userData;
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    try {
      const storedRt = _storage.getItem(REFRESH_TOKEN_KEY);
      await apiClient.post('/auth/logout', storedRt ? { refreshToken: storedRt } : {});
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      _storage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY); // clean up any legacy token
      socketService.disconnect();
      setAccessToken(null);
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const hasRole = useCallback(
    (roles: string[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
