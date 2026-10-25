import { apiClient } from "./client";
import type { Recipient } from "@/types";

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
