import type { AuthUser } from "@/types";

// Vanilla observable auth store. It lives outside React so router guards
// (beforeLoad) and UI components read the exact same session state.

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

type Listener = () => void;

let state: AuthState = { status: "loading", user: null };

const listeners = new Set<Listener>();

let resolveReady: (() => void) | null = null;
const readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

function emit() {
  listeners.forEach((listener) => listener());
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
    return readyPromise;
  },

  isReady(): boolean {
    return state.status !== "loading";
  },

  isAuthenticated(): boolean {
    return state.status === "authenticated" && state.user !== null;
  },

  getUser(): AuthUser | null {
    return state.user;
  },

  setSession(user: AuthUser) {
    state = { status: "authenticated", user };
    emit();
  },

  clear() {
    state = { status: "unauthenticated", user: null };
    emit();
  },

  /** Finish the initial restore with a resolved user or null. */
  resolve(user: AuthUser | null) {
    state = user ? { status: "authenticated", user } : { status: "unauthenticated", user: null };
    resolveReady?.();
    emit();
  },

  /** Only flip to unauthenticated if the restore hasn't finished. */
  resolveIfPending(user: AuthUser | null) {
    if (state.status === "loading") authStore.resolve(user);
  },
};
