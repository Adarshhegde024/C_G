import type { AuthUser } from "@/types";
import { getToken } from "@/api/client";
import { fetchCurrentUser } from "@/api/auth";

// Vanilla observable auth store. It lives outside React so router guards
// (beforeLoad) and UI components read the exact same session state.

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

type Listener = () => void;

const isSsr = typeof window === "undefined";

let state: AuthState = isSsr
  ? { status: "unauthenticated", user: null }
  : { status: "loading", user: null };

const listeners = new Set<Listener>();

let resolveReady: (() => void) | null = null;
let isReadyResolved = isSsr;

const readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
  if (isSsr) {
    resolve();
  }
});

function emit() {
  listeners.forEach((listener) => listener());
}

function resolveInternal(user: AuthUser | null) {
  state = user ? { status: "authenticated", user } : { status: "unauthenticated", user: null };
  isReadyResolved = true;
  resolveReady?.();
  emit();
}

let sessionInitStarted = false;

export async function restoreSession(): Promise<void> {
  if (isSsr) {
    resolveInternal(null);
    return;
  }

  const token = getToken();
  if (!token) {
    resolveInternal(null);
    return;
  }

  // Safety timer: resolve as unauthenticated after 2500ms so route guards never hang
  const timer = setTimeout(() => {
    if (state.status === "loading") {
      resolveInternal(null);
    }
  }, 2500);

  try {
    const user = await fetchCurrentUser();
    clearTimeout(timer);
    resolveInternal(user);
  } catch {
    clearTimeout(timer);
    resolveInternal(null);
  }
}

export function initAuthSession(): void {
  if (isSsr || sessionInitStarted) return;
  sessionInitStarted = true;
  void restoreSession();
}

export const authStore = {
  get(): AuthState {
    return state;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Resolves once the initial session restore has completed. */
  ready(): Promise<void> {
    if (isSsr || isReadyResolved || state.status !== "loading") {
      return Promise.resolve();
    }
    initAuthSession();
    return readyPromise;
  },

  isReady(): boolean {
    return isReadyResolved || state.status !== "loading";
  },

  isAuthenticated(): boolean {
    return state.status === "authenticated" && state.user !== null;
  },

  getUser(): AuthUser | null {
    return state.user;
  },

  setSession(user: AuthUser) {
    state = { status: "authenticated", user };
    isReadyResolved = true;
    resolveReady?.();
    emit();
  },

  clear() {
    state = { status: "unauthenticated", user: null };
    emit();
  },

  /** Finish the initial restore with a resolved user or null. */
  resolve(user: AuthUser | null) {
    resolveInternal(user);
  },

  /** Only flip to unauthenticated if the restore hasn't finished. */
  resolveIfPending(user: AuthUser | null) {
    if (state.status === "loading") {
      resolveInternal(user);
    }
  },
};

// Start restoring session immediately on client after authStore definition
if (!isSsr) {
  initAuthSession();
}
