import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CloudUpload,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Gavel,
  Hash,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  fetchNomineeCase,
  initiateNomineeClaim,
  submitNomineeEvidence,
  deleteNomineeEvidence,
  type InitiateClaimParams,
  type SubmitEvidenceParams,
} from "@/api/nominee";
import { fetchEvidenceBlob, triggerEvidenceDownload } from "@/api/reviewer";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { EvidenceCategory, EvidenceItem, NomineeCase } from "@/types";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

interface EvidencePreviewState {
  id: string;
  fileName: string;
  fileType: string;
}

const CATEGORY_LABELS: Record<string, { label: string; badge: "lavender" | "navy" | "success" | "warning" | "secondary" }> = {
  DEATH_CERTIFICATE: { label: "Death Certificate", badge: "lavender" },
  GOVERNMENT_ID: { label: "Nominee Government ID", badge: "navy" },
  MEDICAL_RECORD: { label: "Medical Physician Record", badge: "warning" },
  COURT_ORDER: { label: "Court / Legal Order", badge: "secondary" },
  SUPPORTING_DOC: { label: "Supporting Evidence", badge: "secondary" },
};

export function NomineeCasePage() {
  const queryClient = useQueryClient();

  // Step 1: Claim details state
  const [claimReason, setClaimReason] = useState<string>("OWNER_DECEASED");
  const [incidentDate, setIncidentDate] = useState<string>("");
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [claimNote, setClaimNote] = useState<string>("");
  const [declarationConfirmed, setDeclarationConfirmed] = useState<boolean>(false);

  // Step 2: Evidence upload state
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<EvidenceCategory>("DEATH_CERTIFICATE");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [docNote, setDocNote] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Actions & Preview state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<EvidencePreviewState | null>(null);
  const [previewBlob, setPreviewBlob] = useState<{ url: string; contentType: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const query = useQuery<NomineeCase, ApiError>({
    queryKey: ["nominee-case"],
    queryFn: fetchNomineeCase,
    retry: 1,
  });

  // Populate local form fields when case loads if already filled
  const caseData = query.data;
  const isCaseLoaded = Boolean(caseData?.id);

  // Synchronize state once on load
  const [hasInitializedForm, setHasInitializedForm] = useState(false);
  if (isCaseLoaded && caseData && !hasInitializedForm) {
    if (caseData.claim_reason) setClaimReason(caseData.claim_reason);
    if (caseData.incident_date) setIncidentDate(caseData.incident_date);
    if (caseData.jurisdiction) setJurisdiction(caseData.jurisdiction);
    if (caseData.note) setClaimNote(caseData.note);
    if (caseData.declaration_confirmed) setDeclarationConfirmed(true);
    setHasInitializedForm(true);
  }

  // Mutation: Initiate / update claim grounds
  const claimMutation = useMutation<NomineeCase, ApiError, InitiateClaimParams>({
    mutationFn: initiateNomineeClaim,
    onSuccess: (updated) => {
      toast.success("Claim grounds and declaration registered successfully.");
      queryClient.setQueryData(["nominee-case"], updated);
    },
    onError: (err) => toast.error(err.message || "Failed to submit claim grounds."),
  });

  // Mutation: Upload evidence document
  const uploadMutation = useMutation<NomineeCase, ApiError, SubmitEvidenceParams>({
    mutationFn: submitNomineeEvidence,
    onSuccess: (updated) => {
      toast.success("Evidence uploaded and analyzed with OCR.");
      queryClient.setQueryData(["nominee-case"], updated);
      queryClient.invalidateQueries({ queryKey: ["nominee-case"] });
      setFile(null);
      setDocumentNumber("");
      setIssuingAuthority("");
      setDocNote("");
    },
    onError: (err) => toast.error(err.message || "Failed to upload evidence."),
  });

  // Mutation: Delete evidence document
  const deleteMutation = useMutation<NomineeCase, ApiError, string>({
    mutationFn: deleteNomineeEvidence,
    onSuccess: (updated) => {
      toast.success("Evidence document removed.");
      queryClient.setQueryData(["nominee-case"], updated);
    },
    onError: (err) => toast.error(err.message || "Could not delete evidence."),
  });

  function validate(selected: File): string | null {
    const okType =
      ALLOWED_TYPES.includes(selected.type) ||
      ALLOWED_EXTENSIONS.some((ext) => selected.name.toLowerCase().endsWith(ext));
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

  function closePreview() {
    if (previewBlob?.url) {
      window.URL.revokeObjectURL(previewBlob.url);
    }
    setPreviewItem(null);
    setPreviewBlob(null);
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

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this evidence document?")) return;
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
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
            description="If an owner's vault enters verification, your claim options will appear here."
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

  const ocr = caseData.ocr;
  const evidenceList = caseData.evidence ?? [];
  const hasSubmittedClaim = Boolean(caseData.claim_reason && caseData.declaration_confirmed);
  const statusUpper = String(caseData.status).toUpperCase();

  // Stepper calculations
  const isStep1Done = hasSubmittedClaim;
  const isStep2Done = evidenceList.length > 0;
  const isStep3Done = Boolean(ocr?.confidence && ocr.confidence > 0);
  const isApproved = statusUpper === "APPROVED";
  const isRejected = statusUpper === "REJECTED";

  return (
    <>
      <PageHeader
        title="Verification Case & Legacy Claim"
        description="Submit official proof to substantiate your nominee legacy claim. AI OCR extracts identity metadata while certified human reviewers make the final unlock determination."
      />

      {/* Visual Pipeline Stepper */}
      <Card className="mb-6 border-lavender/30 bg-gradient-to-r from-card via-secondary/30 to-card">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavender/20 text-lavender font-bold">
                {isApproved ? "✓" : "⚖"}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Case Status</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={isApproved ? "success" : isRejected ? "destructive" : "lavender"}>
                    {statusUpper.replace(/_/g, " ")}
                  </Badge>
                  {caseData.owner_name && (
                    <span className="text-sm text-muted-foreground">· Vault Owner: <strong className="text-foreground">{caseData.owner_name}</strong></span>
                  )}
                </div>
              </div>
            </div>

            {/* Stepper bubbles */}
            <div className="flex items-center gap-2 text-xs">
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border", isStep1Done ? "bg-success/15 border-success/30 text-success" : "bg-card border-border text-muted-foreground")}>
                <span className="font-semibold">1</span> Grounds
              </div>
              <span className="text-muted-foreground">→</span>
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border", isStep2Done ? "bg-success/15 border-success/30 text-success" : "bg-card border-border text-muted-foreground")}>
                <span className="font-semibold">2</span> Evidence
              </div>
              <span className="text-muted-foreground">→</span>
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border", isStep3Done ? "bg-success/15 border-success/30 text-success" : "bg-card border-border text-muted-foreground")}>
                <span className="font-semibold">3</span> OCR Review
              </div>
              <span className="text-muted-foreground">→</span>
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border", isApproved ? "bg-success/20 border-success text-success font-medium" : "bg-card border-border text-muted-foreground")}>
                <span className="font-semibold">4</span> Release
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviewer Note Alert if More Info Requested */}
      {statusUpper === "MORE_INFO_REQUESTED" && (
        <Card className="mb-6 border-warning/50 bg-warning/10">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-warning-foreground">Action Required: More Information Requested</p>
              <p className="text-xs text-warning-foreground/90 mt-1">
                The reviewer examined your case and requested additional supporting documents or clarification before a final decision can be made.
              </p>
              {caseData.note && (
                <div className="mt-2 rounded bg-card/60 p-2.5 text-xs text-foreground font-medium">
                  Reviewer note: "{caseData.note}"
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Claim Grounds & Legal Declaration */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-lavender" aria-hidden />
              <CardTitle>Step 1: Claim Grounds & Legal Declaration</CardTitle>
            </div>
            {isStep1Done && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Registered
              </Badge>
            )}
          </div>
          <CardDescription>
            Specify the legal reason for filing this claim and attest to your authority as the designated nominee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="claim-reason">Claim Reason *</Label>
              <Select
                id="claim-reason"
                value={claimReason}
                onChange={(e) => setClaimReason(e.target.value)}
                className="mt-1"
                disabled={isApproved}
              >
                <option value="OWNER_DECEASED">Vault Owner is Deceased</option>
                <option value="MEDICAL_INCAPACITY">Owner Medically Incapacitated</option>
                <option value="EMERGENCY_DISAPPEARANCE">Extended Emergency / Unreachable</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="incident-date">Incident Date</Label>
              <Input
                id="incident-date"
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="mt-1"
                disabled={isApproved}
              />
            </div>

            <div>
              <Label htmlFor="jurisdiction">Issuing Jurisdiction / Location</Label>
              <Input
                id="jurisdiction"
                type="text"
                placeholder="e.g. San Francisco, California"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="mt-1"
                disabled={isApproved}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="claim-note">Claim Context & Statement for Reviewer</Label>
            <Textarea
              id="claim-note"
              placeholder="State your relationship to the vault owner, hospital / medical details, or other context to assist the reviewer."
              value={claimNote}
              onChange={(e) => setClaimNote(e.target.value)}
              className="mt-1 min-h-[70px]"
              disabled={isApproved}
            />
          </div>

          <div className="rounded-xl border border-lavender/30 bg-secondary/30 p-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={declarationConfirmed}
                onChange={(e) => setDeclarationConfirmed(e.target.checked)}
                disabled={isApproved}
                className="mt-1 h-4 w-4 rounded border-border text-lavender focus:ring-lavender"
              />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground block mb-0.5">Nominee Legal Declaration & Digital Signature</strong>
                I solemnly attest under penalty of digital fraud that I am the authorized nominee appointed by the vault owner.
                All information and attached evidence submitted for this verification case are authentic, complete, and untampered.
              </div>
            </label>
          </div>

          {!isApproved && (
            <div className="flex justify-end">
              <Button
                variant="accent"
                disabled={!declarationConfirmed || claimMutation.isPending}
                onClick={() =>
                  claimMutation.mutate({
                    claim_reason: claimReason,
                    incident_date: incidentDate || undefined,
                    jurisdiction: jurisdiction.trim() || undefined,
                    note: claimNote.trim() || undefined,
                    declaration_confirmed: declarationConfirmed,
                  })
                }
                className="gap-2"
              >
                {claimMutation.isPending ? <Spinner /> : <BadgeCheck className="h-4 w-4" />}
                {isStep1Done ? "Update Claim Grounds" : "Save Claim Grounds & Proceed"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Categorized Evidence Upload */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-lavender" aria-hidden />
              <CardTitle>Step 2: Upload Verification Evidence</CardTitle>
            </div>
            {evidenceList.length > 0 && (
              <Badge variant="navy">
                {evidenceList.length} {evidenceList.length === 1 ? "document" : "documents"} attached
              </Badge>
            )}
          </div>
          <CardDescription>
            Submit required official documentation: Death Certificate, Nominee Photo ID, and medical/court records (PDF, JPG, PNG up to 10 MB).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="evidence-category">Document Category *</Label>
              <Select
                id="evidence-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as EvidenceCategory)}
                className="mt-1"
                disabled={isApproved}
              >
                <option value="DEATH_CERTIFICATE">Death Certificate / Burial Permit</option>
                <option value="GOVERNMENT_ID">Nominee Photo ID (Passport / License)</option>
                <option value="MEDICAL_RECORD">Hospital / Physician Attestation</option>
                <option value="COURT_ORDER">Court Order / Power of Attorney</option>
                <option value="SUPPORTING_DOC">Other Supporting Document</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="doc-number">Document / Registration #</Label>
              <Input
                id="doc-number"
                type="text"
                placeholder="e.g. DC-2026-0918 or Passport #"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="mt-1"
                disabled={isApproved}
              />
            </div>

            <div>
              <Label htmlFor="doc-authority">Issuing Authority / Registrar</Label>
              <Input
                id="doc-authority"
                type="text"
                placeholder="e.g. Dept of Public Health"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                className="mt-1"
                disabled={isApproved}
              />
            </div>
          </div>

          {/* Drag and Drop Zone */}
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
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragging ? "border-lavender bg-secondary" : "border-border bg-muted/30",
            )}
          >
            <CloudUpload className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">Drag and drop your file here, or browse</p>
            <label className="mt-2.5">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) => acceptFile(e.target.files?.[0])}
                disabled={isApproved}
                aria-label="Choose identity evidence file"
              />
              <span className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-accent focus-ring">
                Choose Document
              </span>
            </label>
            {file ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 border border-lavender/40 text-xs font-medium text-foreground">
                <FileText className="h-4 w-4 text-lavender" aria-hidden />
                <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : null}
          </div>
          <FieldError>{validation}</FieldError>

          <div>
            <Label htmlFor="doc-note">Document Annotation (Optional)</Label>
            <Input
              id="doc-note"
              type="text"
              placeholder="e.g. Official certified seal visible on page 1"
              value={docNote}
              onChange={(e) => setDocNote(e.target.value)}
              className="mt-1"
              disabled={isApproved}
            />
          </div>

          {!isApproved && (
            <div className="flex justify-end">
              <Button
                variant="accent"
                disabled={!file || uploadMutation.isPending}
                onClick={() =>
                  file &&
                  uploadMutation.mutate({
                    file,
                    category,
                    document_number: documentNumber.trim() || undefined,
                    issuing_authority: issuingAuthority.trim() || undefined,
                    note: docNote.trim() || undefined,
                  })
                }
                className="gap-2"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Spinner /> Uploading & Analyzing OCR…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" aria-hidden />
                    Upload & Run OCR Analysis
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submitted Evidence List */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-lavender" aria-hidden />
              <CardTitle>Submitted Evidence Documents</CardTitle>
            </div>
            <Badge variant="outline">{evidenceList.length} Files</Badge>
          </div>
          <CardDescription>
            All documents attached to this case. You can inspect inline previews, download files, or remove draft entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evidenceList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No evidence documents uploaded yet. Upload a Death Certificate or Government ID above.
            </div>
          ) : (
            <ul className="space-y-3">
              {evidenceList.map((item) => {
                const catMeta = CATEGORY_LABELS[item.category ?? "DEATH_CERTIFICATE"] || {
                  label: item.category || "Evidence",
                  badge: "secondary" as const,
                };
                return (
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
                          <Badge variant={catMeta.badge}>{catMeta.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>Uploaded {new Date(item.uploaded_at).toLocaleDateString()}</span>
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
                        className="gap-1.5 h-8 px-2.5 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloadingId === item.id}
                        onClick={() => handleDownload(item.id, item.file_name)}
                        className="gap-1.5 h-8 px-2.5 text-xs"
                      >
                        <Download className="h-3.5 w-3.5 text-lavender" aria-hidden />
                        {downloadingId === item.id ? "…" : "Download"}
                      </Button>
                      {!isApproved && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === item.id || deleteMutation.isPending}
                          onClick={() => handleDelete(item.id)}
                          className="h-8 px-2 text-destructive hover:bg-destructive/10 text-xs"
                          title="Remove document"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Automated OCR Analysis Breakdown */}
      {ocr ? (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-lavender" aria-hidden />
              <CardTitle>Automated Identity & Document OCR Analysis</CardTitle>
            </div>
            <CardDescription>
              Real-time AI verification results from your uploaded documents. A human reviewer examines this data alongside the original files.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border px-4 py-3 bg-secondary/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Owner Name Match</p>
              <div className="mt-1 flex items-center gap-1.5 font-medium text-sm">
                {ocr.name_match === true ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-success">Verified Match</span>
                  </>
                ) : ocr.name_match === false ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">Discrepancy</span>
                  </>
                ) : (
                  <span>Pending Analysis</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border px-4 py-3 bg-secondary/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date of Birth</p>
              <div className="mt-1 flex items-center gap-1.5 font-medium text-sm">
                {ocr.dob_match === true ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-success">Verified Match</span>
                  </>
                ) : ocr.dob_match === false ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">Discrepancy</span>
                  </>
                ) : (
                  <span>Pending Analysis</span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border px-4 py-3 bg-secondary/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">OCR Confidence</p>
              <p className="mt-1 text-sm font-semibold">
                {ocr.confidence != null ? `${Math.round(ocr.confidence * 100)}% Match` : "—"}
              </p>
            </div>

            <div className="rounded-lg border border-border px-4 py-3 bg-secondary/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discrepancies</p>
              <p className="mt-1 text-sm font-medium">
                {ocr.discrepancies?.length ? ocr.discrepancies.join(", ") : "None Detected"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Case Audit History */}
      {caseData.audit_history && caseData.audit_history.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-muted-foreground" aria-hidden />
              <CardTitle className="text-base">Verification Audit Trail</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs">
              {caseData.audit_history.map((entry, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="font-semibold text-foreground">{entry.event.replace(/_/g, " ")}</span>
                    {entry.description && <p className="text-muted-foreground mt-0.5">{entry.description}</p>}
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Modal: Inline Evidence Document Preview */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative flex flex-col max-h-[90vh] w-full max-w-4xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-5 w-5 text-lavender shrink-0" aria-hidden />
                <h3 className="truncate font-semibold text-foreground text-sm sm:text-base">
                  {previewItem.fileName}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(previewItem.id, previewItem.fileName)}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download
                </Button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  aria-label="Close preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[350px] max-h-[75vh] bg-black/20">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner />
                  <p className="text-xs text-muted-foreground">Decrypting and loading evidence file…</p>
                </div>
              ) : previewBlob ? (
                previewBlob.contentType.includes("pdf") ? (
                  <iframe
                    src={previewBlob.url}
                    title={previewItem.fileName}
                    className="h-[70vh] w-full rounded-lg border border-border bg-white"
                  />
                ) : (
                  <img
                    src={previewBlob.url}
                    alt={previewItem.fileName}
                    className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md"
                  />
                )
              ) : (
                <p className="text-xs text-destructive">Could not render evidence preview.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
