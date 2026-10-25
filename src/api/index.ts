import { apiClient } from "./client";
import type {
  AppNotification,
  AuditEvent,
  AuthUser,
  CheckInRecord,
  DashboardSummary,
  DurationValue,
  Nominee,
  Recipient,
  VaultDocument,
} from "@/types";

// ---- Dashboard ---------------------------------------------------------------

export function fetchDashboard(): Promise<DashboardSummary> {
  return apiClient.get<DashboardSummary>("/api/dashboard");
}

// ---- Documents ---------------------------------------------------------------

export function fetchDocuments(query?: { search?: string }): Promise<VaultDocument[]> {
  return apiClient.get<VaultDocument[]>("/api/documents", { query: query ? { search: query.search } : undefined });
}

export function uploadDocument(file: File, recipientId?: string): Promise<VaultDocument> {
  const formData = new FormData();
  formData.append("file", file);
  if (recipientId) formData.append("recipient_id", recipientId);
  return apiClient.postForm<VaultDocument>("/api/documents", formData);
}

export function deleteDocument(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/documents/${id}`);
}

export function assignDocumentRecipient(id: string, recipientId: string | null): Promise<VaultDocument> {
  return apiClient.patch<VaultDocument>(`/api/documents/${id}`, { recipient_id: recipientId });
}

export function releaseDocument(id: string): Promise<VaultDocument> {
  return apiClient.post<VaultDocument>(`/api/documents/${id}/release`);
}

export function revokeDocumentRelease(id: string): Promise<VaultDocument> {
  return apiClient.post<VaultDocument>(`/api/documents/${id}/revoke-release`);
}

// ---- Recipients ---------------------------------------------------------------

export function fetchRecipients(): Promise<Recipient[]> {
  return apiClient.get<Recipient[]>("/api/recipients");
}

export function addRecipient(name: string, email: string): Promise<Recipient> {
  return apiClient.post<Recipient>("/api/recipients", { name, email });
}

export function updateRecipient(id: string, patch: { name?: string; email?: string }): Promise<Recipient> {
  return apiClient.patch<Recipient>(`/api/recipients/${id}`, patch);
}

export function removeRecipient(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/recipients/${id}`);
}

export function sendRecipientInvitation(id: string): Promise<Recipient> {
  return apiClient.post<Recipient>(`/api/recipients/${id}/invite`);
}

// ---- Nominee (owner management) ------------------------------------------------

export function fetchNominee(): Promise<Nominee | null> {
  return apiClient.get<Nominee | null>("/api/nominee");
}

export function saveNominee(name: string, email: string): Promise<Nominee> {
  return apiClient.post<Nominee>("/api/nominee", { name, email });
}

export function updateNominee(name: string, email: string): Promise<Nominee> {
  return apiClient.patch<Nominee>("/api/nominee", { name, email });
}

export function removeNominee(): Promise<void> {
  return apiClient.delete<void>("/api/nominee");
}

export function sendNomineeInvitation(): Promise<Nominee> {
  return apiClient.post<Nominee>("/api/nominee/invite");
}

// ---- Check-ins & history --------------------------------------------------------

export interface SubmitCheckInResult {
  result: "SUCCESS" | "FAILED" | (string & {});
  reason?: string | null;
  message?: string | null;
}

export function fetchCheckInHistory(): Promise<CheckInRecord[]> {
  return apiClient.get<CheckInRecord[]>("/api/checkins");
}

export function submitCheckIn(video: Blob): Promise<SubmitCheckInResult> {
  const formData = new FormData();
  formData.append("video", video, "check-in.webm");
  return apiClient.postForm<SubmitCheckInResult>("/api/checkins", formData);
}

export function fetchAuditLog(): Promise<AuditEvent[]> {
  return apiClient.get<AuditEvent[]>("/api/audit");
}

// ---- Profile -------------------------------------------------------------------

export interface ProfileDetails {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  created_at: string;
  account_status: string;
}

export function fetchProfile(): Promise<ProfileDetails> {
  return apiClient.get<ProfileDetails>("/api/profile");
}

export function updateProfile(patch: { full_name?: string; phone?: string }): Promise<ProfileDetails> {
  return apiClient.patch<ProfileDetails>("/api/profile", patch);
}

export function updateSecuritySettings(patch: {
  check_in_frequency?: DurationValue;
  grace_period?: DurationValue;
}): Promise<{ check_in_frequency: DurationValue; grace_period: DurationValue }> {
  return apiClient.patch("/api/profile/security-settings", patch);
}

// ---- Notifications ----------------------------------------------------------------

export function fetchNotifications(): Promise<AppNotification[]> {
  return apiClient.get<AppNotification[]>("/api/notifications");
}

export function markNotificationsRead(): Promise<void> {
  return apiClient.post<void>("/api/notifications/read");
}

// ---- Invitation -----------------------------------------------------------------

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
