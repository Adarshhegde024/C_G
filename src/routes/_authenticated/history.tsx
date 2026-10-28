import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, History as HistoryIcon, ScrollText, ShieldAlert, XCircle } from "lucide-react";

import { fetchAuditLog, fetchCheckInHistory } from "@/api/checkins";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AuditEvent, CheckInRecord } from "@/types";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History · CloudGuard" },
      { name: "description", content: "Review your check-in history and account security activity." },
      { property: "og:title", content: "History · CloudGuard" },
      { property: "og:description", content: "Review your check-in history and account security activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return "masked";
}

function CheckInTimeline({ records }: { records: CheckInRecord[] }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {records.map((record) => {
        const success = String(record.result).toUpperCase() === "SUCCESS";
        return (
          <li key={record.id} className="relative">
            <span
              className={cn(
                "absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card",
              )}
              aria-hidden
            >
              {success ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" aria-hidden />
              )}
            </span>
            <Card className="card-hover p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {record.date} · {record.time}
                </p>
                <Badge variant={success ? "success" : "destructive"}>{success ? "Successful" : "Failed"}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Face match: {record.face_match === null || record.face_match === undefined ? "—" : record.face_match ? "Yes" : "No"}</span>
                <span>Liveness: {record.liveness === null || record.liveness === undefined ? "—" : record.liveness ? "Passed" : "Failed"}</span>
                <span>Voice: {record.voice_verified === null || record.voice_verified === undefined ? "—" : record.voice_verified ? "Verified" : "Failed"}</span>
                {record.ip_address ? <span>IP: {maskIp(record.ip_address)}</span> : null}
                {record.device ? <span>Device: {record.device}</span> : null}
              </div>
              {record.reason ? (
                <p className="mt-2 rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">{record.reason}</p>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function AuditTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="relative space-y-3 border-l border-border pl-6">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[27px] top-2 h-2 w-2 rounded-full bg-lavender" aria-hidden />
          <Card className="card-hover p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{event.event.replace(/_/g, " ")}</p>
              <span className="text-xs text-muted-foreground">
                {new Date(event.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            {event.description ? <p className="mt-1 text-xs text-muted-foreground">{event.description}</p> : null}
            {event.result ? <Badge variant="outline" className="mt-2">{event.result}</Badge> : null}
          </Card>
        </li>
      ))}
    </ol>
  );
}

function HistoryPage() {
  const [tab, setTab] = useState<"checkins" | "activity">("checkins");

  const checkInsQuery = useQuery<CheckInRecord[], ApiError>({ queryKey: ["checkins"], queryFn: fetchCheckInHistory });
  const auditQuery = useQuery<AuditEvent[], ApiError>({
    queryKey: ["audit"],
    queryFn: fetchAuditLog,
    enabled: tab === "activity",
    retry: 1,
  });

  const checkIns = useMemo(() => checkInsQuery.data ?? [], [checkInsQuery.data]);

  return (
    <>
      <PageHeader title="History" description="A record of your verification activity and account events." />

      <div className="mb-6 flex gap-2" role="tablist" aria-label="History sections">
        <Button
          role="tab"
          aria-selected={tab === "checkins"}
          variant={tab === "checkins" ? "secondary" : "ghost"}
          onClick={() => setTab("checkins")}
        >
          <HistoryIcon className="h-4 w-4" aria-hidden />
          Check-ins
        </Button>
        <Button
          role="tab"
          aria-selected={tab === "activity"}
          variant={tab === "activity" ? "secondary" : "ghost"}
          onClick={() => setTab("activity")}
        >
          <ScrollText className="h-4 w-4" aria-hidden />
          Security activity
        </Button>
      </div>

      {tab === "checkins" ? (
        checkInsQuery.isPending ? (
          <PageLoader />
        ) : checkInsQuery.isError ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">{checkInsQuery.error.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => void checkInsQuery.refetch()}>
              Try again
            </Button>
          </Card>
        ) : checkIns.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon className="h-5 w-5" aria-hidden />}
            title="No check-in activity yet."
            description="Completed check-ins will appear here with their verification results."
            action={
              <Button variant="accent" onClick={() => window.location.assign("/check-in")}>
                Complete check-in
              </Button>
            }
          />
        ) : (
          <CheckInTimeline records={checkIns} />
        )
      ) : auditQuery.isPending ? (
        <PageLoader />
      ) : auditQuery.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Audit activity isn't available from the backend yet. It will appear here once the API provides it.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void auditQuery.refetch()}>
            Retry
          </Button>
        </Card>
      ) : (auditQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" aria-hidden />}
          title="No security activity yet."
          description="Sign-ins, uploads, invitations and decisions will appear here."
        />
      ) : (
        <AuditTimeline events={auditQuery.data ?? []} />
      )}
    </>
  );
}
