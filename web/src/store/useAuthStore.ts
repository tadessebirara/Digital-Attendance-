import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService } from '../services/api.services';

interface AuthState {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: any) => Promise<boolean>;
  logout: () => void;
  setUser: (user: any) => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),

      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const res: any = await authService.login(credentials);
          if (res.success) {
            localStorage.setItem('token', res.token);
            set({ 
              token: res.token, 
              user: res.user, 
              isAuthenticated: true,
              isLoading: false 
            });
            return true;
          }
        } catch (e) {
          console.error('Login failed', e);
        } finally {
          set({ isLoading: false });
        }
        return false;
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
