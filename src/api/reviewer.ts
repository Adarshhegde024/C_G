import { apiClient } from "./client";
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
