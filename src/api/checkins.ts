import { apiClient } from "./client";
import type { AuditEvent, CheckInRecord } from "@/types";

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
