import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Edit2, Info, Plus, Send, Trash2, UserCheck, Users } from "lucide-react";

import {
  fetchNominees,
  saveNominee,
  updateNominee,
  removeNominee,
  sendNomineeInvitation,
} from "@/api/nominee";
import { ApiError } from "@/api/client";
import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/skeleton";
import type { Nominee } from "@/types";

export const Route = createFileRoute("/_authenticated/nominee/")({
  beforeLoad: ({ context, location }) => {
    const user = context.auth.getUser();
    if (user?.role === "nominee") {
      throw redirect({ to: "/nominee/dashboard", replace: true });
    }
    const redirectTo = roleGuard(user, ["owner"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Nominated Contacts · CloudGuard" },
      { name: "description", content: "Configure the nominees who can take part in CloudGuard legacy verification and support." },
      { property: "og:title", content: "Nominated Contacts · CloudGuard" },
      { property: "og:description", content: "Configure the nominees who can take part in CloudGuard legacy verification and support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NomineePage,
});

function NomineePage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNominee, setEditingNominee] = useState<Nominee | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getNormalizedInviteLink = (rawLink: string | null | undefined): string => {
    if (!rawLink) return "";
    try {
      if (typeof window !== "undefined" && window.location?.origin) {
        const match = rawLink.match(/\/invite\/[^/?#]+/);
        if (match) {
          return `${window.location.origin}${match[0]}`;
        }
      }
    } catch {
      // fallback
    }
    return rawLink;
  };

  const handleCopyLink = (nomineeId: string, link: string) => {
    const normalized = getNormalizedInviteLink(link);
    navigator.clipboard.writeText(normalized);
    setCopiedId(nomineeId);
    toast.success("Invitation link copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const query = useQuery<Nominee[], ApiError>({
    queryKey: ["nominees"],
    queryFn: fetchNominees,
  });

  const nominees = query.data ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["nominees"] });
    queryClient.invalidateQueries({ queryKey: ["nominee"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation<Nominee, ApiError, { name: string; email: string; id?: string }>({
    mutationFn: ({ name, email, id }) =>
      id ? updateNominee(name.trim(), email.trim(), id) : saveNominee(name.trim(), email.trim()),
    onSuccess: (data, variables) => {
      toast.success(variables.id ? "Nominee updated." : "New nominee added and invited.");
      invalidate();
      setShowAddForm(false);
      setEditingNominee(null);
      setName("");
      setEmail("");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const inviteMutation = useMutation<Nominee, ApiError, string>({
    mutationFn: (id: string) => sendNomineeInvitation(id),
    onSuccess: () => {
      toast.success("Nominee invitation email sent.");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = useMutation<void, ApiError, string>({
    mutationFn: (id: string) => removeNominee(id),
    onSuccess: () => {
      toast.success("Nominee removed.");
      invalidate();
      setConfirmDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  function startEdit(nom: Nominee) {
    setEditingNominee(nom);
    setName(nom.name);
    setEmail(nom.email);
    setShowAddForm(true);
    setError(null);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter the nominee's full name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Please enter a valid email address.");

    saveMutation.mutate({
      name,
      email,
      id: editingNominee?.id,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-2">
        <PageHeader
          title="Nominated Contacts"
          description="Designate multiple trusted people who can participate in verification or help freeze your vault in emergencies."
        />
        {!showAddForm && (
          <Button
            variant="accent"
            className="flex items-center gap-2 self-start sm:self-auto"
            onClick={() => {
              setEditingNominee(null);
              setName("");
              setEmail("");
              setError(null);
              setShowAddForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Nominee
          </Button>
        )}
      </div>

      <Card className="mb-6 border-lavender/40 bg-secondary/40">
        <CardContent className="flex items-start gap-3 pt-1">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-lavender" aria-hidden />
          <p className="text-sm text-secondary-foreground">
            You can add as many nominees as you want. Each nominee receives a private invitation link
            to set their credentials. They can manage medical holds if you are incapacitated, or submit
            proof of death to assist in document distribution if check-ins lapse.
          </p>
        </CardContent>
      </Card>

      {/* Add or Edit Form Card */}
      {showAddForm && (
        <Card className="mb-6 border-primary/40 bg-secondary/20 shadow-md">
          <CardHeader>
            <CardTitle>{editingNominee ? "Edit Nominee" : "Add New Nominee"}</CardTitle>
            <CardDescription>
              {editingNominee
                ? "Update contact details for this nominated person."
                : "An invitation email will be sent automatically with an onboarding link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="max-w-md space-y-4" onSubmit={handleFormSubmit} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="nominee-name">Full name</Label>
                <Input
                  id="nominee-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Elena Vance"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nominee-email">Email address</Label>
                <Input
                  id="nominee-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nominee@example.com"
                  required
                />
                <FieldError>{error}</FieldError>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" variant="accent" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <>
                      <Spinner /> Saving…
                    </>
                  ) : editingNominee ? (
                    "Save Changes"
                  ) : (
                    "Send Invitation"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingNominee(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-destructive">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      ) : nominees.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-lavender" aria-hidden />}
          title="No nominees configured yet."
          description="Add trusted people who can help verify life events or pause your vault during medical emergencies."
          action={
            !showAddForm ? (
              <Button
                variant="accent"
                onClick={() => {
                  setEditingNominee(null);
                  setName("");
                  setEmail("");
                  setShowAddForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Your First Nominee
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {nominees.map((nom) => {
            const isAccepted = nom.status === "ACCEPTED";
            const inviteLink = nom.invitation_link;
            const isCopied = copiedId === nom.id;
            const isPendingInvite = inviteMutation.isPending && inviteMutation.variables === nom.id;

            return (
              <Card key={nom.id || nom.email} className="flex flex-col justify-between card-hover">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <UserCheck className="h-4.5 w-4.5 text-lavender" aria-hidden />
                      {nom.name}
                    </CardTitle>
                    <Badge variant={isAccepted ? "success" : "warning"}>
                      {isAccepted ? "Active / Accepted" : "Invitation Pending"}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs text-muted-foreground truncate">
                    {nom.email}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                    {nom.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5"
                        onClick={() => inviteMutation.mutate(nom.id!)}
                        disabled={isPendingInvite}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {isPendingInvite ? "Sending…" : isAccepted ? "Resend Login Link" : "Resend Invite"}
                      </Button>
                    )}

                    {inviteLink && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1.5"
                        onClick={() => handleCopyLink(nom.id || nom.email, inviteLink)}
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {isCopied ? "Copied Link" : "Copy Link"}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5"
                      onClick={() => startEdit(nom)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>

                    {nom.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-destructive hover:bg-destructive/10 ml-auto"
                        onClick={() => setConfirmDeleteId(nom.id!)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Direct Link Preview for Pending Nominees */}
                  {!isAccepted && inviteLink && (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-[11px]">Direct Onboarding URL</span>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(nom.id || nom.email, inviteLink)}
                          className="text-primary hover:underline text-[11px] font-medium"
                        >
                          {isCopied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="truncate font-mono text-[10px] select-all bg-background/80 p-1 rounded border border-border/40">
                        {getNormalizedInviteLink(inviteLink)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal / Card */}
      {confirmDeleteId && (
        <Card className="mt-6 border-destructive/40 bg-destructive/5 animate-in fade-in-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Remove this nominee?</p>
              <p className="text-xs text-muted-foreground">
                They will lose any pending invitation and will no longer have access to assist with your vault.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(confirmDeleteId)}
              >
                {removeMutation.isPending ? <Spinner /> : "Confirm Removal"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
