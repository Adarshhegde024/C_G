import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderLock, Search } from "lucide-react";

import { fetchDocuments } from "@/api/documents";
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
  const query = useQuery<VaultDocument[], ApiError>({ queryKey: ["documents"], queryFn: fetchDocuments, retry: 1 });

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
            <Card key={doc.id} className="card-hover p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate font-medium">{doc.name}</p>
                <Badge variant="success">Released</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {doc.file_type || "file"} · {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(0)} KB` : "—"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
