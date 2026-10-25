import type { Role } from "@/types";
import { homeForRole, roleOwnsPath } from "./authApi";

export { homeForRole, roleOwnsPath };

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Vault owner",
  recipient: "Trusted recipient",
  nominee: "Nominee",
  reviewer: "Reviewer",
};

/**
 * Guard helper for route beforeLoad. Returns a redirect target when the user
 * may not view the current path, or null when access is allowed.
 */
export function roleGuard(user: { role: Role } | null, area: Role[]): string | null {
  if (!user) return null; // unauthenticated users are handled by the auth gate
  return area.includes(user.role) ? null : homeForRole(user.role);
}
