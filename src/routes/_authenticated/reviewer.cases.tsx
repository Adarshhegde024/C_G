import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Gavel } from "lucide-react";

import { fetchReviewerCases } from "@/api/reviewer";
import { ApiError } from "@/api/client";
import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/skeleton";
import type { ReviewerCase } from "@/types";

export const Route = createFileRoute("/_authenticated/reviewer/cases")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["reviewer"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Verification cases · CloudGuard" },
      { name: "description", content: "All legacy verification cases assigned to you." },
      { property: "og:title", content: "Verification cases · CloudGuard" },
      { property: "og:description", content: "All legacy verification cases assigned to you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewerCasesPage,
});

function ReviewerCasesPage() {
  const query = useQuery<ReviewerCase[], ApiError>({ queryKey: ["reviewer-cases"], queryFn: fetchReviewerCases, retry: 1 });

  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <>
        <PageHeader title="Verification cases" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      </>
    );
  }

  const cases = query.data ?? [];

  return (
    <>
      <PageHeader title="Verification cases" description="Every case assigned to you, by status." />
      {cases.length === 0 ? (
        <EmptyState
          icon={<Gavel className="h-5 w-5" aria-hidden />}
          title="No cases yet."
          description="Verification cases will appear here once nominees submit evidence."
        />
      ) : (
        <div className="space-y-3">
          {cases.map((reviewCase) => (
            <Link
              key={reviewCase.id}
              to="/reviewer/cases/$caseId"
              params={{ caseId: reviewCase.id }}
              className="block focus-ring rounded-xl"
            >
              <Card className="card-hover flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-medium">
                    {reviewCase.nominee_name ?? "Nominee"} → {reviewCase.owner_name ?? "Vault owner"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Case {reviewCase.id.slice(0, 8)}
                    {reviewCase.created_at
                      ? ` · opened ${new Date(reviewCase.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`
                      : ""}
                  </p>
                </div>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {String(reviewCase.status).replace(/_/g, " ")}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
