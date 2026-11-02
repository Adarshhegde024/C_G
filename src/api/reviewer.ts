import { apiClient, BASE_URL, getToken } from "./client";
import type { ReviewerCase } from "@/types";

export function fetchReviewerCases(): Promise<ReviewerCase[]> {
  return apiClient.get<ReviewerCase[]>("/api/reviewer/cases");
}

export function fetchReviewerCase(id: string): Promise<ReviewerCase> {
  return apiClient.get<ReviewerCase>(`/api/reviewer/cases/${id}`);
}

export function approveCase(id: string, note?: string): Promise<ReviewerCase> {
  return apiClient.post<ReviewerCase>(`/api/reviewer/cases/${id}/approve`, { note });
}

export function rejectCase(id: string, note?: string): Promise<ReviewerCase> {
  return apiClient.post<ReviewerCase>(`/api/reviewer/cases/${id}/reject`, { note });
}

export function requestMoreInfo(id: string, note?: string): Promise<ReviewerCase> {
  return apiClient.post<ReviewerCase>(`/api/reviewer/cases/${id}/request-info`, { note });
}

export interface EvidenceInfo {
  download_url: string;
  preview_url: string;
  file_name: string;
  file_type?: string;
  size_bytes?: number;
}

export function fetchEvidenceInfo(evidenceId: string): Promise<EvidenceInfo> {
  return apiClient.get<EvidenceInfo>(`/api/reviewer/evidence/${evidenceId}/url`);
}

export async function fetchEvidenceBlob(evidenceId: string): Promise<{ url: string; contentType: string }> {
  const token = getToken();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const endpointUrl = new URL(`${BASE_URL}/api/reviewer/evidence/${evidenceId}/download?inline=true`, origin);

  const res = await fetch(endpointUrl.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error("Could not load evidence preview.");
  }

  const blob = await res.blob();
  const previewUrl = window.URL.createObjectURL(blob);
  return { url: previewUrl, contentType: res.headers.get("Content-Type") || blob.type };
}

export async function triggerEvidenceDownload(evidenceId: string, fileName?: string): Promise<void> {
  const token = getToken();
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const endpointUrl = new URL(`${BASE_URL}/api/reviewer/evidence/${evidenceId}/download`, origin);

  const res = await fetch(endpointUrl.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const errorText = await res.text();
    let msg = "Could not download evidence file.";
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
  a.download = fileName || "evidence_document";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(blobUrl);
  document.body.removeChild(a);
}
