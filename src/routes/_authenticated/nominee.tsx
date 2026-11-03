import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Info, Send, Trash2, UserCheck } from "lucide-react";

import { fetchNominee, removeNominee, saveNominee, sendNomineeInvitation, updateNominee } from "@/api/nominee";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/skeleton";
import type { Nominee } from "@/types";

export const Route = createFileRoute("/_authenticated/nominee")({
  head: () => ({
    meta: [
      { title: "Your nominated person · CloudGuard" },
      { name: "description", content: "Configure the nominee who can take part in CloudGuard legacy verification." },
      { property: "og:title", content: "Your nominated person · CloudGuard" },
      { property: "og:description", content: "Configure the nominee who can take part in CloudGuard legacy verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NomineePage,
});

function NomineePage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invitation link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const query = useQuery<Nominee | null, ApiError>({ queryKey: ["nominee"], queryFn: fetchNominee });
  const nominee = query.data ?? null;

  useEffect(() => {
    if (nominee) {
      setName(nominee.name);
      setEmail(nominee.email);
      setEditing(false);
    }
  }, [nominee]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["nominee"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation<Nominee, ApiError>({
    mutationFn: () =>
      nominee?.id ? updateNominee(name.trim(), email.trim()) : saveNominee(name.trim(), email.trim()),
    onSuccess: () => {
      toast.success("Nominee saved.");
      invalidate();
      setEditing(false);
    },
    onError: (err) => setError(err.message),
  });

  const inviteMutation = useMutation<Nominee, ApiError>({
    mutationFn: () => sendNomineeInvitation(),
    onSuccess: () => {
      toast.success("Nominee invitation sent.");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = useMutation<void, ApiError>({
    mutationFn: () => removeNominee(),
    onSuccess: () => {
      toast.success("Nominee removed.");
      setName("");
      setEmail("");
      invalidate();
      setConfirmingRemove(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const showForm = !nominee || editing;

  return (
    <>
      <PageHeader
        title="Your nominated person"
        description="One person you trust to take part in verification if it is ever required."
      />

      <Card className="mb-6 border-lavender/40 bg-secondary/40">
        <CardContent className="flex items-start gap-3 pt-1">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-lavender" aria-hidden />
          <p className="text-sm text-secondary-foreground">
            The nominee can participate in the legacy verification process if your account becomes
            eligible after missed check-ins and the required review process. A missed check-in alone
            never triggers anything.
          </p>
        </CardContent>
      </Card>

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Card>
      ) : showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>{nominee ? "Edit nominee" : "Configure your nominee"}</CardTitle>
            <CardDescription>This person will need to verify their identity through a formal review process.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="max-w-md space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                if (!name.trim()) return setError("Please enter the nominee's name.");
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError("Please enter a valid email address.");
                saveMutation.mutate();
              }}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="nominee-name">Full name</Label>
                <Input id="nominee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nominee's name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nominee-email">Email address</Label>
                <Input id="nominee-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nominee@example.com" />
                <FieldError>{error}</FieldError>
              </div>
              <div className="flex gap-3">
                <Button type="submit" variant="accent" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : nominee ? "Save changes" : "Save nominee"}
                </Button>
                {nominee ? (
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : nominee ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-4.5 w-4.5 text-lavender" aria-hidden />
              {nominee.name}
            </CardTitle>
            <CardDescription>{nominee.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={nominee.status === "ACCEPTED" ? "success" : nominee.status === "PENDING" ? "warning" : "secondary"}>
                {String(nominee.status).replace(/_/g, " ")}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
                <Send className="h-4 w-4" aria-hidden />
                {inviteMutation.isPending ? "Sending…" : nominee.status === "PENDING" ? "Resend invitation email" : "Send invitation email"}
              </Button>
              {nominee.invitation_link && (
                <Button size="sm" variant="outline" onClick={() => handleCopyLink(nominee.invitation_link!)}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy invitation link"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmingRemove(true)}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove
              </Button>
            </div>

            {nominee.status === "PENDING" && nominee.invitation_link && (
              <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">Direct Onboarding Link</span>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(nominee.invitation_link!)}
                    className="text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied!" : "Copy URL"}
                  </button>
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground select-all bg-background/80 p-1.5 rounded border border-border/40">
                  {nominee.invitation_link}
                </p>
                <p className="text-[11px]">
                  If automated email delivery is delayed, you can directly share this link with your nominee via message or email.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<UserCheck className="h-5 w-5" aria-hidden />}
          title="No nominee has been configured."
          description="Choose a person who could take part in verification if it is ever required."
        />
      )}

      {confirmingRemove ? (
        <Card className="mt-4 border-destructive/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <p className="text-sm">Remove your nominee? They'll lose any pending invitation.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmingRemove(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate()}>
                {removeMutation.isPending ? (
                  <>
                    <Spinner /> Removing…
                  </>
                ) : (
                  "Remove nominee"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
