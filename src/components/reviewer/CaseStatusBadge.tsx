import { Badge, type BadgeProps } from "@/components/ui/badge";

const CASE_STATUS_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  PENDING: { label: "Pending", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  MORE_INFO_REQUESTED: { label: "More information requested", variant: "secondary" },
};

export function CaseStatusBadge({ status }: { status: string }) {
  const meta = CASE_STATUS_BADGE[String(status).toUpperCase()] ?? { label: status.replace(/_/g, " "), variant: "secondary" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
