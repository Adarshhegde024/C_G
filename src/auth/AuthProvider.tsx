import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from "@/api/auth";
import { authStore, initAuthSession, type AuthState } from "./authStore";
import type { AuthUser } from "@/types";

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);

  useEffect(() => {
    initAuthSession();
  }, []);

  const value: AuthContextValue = {
    ...state,
    async login(email, password) {
      const user = await loginRequest(email, password);
      authStore.setSession(user);
      return user;
    },
    async logout() {
      await logoutRequest();
      authStore.clear();
    },
    async refresh() {
      try {
        const user = await fetchCurrentUser();
        authStore.setSession(user);
      } catch {
        authStore.clear();
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
