import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import { fetchAuditLog } from "@/api/checkins";
import { ApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/skeleton";
import type { AuditEvent } from "@/types";

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
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

/** Shared security-activity view used by the recipient and nominee areas. */
export function ActivityHistoryView({ emptyTitle }: { emptyTitle: string }) {
  const query = useQuery<AuditEvent[], ApiError>({ queryKey: ["audit"], queryFn: fetchAuditLog, retry: 1 });

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Activity isn't available from the backend yet. It will appear here once the API provides it.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }
  if ((query.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" aria-hidden />}
        title={emptyTitle}
        description="Relevant account events will appear here."
      />
    );
  }
  return <AuditTimeline events={query.data ?? []} />;
}
