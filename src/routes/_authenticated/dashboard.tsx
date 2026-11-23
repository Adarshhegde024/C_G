import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CalendarClock,
  FolderLock,
  ShieldCheck,
  Snowflake,
  Timer,
  UserCheck,
  Users,
  Video,
} from "lucide-react";

import { fetchDashboard } from "@/api/dashboard";
import { useAuth } from "@/auth/AuthProvider";
import { StatusBadge, statusCopy } from "@/components/dashboard/StatusBadge";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader, Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/api/client";
import type { DashboardSummary } from "@/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · CloudGuard" },
      { name: "description", content: "Overview of your CloudGuard vault status and check-in schedule." },
      { property: "og:title", content: "Dashboard · CloudGuard" },
      { property: "og:description", content: "Overview of your CloudGuard vault status and check-in schedule." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function remainingText(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "Due now";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function formatDuration(duration: { value: number; unit: string } | undefined): string {
  if (!duration) return "—";
  const unit = duration.value === 1 ? duration.unit.replace(/s$/, "") : duration.unit;
  return `${duration.value} ${unit}`;
}

/** Re-renders every minute so "remaining" stays live without hardcoding values. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
}

function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useMinuteTick();
  const query = useQuery<DashboardSummary, ApiError>({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 5000,
  });

  const prevNomineeStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!query.data?.nominee_status) return;
    const current = query.data.nominee_status;
    const prev = prevNomineeStatusRef.current;

    // Detect when nominee status transitions from Pending to Accepted
    if (prev && prev.toLowerCase().includes("pending") && current.toLowerCase().includes("accepted")) {
      toast.success("Nominee accepted your invitation! Vault emergency contact is active.", {
        duration: 6000,
      });
      void queryClient.invalidateQueries({ queryKey: ["nominee"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }

    prevNomineeStatusRef.current = current;
  }, [query.data?.nominee_status, queryClient]);

  if (query.isPending) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${user?.name.split(" ")[0] ?? "there"}`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="mt-4 h-40" />
      </>
    );
  }

  if (query.isError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{query.error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  const data = query.data;
  const remaining = remainingText(data.next_check_in_deadline);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? "there"}`}
        description="Here's the current state of your vault."
      />

      {/* Medical Hold Freeze Banner */}
      {data.account_status === "MEDICAL_HOLD" && (
        <Card className="mb-4 border-lavender/50 bg-gradient-to-r from-lavender/15 via-secondary to-lavender/10 p-5 shadow-sm">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavender/20 text-lavender">
              <Snowflake className="h-5 w-5 animate-pulse" aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-semibold text-foreground text-base">Vault Frozen — Medical Hold Active</h3>
                <span className="rounded-full bg-lavender/20 px-2.5 py-0.5 text-xs font-medium text-lavender">Deadlines Paused</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                Your designated nominee has placed your vault under a temporary medical hold. All check-in countdowns, grace periods, and document releases are securely paused.
                {data.medical_hold?.note ? ` Note: "${data.medical_hold.note}"` : ""}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Status banner */}
      <Card className="mb-4 vault-gradient border-transparent p-6 text-vault-foreground">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lavender">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-3">
                <p className="font-display text-base font-semibold">Account status</p>
                <StatusBadge status={data.account_status} />
              </div>
              <p className="mt-1 max-w-xl text-sm text-vault-muted">{data.status_message ?? statusCopy(data.account_status)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Check-in card */}
      <Card className="card-hover mb-4 border-lavender/40 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              {data.account_status === "MEDICAL_HOLD" ? (
                <Snowflake className="h-5 w-5 text-lavender" aria-hidden />
              ) : (
                <Video className="h-5 w-5" aria-hidden />
              )}
            </span>
            <div>
              <p className="font-display text-base font-semibold">
                {data.account_status === "MEDICAL_HOLD" ? "Check-in paused (Medical hold active)" : "Your next check-in"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.account_status === "MEDICAL_HOLD"
                  ? "Deadlines are paused while your account is frozen. You do not need to check in."
                  : remaining
                    ? `Due in ${remaining.replace(" remaining", "")}.`
                    : "The next check-in deadline will appear once your backend reports it."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last successful check-in: {formatDateTime(data.last_check_in_at)}
              </p>
            </div>
          </div>
          {data.account_status === "MEDICAL_HOLD" ? (
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto gap-2 text-lavender border-lavender/40 hover:bg-lavender/10"
              disabled={unfreezeMutation.isPending}
              onClick={() => unfreezeMutation.mutate()}
            >
              <PlayCircle className="h-4 w-4" aria-hidden />
              {unfreezeMutation.isPending ? "Resuming…" : "Resume check-ins"}
            </Button>
          ) : (
            <Link to="/check-in">
              <Button variant="accent" size="lg" className="w-full sm:w-auto">
                Complete check-in
              </Button>
            </Link>
          )}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<CalendarClock className="h-4.5 w-4.5" aria-hidden />} label="Next deadline" value={formatDateTime(data.next_check_in_deadline)} />
        <StatCard icon={<Timer className="h-4.5 w-4.5" aria-hidden />} label="Check-in frequency" value={formatDuration(data.check_in_frequency)} hint={remaining ?? undefined} />
        <StatCard icon={<FolderLock className="h-4.5 w-4.5" aria-hidden />} label="Documents stored" value={data.documents_stored ?? "—"} />
        <StatCard icon={<Users className="h-4.5 w-4.5" aria-hidden />} label="Recipients" value={data.recipients_count ?? "—"} />
      </div>

      {/* Secondary details */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-lavender" aria-hidden />
              Nominee status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.nominee_status ?? "Not configured yet."}</p>
            <Link to="/nominee" className="mt-3 inline-block text-sm font-semibold text-lavender hover:underline">
              Manage nominee
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-lavender" aria-hidden />
              Grace period
            </CardTitle>
            <CardDescription>Time to recover a missed check-in.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-lg font-semibold">{formatDuration(data.grace_period)}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
