import { apiClient, BASE_URL, getToken } from "./client";
import type { VaultDocument } from "@/types";

export function fetchDocuments(query?: { search?: string }): Promise<VaultDocument[]> {
  return apiClient.get<VaultDocument[]>("/api/documents", { query: query ? { search: query.search } : undefined });
}

export function uploadDocument(file: File, recipientId?: string | undefined): Promise<VaultDocument> {
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

export interface DocumentDownloadInfo {
  download_url: string;
  file_name: string;
  file_type?: string;
  size_bytes?: number;
}

export function getDocumentDownloadUrl(id: string): Promise<DocumentDownloadInfo> {
  return apiClient.get<DocumentDownloadInfo>(`/api/documents/${id}/download-url`);
}

export async function triggerDocumentDownload(id: string, fileName?: string): Promise<void> {
  const token = getToken();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const endpointUrl = new URL(`${BASE_URL}/api/documents/${id}/download`, origin);

  const res = await fetch(endpointUrl.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const errorText = await res.text();
    let msg = "Could not download document.";
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.detail) msg = parsed.detail;
    } catch {}
    throw new Error(msg);
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = blobUrl;
  a.download = fileName || "document";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(blobUrl);
  document.body.removeChild(a);
}
