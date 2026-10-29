import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudUpload, FileText, Gavel, Upload } from "lucide-react";

import { fetchNomineeCase, submitNomineeEvidence } from "@/api/nominee";
import { ApiError } from "@/api/client";
import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { NomineeCase } from "@/types";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function NomineeCasePage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const query = useQuery<NomineeCase, ApiError>({ queryKey: ["nominee-case"], queryFn: fetchNomineeCase, retry: 1 });

  const submitMutation = useMutation<NomineeCase, ApiError, { file: File; note?: string }>({
    mutationFn: ({ file: evidence, note: submissionNote }) => submitNomineeEvidence(evidence, submissionNote),
    onSuccess: () => {
      toast.success("Evidence submitted. The backend will analyse it and a human reviewer will decide the case.");
      queryClient.invalidateQueries({ queryKey: ["nominee-case"] });
      setFile(null);
      setNote("");
    },
    onError: (err) => toast.error(err.message),
  });

  function validate(selected: File): string | null {
    const okType = ALLOWED_TYPES.includes(selected.type) || ALLOWED_EXTENSIONS.some((ext) => selected.name.toLowerCase().endsWith(ext));
    if (!okType) return "Please choose a PDF, JPG, JPEG or PNG file.";
    if (selected.size > MAX_SIZE_BYTES) return "Files must be 10 MB or smaller.";
    return null;
  }

  function acceptFile(selected: File | undefined | null) {
    if (!selected) return;
    const error = validate(selected);
    setValidation(error);
    setFile(error ? null : selected);
  }

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Verification case" />
        <PageLoader />
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <PageHeader title="Verification case" />
        {query.error.status === 404 ? (
          <EmptyState
            icon={<Gavel className="h-5 w-5" aria-hidden />}
            title="No verification case is open."
            description="If a case opens for you, it will appear here with full instructions."
          />
        ) : (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">{query.error.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </Card>
        )}
      </>
    );
  }

  const caseData = query.data;
  const ocr = caseData.ocr;

  return (
    <>
      <PageHeader
        title="Verification case"
        description="Submit identity evidence for the verification process. OCR and identity matching are performed by the backend — a human reviewer makes every final decision."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Case status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="lavender">{String(caseData.status).replace(/_/g, " ")}</Badge>
          {caseData.owner_name ? <span className="text-sm text-muted-foreground">Vault owner: {caseData.owner_name}</span> : null}
          {caseData.note ? <p className="w-full text-sm text-muted-foreground">Your note: {caseData.note}</p> : null}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Submit identity evidence</CardTitle>
          <CardDescription>Upload a PDF, JPG, JPEG or PNG identity document (max 10 MB).</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-lavender bg-secondary" : "border-border bg-muted/40",
            )}
          >
            <CloudUpload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">Drag and drop your document here, or</p>
            <label className="mt-3">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) => acceptFile(e.target.files?.[0])}
                aria-label="Choose identity evidence file"
              />
              <span className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-accent focus-ring">
                Browse files
              </span>
            </label>
            {file ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-lavender" aria-hidden />
                {file.name}
              </p>
            ) : null}
          </div>
          <FieldError>{validation}</FieldError>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="evidence-note">Note for the reviewer (optional)</Label>
            <Textarea
              id="evidence-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any context that helps the reviewer verify this case."
            />
          </div>

          <Button
            variant="accent"
            className="mt-4"
            disabled={!file || submitMutation.isPending}
            onClick={() => file && submitMutation.mutate({ file, note: note.trim() || undefined })}
          >
            {submitMutation.isPending ? (
              <>
                <Spinner /> Submitting…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Submit evidence
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {caseData.evidence && caseData.evidence.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Submitted evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {caseData.evidence.map((item) => (
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
          </CardContent>
        </Card>
      ) : null}

      {ocr ? (
        <Card>
          <CardHeader>
            <CardTitle>Identity analysis</CardTitle>
            <CardDescription>
              Automated analysis from the backend. This is an assistant to the reviewer — it never
              approves a case on its own.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name match</p>
              <p className="mt-1 text-sm font-medium">{ocr.name_match === null || ocr.name_match === undefined ? "—" : ocr.name_match ? "Match" : "Discrepancy"}</p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date of birth match</p>
              <p className="mt-1 text-sm font-medium">{ocr.dob_match === null || ocr.dob_match === undefined ? "—" : ocr.dob_match ? "Match" : "Discrepancy"}</p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-1 text-sm font-medium">{ocr.confidence === null || ocr.confidence === undefined ? "—" : `${Math.round(ocr.confidence * 100)}%`}</p>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discrepancies</p>
              <p className="mt-1 text-sm font-medium">{ocr.discrepancies?.length ? ocr.discrepancies.join(", ") : "None reported"}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
