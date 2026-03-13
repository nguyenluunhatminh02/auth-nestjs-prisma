"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, type UserInfo, type AuthData } from "./api";

interface AuthContextValue {
  user: UserInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setAuthData: (data: AuthData) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("accessToken");
    const storedRefresh = localStorage.getItem("refreshToken");
    const storedUser = localStorage.getItem("user");

    if (storedToken && storedRefresh && storedUser) {
      setAccessToken(storedToken);
      setRefreshToken(storedRefresh);
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        clearAuth();
      }
    }
    setIsLoading(false);
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  }, []);

  const setAuthData = useCallback((data: AuthData) => {
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      if (res.data) setAuthData(res.data);
    },
    [setAuthData]
  );

  const register = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => {
      const res = await api.register(data);
      if (res.data) setAuthData(res.data);
    },
    [setAuthData]
  );

  const logout = useCallback(async () => {
    try {
      if (refreshToken) await api.logout(refreshToken);
    } catch {
      // ignore
    }
    clearAuth();
  }, [refreshToken, clearAuth]);

  const logoutAll = useCallback(async () => {
    try {
      await api.logoutAll();
    } catch {
      // ignore
    }
    clearAuth();
  }, [clearAuth]);

  const refreshUser = useCallback(async () => {
    if (!refreshToken) return;
    try {
      const res = await api.refreshToken(refreshToken);
      if (res.data) setAuthData(res.data);
    } catch {
      clearAuth();
    }
  }, [refreshToken, setAuthData, clearAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        isLoading,
        isAuthenticated: !!accessToken,
        login,
        register,
        logout,
        logoutAll,
        setAuthData,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
