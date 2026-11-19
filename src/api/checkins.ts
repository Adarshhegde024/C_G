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

export interface CheckInChallenge {
  challenge_id: string;
  phrase: string;
  code: string;
  words: string[];
  expires_in_seconds?: number;
}

export function fetchCheckInChallenge(): Promise<CheckInChallenge> {
  return apiClient.get<CheckInChallenge>("/api/checkins/challenge");
}

export function submitCheckIn(params: {
  video: Blob;
  faceSnapshot?: Blob;
  challengeId?: string;
  transcript?: string;
  voiceDetected?: boolean;
}): Promise<SubmitCheckInResult> {
  const formData = new FormData();
  formData.append("video", params.video, "check-in.webm");
  if (params.faceSnapshot) {
    formData.append("face_snapshot", params.faceSnapshot, "face-snapshot.jpg");
  }
  if (params.challengeId) {
    formData.append("challenge_id", params.challengeId);
  }
  if (params.transcript) {
    formData.append("transcript", params.transcript);
  }
  if (params.voiceDetected !== undefined) {
    formData.append("voice_detected", String(params.voiceDetected));
  }
  return apiClient.postForm<SubmitCheckInResult>("/api/checkins", formData);
}

export function fetchAuditLog(): Promise<AuditEvent[]> {
  return apiClient.get<AuditEvent[]>("/api/audit");
}
