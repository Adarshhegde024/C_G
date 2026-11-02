import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Gavel,
  Loader2,
  MessageSquarePlus,
  Scale,
  XCircle,
} from "lucide-react";

import {
  approveCase,
  fetchReviewerCase,
  rejectCase,
  requestMoreInfo,
  triggerEvidenceDownload,
  fetchEvidenceBlob,
} from "@/api/reviewer";
import { ApiError } from "@/api/client";
import { roleGuard } from "@/auth/roles";
import { CaseStatusBadge } from "@/components/reviewer/CaseStatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

interface EvidencePreviewState {
  id: string;
  fileName: string;
  fileType: string;
}

function ReviewerCaseDetailPage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [previewItem, setPreviewItem] = useState<EvidencePreviewState | null>(null);
  const [previewBlob, setPreviewBlob] = useState<{ url: string; contentType: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const query = useQuery<ReviewerCase, ApiError>({
    queryKey: ["reviewer-case", caseId],
    queryFn: () => fetchReviewerCase(caseId),
    retry: 1,
  });

  async function openPreview(item: { id: string; file_name: string; file_type: string }) {
    setPreviewItem({ id: item.id, fileName: item.file_name, fileType: item.file_type });
    setLoadingPreview(true);
    setPreviewBlob(null);
    try {
      const blobData = await fetchEvidenceBlob(item.id);
      setPreviewBlob(blobData);
    } catch (err: any) {
      toast.error(err.message || "Failed to load evidence preview");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleDownload(id: string, fileName: string) {
    setDownloadingId(id);
    try {
      await triggerEvidenceDownload(id, fileName);
      toast.success(`Downloaded ${fileName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to download evidence.");
    } finally {
      setDownloadingId(null);
    }
  }

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
            <CardTitle>Parties & Claim Grounds</CardTitle>
            <CardDescription>Identity and claim grounds provided by the nominee.</CardDescription>
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

            {reviewCase.claim_reason ? (
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Claim Grounds</p>
                <p className="font-medium text-foreground">{reviewCase.claim_reason.replace(/_/g, " ")}</p>
                {reviewCase.incident_date && <p className="text-xs text-muted-foreground">Incident Date: {reviewCase.incident_date}</p>}
                {reviewCase.jurisdiction && <p className="text-xs text-muted-foreground">Jurisdiction: {reviewCase.jurisdiction}</p>}
                {reviewCase.declaration_confirmed && (
                  <div className="flex items-center gap-1 text-xs text-success font-medium pt-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Nominee Declaration Signed
                  </div>
                )}
              </div>
            ) : null}

            {reviewCase.note ? (
              <div className="rounded-lg bg-secondary px-3 py-2 text-secondary-foreground text-xs">
                <strong>Nominee statement:</strong> {reviewCase.note}
              </div>
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
          <CardDescription>
            Official documents submitted by the nominee for legacy verification (e.g. Death Certificate, Nominee ID, Medical Records).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviewCase.evidence?.length ? (
            <ul className="space-y-3">
              {reviewCase.evidence.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <FileText className="h-5 w-5 text-lavender" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="truncate text-sm font-medium">{item.file_name}</p>
                        {item.category && (
                          <Badge variant="lavender" className="text-[10px] py-0 px-2">
                            {item.category.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>Uploaded {new Date(item.uploaded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                        {item.size_bytes ? <span>· {(item.size_bytes / 1024).toFixed(1)} KB</span> : null}
                        {item.document_number && <span>· Doc #: {item.document_number}</span>}
                        {item.issuing_authority && <span>· Authority: {item.issuing_authority}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreview(item)}
                      className="gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingId === item.id}
                      onClick={() => handleDownload(item.id, item.file_name)}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5 text-lavender" aria-hidden />
                      {downloadingId === item.id ? "Downloading…" : "Download"}
                    </Button>
                  </div>
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

      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) {
            if (previewBlob?.url) window.URL.revokeObjectURL(previewBlob.url);
            setPreviewItem(null);
            setPreviewBlob(null);
          }
        }}
      >
        <DialogContent
          className="max-w-3xl"
          title={previewItem?.fileName ?? "Evidence Document Preview"}
          description="Reviewing official verification evidence document."
        >
          {loadingPreview ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-lavender" />
              <p className="text-sm text-muted-foreground">Loading evidence document…</p>
            </div>
          ) : previewBlob ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                {previewBlob.contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(previewItem?.fileName || "") ? (
                  <div className="flex max-h-[65vh] items-center justify-center p-4">
                    <img
                      src={previewBlob.url}
                      alt={previewItem?.fileName}
                      className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-sm"
                    />
                  </div>
                ) : previewBlob.contentType === "application/pdf" || (previewItem?.fileName || "").toLowerCase().endsWith(".pdf") ? (
                  <iframe
                    src={previewBlob.url}
                    title={previewItem?.fileName}
                    className="h-[65vh] w-full rounded-lg border-0"
                  />
                ) : (
                  <div className="max-h-[60vh] overflow-auto p-6 font-mono text-xs whitespace-pre-wrap">
                    <iframe
                      src={previewBlob.url}
                      title={previewItem?.fileName}
                      className="h-[50vh] w-full rounded-lg border-0"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs text-muted-foreground truncate max-w-xs sm:max-w-md">
                  {previewItem?.fileName}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (previewBlob.url) window.open(previewBlob.url, "_blank");
                    }}
                  >
                    Open in new tab
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      if (previewItem) handleDownload(previewItem.id, previewItem.fileName);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Download original
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Failed to load preview for this file. You can still download the file directly.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
