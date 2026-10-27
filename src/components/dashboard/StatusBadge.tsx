import { Badge } from "@/components/ui/badge";
import type { AccountStatus } from "@/types";

interface StatusMeta {
  label: string;
  variant: "success" | "warning" | "lavender" | "destructive" | "navy" | "secondary";
}

const STATUS_META: Record<string, StatusMeta> = {
  ACTIVE: { label: "Active", variant: "success" },
  GRACE_PERIOD: { label: "Grace period", variant: "warning" },
  NOMINEE_CASE_ELIGIBLE: { label: "Nominee verification eligible", variant: "lavender" },
  MEDICAL_HOLD: { label: "Medical hold", variant: "warning" },
  AWAITING_REVIEW: { label: "Awaiting review", variant: "secondary" },
  RELEASE_READY: { label: "Release ready", variant: "navy" },
};

const STATUS_COPY: Record<string, string> = {
  ACTIVE: "Your vault is operating normally.",
  GRACE_PERIOD:
    "Your scheduled check-in was missed. You can still complete your check-in before the grace period ends.",
  NOMINEE_CASE_ELIGIBLE: "The nominee verification workflow is now available.",
  MEDICAL_HOLD: "Document releases are temporarily frozen while the medical hold is active.",
  AWAITING_REVIEW: "A verification case is being reviewed by our review team.",
  RELEASE_READY: "Verification is complete and document release is being processed.",
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  const meta = STATUS_META[status] ?? { label: status.replace(/_/g, " "), variant: "secondary" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function statusCopy(status: AccountStatus): string {
  return STATUS_COPY[status] ?? "Status updates as the backend reports account activity.";
}
