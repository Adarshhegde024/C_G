import { apiClient } from "./client";
import type { VaultDocument } from "@/types";

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
