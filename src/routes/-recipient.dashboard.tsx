import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderLock,
  HeartHandshake,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { fetchDocuments, triggerDocumentDownload } from "@/api/documents";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { VaultDocument } from "@/types";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecipientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const documentsQuery = useQuery<VaultDocument[], ApiError>({
    queryKey: ["documents"],
    queryFn: () => fetchDocuments(),
    retry: 1,
  });

  const documents = documentsQuery.data ?? [];
  const hasReleasedDocs = documents.length > 0;

  async function handleSwitchToOwner() {
    await logout();
    await navigate({ to: "/login", search: { role: "owner" } });
  }

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? "there"}`}
        description="Documents the vault owner has designated and released to you."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<FolderLock className="h-4.5 w-4.5" aria-hidden />}
          label="Released documents"
          value={documents.length}
        />
        <StatCard
          icon={<ShieldCheck className="h-4.5 w-4.5" aria-hidden />}
          label="Access Status"
          value={hasReleasedDocs ? "Decrypted & Released" : "Protected in Vault"}
        />
        <StatCard
          icon={<HeartHandshake className="h-4.5 w-4.5" aria-hidden />}
          label="Your role"
          value="Trusted Recipient"
        />
      </div>

      {/* Vault Status Notice */}
      {hasReleasedDocs ? (
        <Card className="mt-4 border-emerald-500/30 bg-emerald-950/20 text-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-400">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
              Life-Event Verified — Documents Unlocked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-emerald-200/90 leading-relaxed">
              The designated custodian/nominee has completed the required life-event verification
              (e.g., hospital death summary or cause-of-death certification). All protected vault documents
              allocated to you are now permanently unlocked and available for download below.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4 vault-gradient border-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-vault-foreground">
              <Lock className="h-4.5 w-4.5 text-lavender" aria-hidden />
              Vault Protected & Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-vault-muted leading-relaxed">
              You are listed as an authorized recipient by the vault owner. In accordance with zero-trust protocols,
              vault contents remain strictly encrypted and will only be released to your dashboard once a designated
              nominee provides verified life-event documentation or owner check-in grace periods expire.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Personal Vault Account Option */}
      <Card className="mt-4 border-lavender/30 bg-lavender/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles className="h-4.5 w-4.5 text-lavender" aria-hidden />
              Own Your Personal Digital Vault
            </CardTitle>
            <Badge variant="outline" className="border-lavender/40 text-lavender font-mono text-[11px]">
              Dual Access
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Did you know? With your exact same login email and password, you can sign in as a <strong>Vault Owner</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Create your own personal vault to securely store sensitive financial records, passwords, and wills,
            set up check-in schedules, and designate your own trusted nominees and recipients.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSwitchToOwner}
            className="shrink-0 gap-2 border-lavender/40 hover:bg-lavender/10"
          >
            <KeyRound className="h-4 w-4 text-lavender" />
            Sign in as Vault Owner
          </Button>
        </CardContent>
      </Card>

      {/* Documents Section */}
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Your Released Documents</h2>
        {hasReleasedDocs && (
          <Link
            to="/recipient/documents"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-lavender hover:underline"
          >
            Search & filter view
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {documentsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : documentsQuery.isError ? (
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm text-muted-foreground">{documentsQuery.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void documentsQuery.refetch()}>
            Try again
          </Button>
        </Card>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FolderLock className="h-5 w-5" aria-hidden />}
          title="No documents released to you yet"
          description="When the vault owner's verification completes or life-event documentation is confirmed by nominees, released documents will instantly appear here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="card-hover flex flex-col justify-between p-5 border-border/80">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <FileText className="h-5 w-5 text-lavender" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground text-sm" title={doc.name}>
                        {doc.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {doc.file_type || "document"} · {formatBytes(doc.size_bytes)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="shrink-0 text-[10px]">
                    Released
                  </Badge>
                </div>
              </div>

              <div className="mt-5 border-t border-border/60 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-lavender/40 hover:bg-lavender/10"
                  disabled={downloadingId === doc.id}
                  onClick={async () => {
                    setDownloadingId(doc.id);
                    try {
                      await triggerDocumentDownload(doc.id, doc.name);
                      toast.success(`Downloaded ${doc.name}`);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to download document.");
                    } finally {
                      setDownloadingId(null);
                    }
                  }}
                >
                  <Download className="h-4 w-4 text-lavender" aria-hidden />
                  {downloadingId === doc.id ? "Downloading…" : "Download Document"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
