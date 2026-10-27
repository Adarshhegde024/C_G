import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Calendar,
  CloudUpload,
  FileText,
  HardDrive,
  Lock,
  MoreVertical,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Unlock,
} from "lucide-react";

import {
  assignDocumentRecipient,
  deleteDocument,
  fetchDocuments,
  releaseDocument,
  revokeDocumentRelease,
  uploadDocument,
} from "@/api/documents";
import { fetchRecipients } from "@/api/recipients";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { PageLoader, Skeleton, Spinner } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VaultDocument } from "@/types";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Your secure vault · CloudGuard" },
      { name: "description", content: "Upload, organise and manage your protected documents in CloudGuard." },
      { property: "og:title", content: "Your secure vault · CloudGuard" },
      { property: "og:description", content: "Upload, organise and manage your protected documents in CloudGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

type SortKey = "newest" | "oldest" | "name" | "size";

function formatSize(bytes: number | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function UploadDialog({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation<VaultDocument, ApiError, File>({
    mutationFn: (uploadFile) => uploadDocument(uploadFile),
    onMutate: () => {
      setProgress(15);
    },
    onSuccess: () => {
      setProgress(100);
      toast.success("Document uploaded. Encryption is confirmed by the server.");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onUploaded();
      setTimeout(() => {
        setOpen(false);
        setFile(null);
        setProgress(0);
      }, 600);
    },
    onError: (error) => {
      setProgress(0);
      toast.error(error.message);
    },
  });

  function acceptFile(next: File | undefined | null) {
    if (next) setFile(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!mutation.isPending) setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="accent">
          <CloudUpload className="h-4 w-4" aria-hidden />
          Upload document
        </Button>
      </DialogTrigger>
      <DialogContent title="Upload a document" description="Files are validated and encrypted by the CloudGuard backend.">
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
          <p className="mt-3 text-sm text-muted-foreground">Drag and drop your file here, or</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
            Browse files
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            aria-label="Choose a document to upload"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
        </div>

        {file ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-4.5 w-4.5 shrink-0 text-lavender" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={mutation.isPending}>
              Remove
            </Button>
          </div>
        ) : null}

        {mutation.isPending || progress > 0 ? (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-lavender transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Uploading securely…</p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!file || mutation.isPending}
            onClick={() => file && mutation.mutate(file)}
          >
            {mutation.isPending ? (
              <>
                <Spinner /> Uploading…
              </>
            ) : (
              "Upload"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentActions({ document }: { document: VaultDocument }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [recipientId, setRecipientId] = useState<string>(document.assigned_recipient?.id ?? "");
  const queryClient = useQueryClient();

  const recipientsQuery = useQuery({
    queryKey: ["recipients"],
    queryFn: fetchRecipients,
    enabled: assignOpen,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const assignMutation = useMutation({
    mutationFn: () => assignDocumentRecipient(document.id, recipientId || null),
    onSuccess: () => {
      toast.success("Recipient assignment updated.");
      invalidate();
      setAssignOpen(false);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const releaseMutation = useMutation({
    mutationFn: () =>
      document.release_status === "RELEASED" ? revokeDocumentRelease(document.id) : releaseDocument(document.id),
    onSuccess: () => {
      toast.success(
        document.release_status === "RELEASED" ? "Release revoked." : "Release requested. The backend confirms final release.",
      );
      invalidate();
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(document.id),
    onSuccess: () => {
      toast.success("Document deleted.");
      invalidate();
      setDeleteOpen(false);
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  const released = document.release_status === "RELEASED";

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label={`Actions for ${document.name}`} onClick={() => setMenuOpen((v) => !v)}>
        <MoreVertical className="h-4 w-4" aria-hidden />
      </Button>
      {menuOpen ? (
        <div
          className="absolute right-0 top-10 z-20 w-52 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent focus-ring"
            onClick={() => {
              setMenuOpen(false);
              setAssignOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Assign recipient
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent focus-ring"
            onClick={() => {
              setMenuOpen(false);
              releaseMutation.mutate();
            }}
            disabled={releaseMutation.isPending}
          >
            {released ? <Unlock className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            {released ? "Revoke release" : "Release document"}
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 focus-ring"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete document
          </button>
        </div>
      ) : null}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent
          title="Assign a recipient"
          description="Choose who should receive this document when it is released."
        >
          {recipientsQuery.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : (recipientsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't added any recipients yet. Add one from the Recipients page first.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`recipient-${document.id}`}>Recipient</Label>
                <Select
                  id={`recipient-${document.id}`}
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                >
                  <option value="">Not assigned</option>
                  {(recipientsQuery.data ?? []).map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name} ({recipient.email})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setAssignOpen(false)}>
                  Cancel
                </Button>
                <Button variant="accent" disabled={assignMutation.isPending} onClick={() => assignMutation.mutate()}>
                  {assignMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Delete this document?" description="This permanently removes the document from your vault.">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filter, setFilter] = useState<"all" | "released" | "assigned">("all");

  const query = useQuery<VaultDocument[], ApiError>({ queryKey: ["documents"], queryFn: fetchDocuments });

  const documents = useMemo(() => {
    let items = query.data ?? [];
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      items = items.filter(
        (doc) => doc.name.toLowerCase().includes(term) || doc.file_type.toLowerCase().includes(term),
      );
    }
    if (filter === "released") items = items.filter((doc) => doc.release_status === "RELEASED");
    if (filter === "assigned") items = items.filter((doc) => doc.assigned_recipient);
    const sorted = [...items];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return (b.size_bytes ?? 0) - (a.size_bytes ?? 0);
        default:
          return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
      }
    });
    return sorted;
  }, [query.data, search, sort, filter]);

  return (
    <>
      <PageHeader
        title="Your secure vault"
        description="Everything here is stored encrypted and released only on your terms."
        actions={<UploadDialog onUploaded={() => undefined} />}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search documents"
          />
        </div>
        <div className="flex gap-2">
          <Select
            aria-label="Filter documents"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="w-36"
          >
            <option value="all">All documents</option>
            <option value="released">Released</option>
            <option value="assigned">With recipient</option>
          </Select>
          <Select
            aria-label="Sort documents"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-40"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="size">Largest first</option>
          </Select>
        </div>
      </div>

      {query.isPending ? (
        <PageLoader label="Opening your vault…" />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<CloudUpload className="h-5 w-5" aria-hidden />}
          title={search || filter !== "all" ? "No matching documents." : "Your vault is empty."}
          description={
            search || filter !== "all"
              ? "Try a different search or clear the filters."
              : "Upload your first protected document."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="card-hover flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <FileText className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.file_type || "file"} · {formatSize(doc.size_bytes)}
                    </p>
                  </div>
                </div>
                <DocumentActions document={doc} />
              </div>

              <dl className="mt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  <span>Uploaded {formatDate(doc.uploaded_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-3.5 w-3.5" aria-hidden />
                  <span>Assigned to: {doc.assigned_recipient?.name ?? "No recipient"}</span>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {doc.encryption_status === "ENCRYPTED" ? (
                  <Badge variant="success">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    Encrypted
                  </Badge>
                ) : (
                  <Badge variant="outline">Encryption pending</Badge>
                )}
                <Badge variant={doc.release_status === "RELEASED" ? "warning" : "secondary"}>
                  {doc.release_status === "RELEASED" ? "Released" : "Not released"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ArrowUpDown className="sr-only" />
    </>
  );
}
