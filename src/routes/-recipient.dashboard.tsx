import { useQuery } from "@tanstack/react-query";
import { FolderLock, HeartHandshake, Lock, ShieldCheck } from "lucide-react";

import { fetchDocuments } from "@/api/documents";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { VaultDocument } from "@/types";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function RecipientDashboard() {
  const { user } = useAuth();
  const documentsQuery = useQuery<VaultDocument[], ApiError>({
    queryKey: ["documents"],
    queryFn: () => fetchDocuments(),
    retry: 1,
  });

  const documents = documentsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0] ?? "there"}`}
        description="Documents the vault owner has chosen to share with you."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<FolderLock className="h-4.5 w-4.5" aria-hidden />} label="Documents shared with you" value={documents.length} />
        <StatCard icon={<ShieldCheck className="h-4.5 w-4.5" aria-hidden />} label="Access" value="Released documents only" />
        <StatCard icon={<HeartHandshake className="h-4.5 w-4.5" aria-hidden />} label="Your role" value="Trusted recipient" />
      </div>

      <Card className="mt-4 vault-gradient border-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-vault-foreground">
            <Lock className="h-4.5 w-4.5 text-lavender" aria-hidden />
            About document access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-vault-muted">
            Documents reach you only after the owner's verification process completes and the backend
            releases them. Nothing is shared automatically.
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Your documents</h2>
      {documentsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : documentsQuery.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{documentsQuery.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void documentsQuery.refetch()}>
            Try again
          </Button>
        </Card>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FolderLock className="h-5 w-5" aria-hidden />}
          title="No documents have been shared with you yet."
          description="When the vault owner releases documents to you, they will appear here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="card-hover p-5">
              <p className="truncate font-medium">{doc.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{doc.file_type || "file"}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
