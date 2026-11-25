import { useState, useRef } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  FolderLock,
  HeartPulse,
  Info,
  Lock,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  UploadCloud,
  UserCheck,
} from "lucide-react";

import {
  fetchNomineeCase,
  fetchNomineeMedicalHold,
  toggleNomineeMedicalHold,
  fetchNomineeReleasedDocuments,
  submitNomineeEvidence,
  fastTrackApproveNomineeCase,
} from "@/api/nominee";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, FieldError } from "@/components/ui/input";
import { PageLoader, Skeleton, Spinner } from "@/components/ui/skeleton";
import type { NomineeCase, NomineeMedicalHold, ReleasedDocItem } from "@/types";

export const Route = createFileRoute("/_authenticated/nominee/dashboard")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["nominee"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Nominee Dashboard · CloudGuard" },
      { name: "description", content: "Manage emergency medical holds, verify life event proofs, and access released legacy documents." },
      { property: "og:title", content: "Nominee Dashboard · CloudGuard" },
      { property: "og:description", content: "Manage emergency medical holds, verify life event proofs, and access released legacy documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NomineeDashboardPage,
});

const CASE_STATUS_COPY: Record<string, string> = {
  ELIGIBLE: "Case is eligible. You can upload proof of death or supporting legal documents.",
  CLAIM_FILED: "Claim filed. Awaiting proof of death documents.",
  EVIDENCE_SUBMITTED: "Proof of death submitted. Automatic OCR verification in progress.",
  AWAITING_REVIEW: "A human reviewer is verifying the death certificate and details.",
  MORE_INFO_REQUESTED: "The reviewer requested additional information or higher resolution documents.",
  APPROVED: "Verification approved! Vault documents have been unlocked and released below.",
  REJECTED: "Verification was not approved. Please contact support or resubmit valid documents.",
};

export function NomineeDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states for Medical Hold
  const [holdNote, setHoldNote] = useState("");
  const [holdDuration, setHoldDuration] = useState("14");
  const [customEndDate, setCustomEndDate] = useState("");

  // Form states for Proof of Death Evidence
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceCategory, setEvidenceCategory] = useState("HOSPITAL_DEATH_SUMMARY");
  const [docNumber, setDocNumber] = useState("");
  const [issuingAuth, setIssuingAuth] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Queries
  const caseQuery = useQuery<NomineeCase | null, ApiError>({
    queryKey: ["nominee-case"],
    queryFn: fetchNomineeCase,
    retry: 1,
  });

  const holdQuery = useQuery<NomineeMedicalHold, ApiError>({
    queryKey: ["nominee-medical-hold"],
    queryFn: fetchNomineeMedicalHold,
  });

  const docsQuery = useQuery<ReleasedDocItem[], ApiError>({
    queryKey: ["nominee-released-docs"],
    queryFn: fetchNomineeReleasedDocuments,
  });

  const caseData = caseQuery.data;
  const holdData = holdQuery.data;
  const releasedDocs = docsQuery.data ?? [];
  const isApproved = caseData?.status === "APPROVED" || releasedDocs.length > 0;

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["nominee-case"] });
    queryClient.invalidateQueries({ queryKey: ["nominee-medical-hold"] });
    queryClient.invalidateQueries({ queryKey: ["nominee-released-docs"] });
  }

  // Mutations
  const holdMutation = useMutation({
    mutationFn: toggleNomineeMedicalHold,
    onSuccess: (data) => {
      toast.success(data.message);
      invalidateAll();
      if (!data.active) setHoldNote("");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const uploadEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!evidenceFile) throw new Error("Please select a document file to upload.");
      return submitNomineeEvidence({
        file: evidenceFile,
        category: evidenceCategory,
        document_number: docNumber.trim() || undefined,
        issuing_authority: issuingAuth.trim() || undefined,
        note: evidenceNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Proof of death uploaded and analyzed with OCR.");
      invalidateAll();
      setEvidenceFile(null);
      setDocNumber("");
      setIssuingAuth("");
      setEvidenceNote("");
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setUploadError(msg);
      toast.error(msg);
    },
  });

  const fastTrackMutation = useMutation({
    mutationFn: fastTrackApproveNomineeCase,
    onSuccess: () => {
      toast.success("Case verified and documents released to designated recipient(s)!");
      invalidateAll();
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name.split(" ")[0] ?? "Nominee"}`}
        description="Your emergency dashboard for medical freeze management and legacy proof verification."
      />

      {/* Information Banner */}
      <Card className="mb-6 border-lavender/40 bg-secondary/40 shadow-sm">
        <CardContent className="flex items-start gap-3 pt-1">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-lavender" aria-hidden />
          <p className="text-sm text-secondary-foreground leading-relaxed">
            As an authorized nominee for <span className="font-semibold text-foreground">{caseData?.owner_name || "the vault owner"}</span>,
            you hold critical responsibilities: you can freeze countdowns during medical emergencies
            to safeguard the vault, or upload certified proof of death to unlock legacy documents when appropriate.
          </p>
        </CardContent>
      </Card>

      {/* Section 1: Medical Hold & Vault Freeze Controls */}
      <Card className={`mb-6 shadow-md transition-all ${holdData?.active ? "border-lavender bg-lavender/5" : "border-border"}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-lavender" aria-hidden />
              Emergency Medical Hold & Vault Freeze
            </CardTitle>
            {holdData?.active ? (
              <Badge variant="lavender" className="animate-pulse">
                VAULT FROZEN
              </Badge>
            ) : (
              <Badge variant="outline">VAULT ACTIVE</Badge>
            )}
          </div>
          <CardDescription>
            If the vault owner is hospitalized, undergoing major surgery, or incapacitated, activate a medical hold.
            This freezes all check-in countdowns, deadlines, and prevents document releases until lifted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {holdQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : holdData?.active ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-lavender/40 bg-secondary/80 p-4">
                <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <Snowflake className="h-4 w-4 text-lavender animate-pulse" aria-hidden />
                  {caseData?.owner_name || "Vault Owner"}'s vault is currently FROZEN
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  All check-in countdowns and notifications are safely suspended. Documents remain completely locked.
                </p>
                {holdData.start_date && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Active since: {new Date(holdData.start_date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
                {holdData.end_date && (
                  <p className="text-xs text-muted-foreground">
                    Scheduled until: {new Date(holdData.end_date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
                {holdData.note && (
                  <p className="mt-1.5 text-xs italic text-foreground font-medium">
                    "{holdData.note}"
                  </p>
                )}
              </div>

              <Button
                variant="accent"
                className="gap-2"
                disabled={holdMutation.isPending}
                onClick={() => holdMutation.mutate({ active: false })}
              >
                <PlayCircle className="h-4 w-4" />
                {holdMutation.isPending ? "Lifting Hold…" : "Resume Vault & Check-ins (Lift Medical Hold)"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 max-w-xl">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hold-duration">Freeze Duration</Label>
                  <Select
                    id="hold-duration"
                    value={holdDuration}
                    onChange={(e) => setHoldDuration(e.target.value)}
                  >
                    <option value="7">7 Days (Minor surgery / observation)</option>
                    <option value="14">14 Days (Standard hospitalization)</option>
                    <option value="30">30 Days (Extended rehabilitation)</option>
                    <option value="60">60 Days (Prolonged medical recovery)</option>
                    <option value="90">90 Days (Major medical treatment)</option>
                    <option value="custom">Custom End Date</option>
                    <option value="indefinite">Indefinite (Until manually lifted)</option>
                  </Select>
                </div>

                {holdDuration === "custom" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custom-end-date">Hold End Date</Label>
                    <Input
                      id="custom-end-date"
                      type="date"
                      value={customEndDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hold-note">Medical reason / Hospital notes (optional)</Label>
                <Input
                  id="hold-note"
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                  placeholder="e.g. Admitted to General Hospital ICU, unable to check in."
                />
              </div>

              <Button
                variant="outline"
                className="gap-2 text-lavender hover:bg-lavender/10"
                disabled={holdMutation.isPending}
                onClick={() => {
                  const durationDays =
                    holdDuration === "indefinite" || holdDuration === "custom"
                      ? undefined
                      : parseInt(holdDuration, 10);
                  const endDate =
                    holdDuration === "custom" && customEndDate
                      ? new Date(customEndDate).toISOString()
                      : undefined;

                  holdMutation.mutate({
                    active: true,
                    note: holdNote,
                    duration_days: durationDays,
                    end_date: endDate,
                  });
                }}
              >
                <PauseCircle className="h-4 w-4" />
                {holdMutation.isPending ? "Activating Hold…" : "Activate Medical Hold (Freeze Vault)"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Proof of Death (Death Certificate) Upload & Verification Hub */}
      <Card className="mb-6 shadow-md border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-emerald-500" aria-hidden />
              Proof of Death & Verification Hub
            </CardTitle>
            {caseData?.status && (
              <Badge variant={caseData.status === "APPROVED" ? "success" : "warning"}>
                {String(caseData.status).replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <CardDescription>
            Upload official proof of death (e.g. certified Death Certificate or Medical Examiner's report)
            to initiate verification. Our system analyzes names, dates of birth, and seals to verify the claim.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {caseQuery.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              {/* Status explanation */}
              <div className="rounded-lg border border-border bg-secondary/30 p-3.5 flex items-start gap-3">
                <Clock className="h-4 w-4 shrink-0 text-lavender mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Current Status: {caseData?.status ? String(caseData.status).replace(/_/g, " ") : "Ready for Submission"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {CASE_STATUS_COPY[String(caseData?.status).toUpperCase()] ??
                      "Submit death certificate or supporting legal records to proceed."}
                  </p>
                </div>
              </div>

              {/* Upload Form */}
              <form
                className="space-y-4 max-w-xl"
                onSubmit={(e) => {
                  e.preventDefault();
                  uploadEvidenceMutation.mutate();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="evidence-category">Document Type</Label>
                    <Select
                      id="evidence-category"
                      value={evidenceCategory}
                      onChange={(e) => setEvidenceCategory(e.target.value)}
                    >
                      <option value="HOSPITAL_DEATH_SUMMARY">Hospital Death / Discharge Summary (Fastest & Most Accessible)</option>
                      <option value="DOCTOR_CAUSE_OF_DEATH">Doctor's Medical Certificate of Cause of Death</option>
                      <option value="CREMATION_BURIAL_RECEIPT">Cremation / Burial / Funeral Ground Receipt</option>
                      <option value="DEATH_CERTIFICATE">Official Government Death Certificate</option>
                      <option value="COURT_ORDER">Court Probate Order</option>
                      <option value="MEDICAL_RECORD">Hospital / Clinical Admission Record</option>
                      <option value="SUPPORTING_DOC">Notarized Affidavit / Supporting Proof</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="doc-number">Certificate / Document #</Label>
                    <Input
                      id="doc-number"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="e.g. DC-2026-99214"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="issuing-authority">Issuing Authority</Label>
                    <Input
                      id="issuing-authority"
                      value={issuingAuth}
                      onChange={(e) => setIssuingAuth(e.target.value)}
                      placeholder="e.g. Dept of Public Health"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="evidence-note">Additional Note (optional)</Label>
                    <Input
                      id="evidence-note"
                      value={evidenceNote}
                      onChange={(e) => setEvidenceNote(e.target.value)}
                      placeholder="Certified seal included"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="evidence-file">Document File (PDF, PNG, JPG)</Label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      id="evidence-file"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="block w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
                      onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <FieldError>{uploadError}</FieldError>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    variant="accent"
                    disabled={!evidenceFile || uploadEvidenceMutation.isPending}
                    className="gap-2"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {uploadEvidenceMutation.isPending ? "Uploading & Analyzing OCR…" : "Submit Proof for Verification"}
                  </Button>

                  {/* Fast-Track Simulation Button for Testing */}
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 text-lavender hover:bg-lavender/10 border-lavender/40"
                    disabled={fastTrackMutation.isPending}
                    onClick={() => fastTrackMutation.mutate()}
                  >
                    <Sparkles className="h-4 w-4 text-lavender" />
                    {fastTrackMutation.isPending ? "Simulating…" : "Fast-Track Approval (Test Simulator)"}
                  </Button>

                  <Link to="/nominee/case">
                    <Button type="button" variant="ghost" className="text-xs">
                      View Full Case Details &rarr;
                    </Button>
                  </Link>
                </div>
              </form>

              {/* Uploaded Evidence List */}
              {caseData?.evidence && caseData.evidence.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <h4 className="text-xs font-semibold text-foreground mb-2">Uploaded Evidence Documents ({caseData.evidence.length})</h4>
                  <div className="space-y-2">
                    {caseData.evidence.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/20 text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className="h-4 w-4 text-lavender shrink-0" />
                          <div className="truncate">
                            <span className="font-medium text-foreground">{item.file_name}</span>
                            <span className="text-muted-foreground ml-2">({item.category || "Evidence"})</span>
                          </div>
                        </div>
                        {item.download_url && (
                          <a
                            href={item.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-medium text-xs ml-3 shrink-0 flex items-center gap-1"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Document Release Status to Recipients */}
      <Card className="shadow-md border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FolderLock className="h-5 w-5 text-lavender" aria-hidden />
              Recipient Document Release Status
            </CardTitle>
            <Badge variant={isApproved ? "success" : "secondary"}>
              {isApproved ? "RELEASED TO RECIPIENTS" : "PROTECTED IN VAULT"}
            </Badge>
          </div>
          <CardDescription>
            {isApproved
              ? "Life-event verification confirmed. In accordance with zero-trust privacy rules, all unlocked vault documents have been released directly to the vault owner's designated recipient(s). As custodian, your verification duty is complete."
              : "Vault documents remain securely encrypted. They will automatically unlock and release directly to the designated recipient(s) once life-event proof verification is approved."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docsQuery.isPending ? (
            <Skeleton className="h-28 w-full" />
          ) : isApproved ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-100">
                <p className="text-xs font-medium flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>
                    Verification approved. Vault documents transferred exclusively to the designated recipient(s) dashboard. Recipient accounts can now sign in under the Recipient tab to access and download the legacy files.
                  </span>
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Zero-Trust Custodian Privacy</p>
                <p>
                  As the vault nominee/custodian, your verification duty is complete. In accordance with CloudGuard's zero-knowledge security protocols, the owner's private documents are accessible exclusively to the recipient(s).
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl border border-dashed border-border bg-muted/20">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-foreground">Documents currently locked in vault</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                Once life-event proof is verified (or when using Fast-Track Simulator above),
                the owner's designated documents will be automatically released to their authorized recipient(s).
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
