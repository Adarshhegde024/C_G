import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText, Gavel, MessageSquarePlus, Scale, XCircle } from "lucide-react";

import { approveCase, fetchReviewerCase, rejectCase, requestMoreInfo } from "@/api/reviewer";
import { ApiError } from "@/api/client";
import { roleGuard } from "@/auth/roles";
import { CaseStatusBadge } from "@/components/reviewer/CaseStatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";
import { PageLoader, Skeleton } from "@/components/ui/skeleton";
import type { ReviewerCase } from "@/types";

export const Route = createFileRoute("/_authenticated/reviewer/cases/$caseId")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["reviewer"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Case review · CloudGuard" },
      { name: "description", content: "Review a CloudGuard legacy verification case." },
      { property: "og:title", content: "Case review · CloudGuard" },
      { property: "og:description", content: "Review a CloudGuard legacy verification case." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewerCaseDetailPage,
});

function ReviewerCaseDetailPage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const query = useQuery<ReviewerCase, ApiError>({
    queryKey: ["reviewer-case", caseId],
    queryFn: () => fetchReviewerCase(caseId),
    retry: 1,
  });

  function makeMutation(action: "approve" | "reject" | "request-info") {
    return useMutation<ReviewerCase, ApiError, void>({
      mutationFn: () =>
        action === "approve"
          ? approveCase(caseId, note.trim() || undefined)
          : action === "reject"
            ? rejectCase(caseId, note.trim() || undefined)
            : requestMoreInfo(caseId, note.trim() || undefined),
      onSuccess: (updated) => {
        queryClient.setQueryData(["reviewer-case", caseId], updated);
        queryClient.invalidateQueries({ queryKey: ["reviewer-cases"] });
        toast.success(
          action === "approve" ? "Case approved." : action === "reject" ? "Case rejected." : "More information requested.",
        );
      },
      onError: (err) => toast.error(err.message),
    });
  }

  // Hooks must run unconditionally — create all three up front.
  const approveMutation = makeMutation("approve");
  const rejectMutation = makeMutation("reject");
  const moreInfoMutation = makeMutation("request-info");

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Case review" />
        <Skeleton className="h-72 w-full" />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <PageHeader title="Case review" />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      </>
    );
  }

  const reviewCase = query.data;
  const ocr = reviewCase.ocr;
  const decisionMade = ["APPROVED", "REJECTED"].includes(String(reviewCase.status).toUpperCase());

  return (
    <>
      <PageHeader
        title={`Case ${caseId.slice(0, 8)}`}
        description="You are the human reviewer. Automated analysis is an assistant — never the decision."
        actions={<CaseStatusBadge status={reviewCase.status} />}
      />

      <Link to="/reviewer/cases" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-lavender hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All cases
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Parties</CardTitle>
            <CardDescription>Identity information as provided to the backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vault owner</p>
              <p className="mt-0.5 font-medium">{reviewCase.owner_name ?? "—"}</p>
              <p className="text-muted-foreground">{reviewCase.owner_email ?? "—"}</p>
              {reviewCase.owner_dob ? <p className="text-muted-foreground">DOB: {reviewCase.owner_dob}</p> : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nominee</p>
              <p className="mt-0.5 font-medium">{reviewCase.nominee_name ?? "—"}</p>
              <p className="text-muted-foreground">{reviewCase.nominee_email ?? "—"}</p>
            </div>
            {reviewCase.note ? (
              <div className="rounded-lg bg-secondary px-3 py-2 text-secondary-foreground">Nominee note: {reviewCase.note}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automated identity analysis</CardTitle>
            <CardDescription>From backend OCR and identity matching. Assistant output only.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name comparison</p>
              <p className="mt-1 text-sm font-medium">{ocr?.name_match === null || ocr?.name_match === undefined ? "—" : ocr.name_match ? "Match" : "Discrepancy"}</p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DOB comparison</p>
              <p className="mt-1 text-sm font-medium">{ocr?.dob_match === null || ocr?.dob_match === undefined ? "—" : ocr.dob_match ? "Match" : "Discrepancy"}</p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-1 text-sm font-medium">{ocr?.confidence === null || ocr?.confidence === undefined ? "—" : `${Math.round(ocr.confidence * 100)}%`}</p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discrepancies</p>
              <p className="mt-1 text-sm font-medium">{ocr?.discrepancies?.length ? ocr.discrepancies.join(", ") : "None reported"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4.5 w-4.5 text-lavender" aria-hidden />
            Submitted evidence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reviewCase.evidence?.length ? (
            <ul className="space-y-2">
              {reviewCase.evidence.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-lavender" aria-hidden />
                    {item.file_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.uploaded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No evidence has been submitted yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4.5 w-4.5 text-lavender" aria-hidden />
            Your decision
          </CardTitle>
          <CardDescription>
            A high OCR confidence never means approval on its own — verify the details yourself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="decision-note">Decision note</Label>
            <Textarea
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the reasoning behind your decision. This is recorded in the audit history."
            />
          </div>
          {decisionMade ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gavel className="h-4 w-4" aria-hidden />
              A final decision has already been recorded for this case.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="accent"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {approveMutation.isPending ? "Approving…" : "Approve"}
              </Button>
              <Button variant="danger" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
                <XCircle className="h-4 w-4" aria-hidden />
                {rejectMutation.isPending ? "Rejecting…" : "Reject"}
              </Button>
              <Button variant="outline" disabled={moreInfoMutation.isPending} onClick={() => moreInfoMutation.mutate()}>
                <MessageSquarePlus className="h-4 w-4" aria-hidden />
                {moreInfoMutation.isPending ? "Requesting…" : "Request more information"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {reviewCase.audit_history?.length ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Audit history</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {reviewCase.audit_history.map((entry, index) => (
                <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2.5">
                  <span className="text-sm font-medium">{entry.event.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
