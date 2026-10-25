import { apiClient } from "./client";
import type { Nominee, NomineeCase } from "@/types";

// ---- Owner nominee management ----------------------------------------------

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

// ---- Nominee portal ---------------------------------------------------------

export function fetchNomineeCase(): Promise<NomineeCase> {
  return apiClient.get<NomineeCase>("/api/nominee/case");
}

export function submitNomineeEvidence(file: File, note?: string): Promise<NomineeCase> {
  const formData = new FormData();
  formData.append("file", file);
  if (note) formData.append("note", note);
  return apiClient.postForm<NomineeCase>("/api/nominee/case/evidence", formData);
}
