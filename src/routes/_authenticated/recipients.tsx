import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, MoreVertical, Send, Trash2, UserPlus, Users } from "lucide-react";

import { addRecipient, fetchRecipients, removeRecipient, sendRecipientInvitation, updateRecipient } from "@/api/recipients";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/skeleton";
import type { InvitationStatus, Recipient } from "@/types";

export const Route = createFileRoute("/_authenticated/recipients")({
  head: () => ({
    meta: [
      { title: "Trusted recipients · CloudGuard" },
      { name: "description", content: "Manage the people you trust to receive your CloudGuard documents." },
      { property: "og:title", content: "Trusted recipients · CloudGuard" },
      { property: "og:description", content: "Manage the people you trust to receive your CloudGuard documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientsPage,
});

const STATUS_BADGE: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  PENDING: { label: "Pending", variant: "warning" },
  ACCEPTED: { label: "Accepted", variant: "success" },
  EXPIRED: { label: "Expired", variant: "destructive" },
  REVOKED: { label: "Revoked", variant: "outline" },
};

function statusBadge(status: InvitationStatus) {
  const meta = STATUS_BADGE[status] ?? { label: String(status).replace(/_/g, " "), variant: "secondary" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

interface RecipientFormState {
  id?: string;
  name: string;
  email: string;
}

function RecipientDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: RecipientFormState | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const saveMutation = useMutation<Recipient, ApiError>({
    mutationFn: () =>
      initial?.id ? updateRecipient(initial.id, { name: name.trim(), email: email.trim() }) : addRecipient(name.trim(), email.trim()),
    onSuccess: () => {
      toast.success(initial?.id ? "Recipient updated." : "Recipient added.");
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={initial?.id ? "Edit recipient" : "Add a trusted recipient"}
        description="Recipients can receive specific documents if you ever release them."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!name.trim()) return setError("Please enter a name.");
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Please enter a valid email address.");
            saveMutation.mutate();
          }}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="recipient-name">Full name</Label>
            <Input id="recipient-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient's name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recipient-email">Email address</Label>
            <Input id="recipient-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient@example.com" />
            <FieldError>{error}</FieldError>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : initial?.id ? "Save changes" : "Add recipient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecipientsPage() {
  const [dialog, setDialog] = useState<{ open: boolean; initial: RecipientFormState | null }>({ open: false, initial: null });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Recipient | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery<Recipient[], ApiError>({ queryKey: ["recipients"], queryFn: fetchRecipients });

  const inviteMutation = useMutation<Recipient, ApiError, string>({
    mutationFn: (id) => sendRecipientInvitation(id),
    onSuccess: () => {
      toast.success("Invitation sent.");
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = useMutation<void, ApiError, string>({
    mutationFn: (id) => removeRecipient(id),
    onSuccess: () => {
      toast.success("Recipient removed.");
      queryClient.invalidateQueries({ queryKey: ["recipients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setRemoving(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader
        title="Trusted recipients"
        description="The people who may receive your documents, when and only if you decide so."
        actions={
          <Button variant="accent" onClick={() => setDialog({ open: true, initial: null })}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Add recipient
          </Button>
        }
      />

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden />}
          title="You haven't added any recipients yet."
          description="Add the people you trust and assign documents to them."
          action={
            <Button variant="accent" onClick={() => setDialog({ open: true, initial: null })}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Add recipient
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(query.data ?? []).map((recipient) => {
            const status = recipient.status ?? recipient.invitation_status;
            return (
              <Card key={recipient.id} className="card-hover p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                      {recipient.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{recipient.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{recipient.email}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${recipient.name}`} onClick={() => setMenuFor(menuFor === recipient.id ? null : recipient.id)}>
                      <MoreVertical className="h-4 w-4" aria-hidden />
                    </Button>
                    {menuFor === recipient.id ? (
                      <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl" onMouseLeave={() => setMenuFor(null)}>
                        <button
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent focus-ring"
                          onClick={() => {
                            setMenuFor(null);
                            setDialog({ open: true, initial: { id: recipient.id, name: recipient.name, email: recipient.email } });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent focus-ring"
                          onClick={() => {
                            setMenuFor(null);
                            inviteMutation.mutate(recipient.id);
                          }}
                          disabled={inviteMutation.isPending}
                        >
                          <Send className="h-4 w-4" aria-hidden />
                          {status === "PENDING" ? "Resend invitation" : "Send invitation"}
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 focus-ring"
                          onClick={() => {
                            setMenuFor(null);
                            setRemoving(recipient);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  {statusBadge(status)}
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    {recipient.assigned_documents ?? 0} documents assigned
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RecipientDialog
        open={dialog.open}
        initial={dialog.initial}
        onOpenChange={(open) => setDialog({ open, initial: open ? dialog.initial : null })}
        onSaved={() => undefined}
      />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent title="Remove this recipient?" description="They will no longer have access to any released documents.">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={removeMutation.isPending}
              onClick={() => removing && removeMutation.mutate(removing.id)}
            >
              {removeMutation.isPending ? (
                <>
                  <Spinner /> Removing…
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
