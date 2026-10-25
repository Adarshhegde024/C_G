import { apiClient } from "./client";
import type { DashboardSummary } from "@/types";

export function fetchDashboard(): Promise<DashboardSummary> {
  return apiClient.get<DashboardSummary>("/api/dashboard");
}
