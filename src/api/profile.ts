import { apiClient } from "./client";
import type { DurationValue } from "@/types";

export interface MedicalHoldInfo {
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  note?: string | null;
}

export interface MedicalHoldResponse {
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  note?: string | null;
  account_status: string;
  message: string;
}

export interface ProfileDetails {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  created_at: string;
  account_status: string;
  check_in_frequency?: DurationValue;
  grace_period?: DurationValue;
  medical_hold?: MedicalHoldInfo;
}

export function fetchProfile(): Promise<ProfileDetails> {
  return apiClient.get<ProfileDetails>("/api/profile");
}

export function updateProfile(patch: { full_name?: string | undefined; phone?: string | undefined }): Promise<ProfileDetails> {
  return apiClient.patch<ProfileDetails>("/api/profile", patch);
}

export function updateSecuritySettings(patch: {
  check_in_frequency?: DurationValue | undefined;
  grace_period?: DurationValue | undefined;
}): Promise<{ check_in_frequency: DurationValue; grace_period: DurationValue }> {
  return apiClient.patch("/api/profile/security-settings", patch);
}

export function fetchMedicalHold(): Promise<MedicalHoldInfo> {
  return apiClient.get<MedicalHoldInfo>("/api/profile/medical-hold");
}

export function toggleMedicalHold(payload: { active: boolean; note?: string }): Promise<MedicalHoldResponse> {
  return apiClient.post<MedicalHoldResponse>("/api/profile/medical-hold", payload);
}
