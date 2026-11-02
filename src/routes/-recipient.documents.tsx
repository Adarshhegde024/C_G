import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, FolderLock, Search } from "lucide-react";
import { toast } from "sonner";

import { fetchDocuments, triggerDocumentDownload } from "@/api/documents";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/skeleton";
import type { VaultDocument } from "@/types";

export function RecipientDocuments() {
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const query = useQuery<VaultDocument[], ApiError>({ queryKey: ["documents"], queryFn: () => fetchDocuments(), retry: 1 });

  const documents = useMemo(() => {
    const items = query.data ?? [];
    if (!search.trim()) return items;
    const term = search.trim().toLowerCase();
    return items.filter((doc) => doc.name.toLowerCase().includes(term));
  }, [query.data, search]);

  return (
    <>
      <PageHeader
        title="Shared documents"
        description="Documents the backend has released to you."
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search shared documents"
        />
      </div>

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
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
            <Card key={doc.id} className="card-hover flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                      <FileText className="h-4.5 w-4.5 text-lavender" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{doc.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {doc.file_type || "file"} · {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(0)} KB` : "—"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success">Released</Badge>
                </div>
              </div>

              <div className="mt-5 border-t border-border pt-3">
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
                  {downloadingId === doc.id ? "Downloading…" : "Download file"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
