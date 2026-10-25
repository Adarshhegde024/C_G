import { apiClient } from "./client";
import type { AppNotification } from "@/types";

export function fetchNotifications(): Promise<AppNotification[]> {
  return apiClient.get<AppNotification[]>("/api/notifications");
}

export function markNotificationsRead(): Promise<void> {
  return apiClient.post<void>("/api/notifications/read");
}
