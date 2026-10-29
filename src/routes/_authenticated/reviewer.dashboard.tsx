import { createFileRoute, redirect } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Briefcase, CheckCircle2, CircleHelp, Gavel, Inbox, XCircle } from "lucide-react";

import { fetchReviewerCases } from "@/api/reviewer";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { roleGuard } from "@/auth/roles";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { ReviewerCase } from "@/types";

export const Route = createFileRoute("/_authenticated/reviewer/dashboard")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["reviewer"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Reviewer dashboard · CloudGuard" },
      { name: "description", content: "Case overview for CloudGuard legacy reviewers." },
      { property: "og:title", content: "Reviewer dashboard · CloudGuard" },
      { property: "og:description", content: "Case overview for CloudGuard legacy reviewers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewerDashboardPage,
});

export const CASE_STATUS_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  PENDING: { label: "Pending", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  MORE_INFO_REQUESTED: { label: "More information requested", variant: "secondary" },
};

export function CaseStatusBadge({ status }: { status: string }) {
  const meta = CASE_STATUS_BADGE[String(status).toUpperCase()] ?? { label: status.replace(/_/g, " "), variant: "secondary" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function ReviewerDashboardPage() {
  const { user } = useAuth();
  const query = useQuery<ReviewerCase[], ApiError>({ queryKey: ["reviewer-cases"], queryFn: fetchReviewerCases, retry: 1 });

  const cases = query.data ?? [];
  const counts = {
    pending: cases.filter((c) => String(c.status).toUpperCase() === "PENDING").length,
    approved: cases.filter((c) => String(c.status).toUpperCase() === "APPROVED").length,
    rejected: cases.filter((c) => String(c.status).toUpperCase() === "REJECTED").length,
    moreInfo: cases.filter((c) => String(c.status).toUpperCase() === "MORE_INFO_REQUESTED").length,
  };

  return (
    <>
      <PageHeader
        title={`Reviewer console, ${user?.name.split(" ")[0] ?? "there"}`}
        description="You are the human decision-maker. Automated analysis only assists — every decision is yours."
      />

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Inbox className="h-4.5 w-4.5" aria-hidden />} label="Pending cases" value={counts.pending} />
            <StatCard icon={<CheckCircle2 className="h-4.5 w-4.5" aria-hidden />} label="Approved" value={counts.approved} />
            <StatCard icon={<XCircle className="h-4.5 w-4.5" aria-hidden />} label="Rejected" value={counts.rejected} />
            <StatCard icon={<CircleHelp className="h-4.5 w-4.5" aria-hidden />} label="More information" value={counts.moreInfo} />
          </div>

          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Cases needing attention</h2>
          {cases.filter((c) => String(c.status).toUpperCase() === "PENDING").length === 0 ? (
            <EmptyState
              icon={<Gavel className="h-5 w-5" aria-hidden />}
              title="No pending cases."
              description="New verification cases will appear here for your review."
            />
          ) : (
            <div className="space-y-3">
              {cases
                .filter((c) => String(c.status).toUpperCase() === "PENDING")
                .map((reviewCase) => (
                  <Card key={reviewCase.id} className="card-hover flex flex-wrap items-center justify-between gap-3 p-5">
                    <div>
                      <p className="font-medium">Case {reviewCase.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {reviewCase.nominee_name ?? "Nominee"} · {reviewCase.owner_name ?? "Vault owner"} ·{" "}
                        {reviewCase.created_at ? new Date(reviewCase.created_at).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <CaseStatusBadge status={reviewCase.status} />
                      <Link to="/reviewer/cases/$caseId" params={{ caseId: reviewCase.id }}>
                        <Button size="sm" variant="secondary">
                          <Briefcase className="h-3.5 w-3.5" aria-hidden />
                          Review
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
