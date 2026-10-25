import { apiClient } from "./client";
import type { AuthUser } from "@/types";

export function fetchInvitation(token: string) {
  return apiClient.get<{
    email?: string;
    inviter_name?: string;
    vault_owner?: string;
    role?: string;
    status?: string;
    expires_at?: string | null;
  }>(`/api/invite/${token}`);
}

export function acceptInvitation(token: string, password?: string) {
  return apiClient.post<{ token?: string; user?: AuthUser }>(`/api/invite/${token}/accept`, { password });
}
