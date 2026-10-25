import { apiClient } from "./client";
import type { DurationValue } from "@/types";

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
