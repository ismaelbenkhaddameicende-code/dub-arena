import { create } from 'zustand';
import type { PublicUser } from '@dub-arena/shared';
import { api, setToken, getToken } from '../lib/api';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  updateProfile: (patch: { displayName?: string; avatarColor?: string }) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  init: async () => {
    if (!getToken()) { set({ loading: false }); return; }
    try {
      const { user } = await api.get<{ user: PublicUser }>('/api/auth/me');
      set({ user, loading: false });
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const data = await api.post<{ token: string; user: PublicUser }>('/api/auth/login', { email, password });
      setToken(data.token);
      set({ user: data.user, loading: false });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  register: async (email, password, displayName) => {
    set({ error: null });
    try {
      const data = await api.post<{ token: string; user: PublicUser }>('/api/auth/register', { email, password, displayName });
      setToken(data.token);
      set({ user: data.user, loading: false });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  logout: () => {
    setToken(null);
    set({ user: null });
  },

  updateProfile: async (patch) => {
    const { user } = await api.patch<{ user: PublicUser }>('/api/auth/me', patch);
    set({ user });
  },
}));
