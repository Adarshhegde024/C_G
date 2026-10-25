import { authStore } from "./authStore";
import type { AuthUser, Role } from "@/types";

// Object handed to the router context. Route guards use it in beforeLoad so
// protected routes never render for unauthenticated or wrongly-roled users.
// The backend remains the final authorization authority — these guards exist
// only to route users sensibly and prevent casual URL probing.

export const authApi = {
  /** Await completion of the initial session restore. */
  ensureReady: () => authStore.ready(),
  isAuthenticated: () => authStore.isAuthenticated(),
  getUser: (): AuthUser | null => authStore.getUser(),
};

export type AuthApi = typeof authApi;

export const ROLE_HOME: Record<Role, string> = {
  owner: "/dashboard",
  recipient: "/recipient/dashboard",
  nominee: "/nominee/dashboard",
  reviewer: "/reviewer/dashboard",
};

export function homeForRole(role: Role): string {
  return ROLE_HOME[role] ?? "/";
}

const ROLE_AREA_PREFIX: Record<Role, string> = {
  owner: "/dashboard,/documents,/recipients,/nominee,/check-in,/history,/profile,/settings",
  recipient: "/recipient/dashboard,/recipient/documents,/recipient/history,/recipient/profile",
  nominee: "/nominee/dashboard,/nominee/case,/nominee/history,/nominee/profile",
  reviewer: "/reviewer/dashboard,/reviewer/cases",
};

export function roleOwnsPath(role: Role, pathname: string): boolean {
  const allowed = ROLE_AREA_PREFIX[role] ?? "";
  return allowed.split(",").some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Roles allowed to view a given path, used by per-route beforeLoad guards. */
export function requireRole(allowed: Role[]): (user: AuthUser | null) => string | null {
  return (user) => {
    if (!user) return null; // unauthenticated is handled by the auth gate
    return allowed.includes(user.role) ? null : homeForRole(user.role);
  };
}
