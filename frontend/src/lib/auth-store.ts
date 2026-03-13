import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, type UserInfo, type AuthData } from "./api";

interface AuthState {
  user: UserInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setAuthData: (data: AuthData) => void;
  clearAuth: () => void;
  initAuth: () => void;
  login: (email: string, password: string) => Promise<AuthData | null | undefined>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: UserInfo) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,
      isAuthenticated: false,

      setAuthData: (data: AuthData) => {
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      clearAuth: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      initAuth: () => {
        const state = get();
        // Zustand persist handles hydration; just mark loading done
        set({ isLoading: false, isAuthenticated: !!state.accessToken });
      },

      login: async (email: string, password: string) => {
        const res = await api.login({ email, password });
        // If MFA required, return 'mfa' with temp token so UI can handle
        if (res.data?.mfaRequired) {
          return res.data; // caller checks mfaRequired
        }
        if (res.data) get().setAuthData(res.data);
        return res.data;
      },

      register: async (data) => {
        const res = await api.register(data);
        if (res.data) get().setAuthData(res.data);
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          if (refreshToken) await api.logout(refreshToken);
        } catch {
          // ignore
        }
        get().clearAuth();
      },

      logoutAll: async () => {
        try {
          await api.logoutAll();
        } catch {
          // ignore
        }
        get().clearAuth();
      },

      refreshUser: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;
        try {
          const res = await api.refreshToken(refreshToken);
          if (res.data) get().setAuthData(res.data);
        } catch {
          get().clearAuth();
        }
      },

      setUser: (user: UserInfo) => {
        set({ user });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
          state.isAuthenticated = !!state.accessToken;
        }
      },
    }
  )
);
