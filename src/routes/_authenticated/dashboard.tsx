import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CalendarClock,
  FolderLock,
  PlayCircle,
  ShieldCheck,
  Snowflake,
  Timer,
  UserCheck,
  Users,
  Video,
} from "lucide-react";

import { fetchDashboard } from "@/api/dashboard";
import { toggleMedicalHold } from "@/api/profile";
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

  const unfreezeMutation = useMutation({
    mutationFn: () => toggleMedicalHold({ active: false }),
    onSuccess: (res) => {
      toast.success(res?.message || "Medical hold lifted. Your vault access and check-in schedule have resumed.");
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Failed to lift medical hold.");
    },
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

  // When under medical hold: owner does not have access to any vault facilities
  if (data.account_status === "MEDICAL_HOLD") {
    return (
      <>
        <PageHeader
          title="Account on Medical Hold"
          description="Your vault operations are temporarily suspended under an emergency medical hold."
        />

        <div className="mt-6 max-w-3xl mx-auto space-y-6 animate-in fade-in-50 duration-300">
          <Card className="border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-background to-background p-6 sm:p-8 shadow-xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 mb-4 ring-8 ring-amber-500/10">
              <Snowflake className="h-8 w-8 animate-pulse text-amber-400" aria-hidden />
            </div>

            <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300 mb-3">
              Medical Hold Active · Vault Frozen
            </span>

            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Vault Access Temporarily Suspended
            </h2>

            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Your designated nominee has placed your vault under an emergency medical hold. In accordance with zero-trust security protocols, all vault documents, management features, check-in schedules, and recipient releases are completely frozen to protect your assets while you are incapacitated or recovering.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3 text-left rounded-xl border border-border bg-secondary/40 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activated On</p>
                <p className="text-xs font-medium text-foreground mt-0.5">
                  {formatDateTime(data.medical_hold?.start_date)}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Scheduled Expiration</p>
                <p className="text-xs font-medium text-foreground mt-0.5">
                  {data.medical_hold?.end_date ? formatDateTime(data.medical_hold.end_date) : "Indefinite (until lifted)"}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nominee Reason / Note</p>
                <p className="text-xs font-medium text-amber-300 mt-0.5 truncate" title={data.medical_hold?.note || "Emergency freeze"}>
                  {data.medical_hold?.note ? `"${data.medical_hold.note}"` : "Emergency Medical Hold"}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border/80 bg-muted/20 p-4 text-left">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                Active Protective Measures
              </h4>
              <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px]">✓</span>
                  Check-in countdowns & timers paused
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px]">✓</span>
                  Document access & modifications locked
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px]">✓</span>
                  Automatic document release triggers suspended
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-[10px]">✓</span>
                  Grace period countdown frozen
                </li>
              </ul>
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <p className="text-xs font-medium text-foreground">
                Are you recovered and back in control of your account?
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                If you have recovered and wish to immediately regain full access to your vault and resume your check-in schedule, you can lift the hold below.
              </p>

              <div className="mt-4 flex justify-center">
                <Button
                  variant="accent"
                  size="lg"
                  className="gap-2 shadow-lg"
                  disabled={unfreezeMutation.isPending}
                  onClick={() => unfreezeMutation.mutate()}
                >
                  <PlayCircle className="h-4 w-4" />
                  {unfreezeMutation.isPending ? "Restoring vault access…" : "I am Recovered — Lift Medical Hold"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const remaining = remainingText(data.next_check_in_deadline);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? "there"}`}
        description="Here's the current state of your vault."
      />

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
              <Video className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-base font-semibold">Your next check-in</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {remaining
                  ? `Due in ${remaining.replace(" remaining", "")}.`
                  : "The next check-in deadline will appear once your backend reports it."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last successful check-in: {formatDateTime(data.last_check_in_at)}
              </p>
            </div>
          </div>
          <Link to="/check-in">
            <Button variant="accent" size="lg" className="w-full sm:w-auto">
              Complete check-in
            </Button>
          </Link>
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
