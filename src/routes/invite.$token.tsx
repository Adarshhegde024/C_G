import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { acceptInvitation, fetchInvitation } from "@/api/invite";
import { ApiError } from "@/api/client";
import { setToken } from "@/api/client";
import { homeForRole } from "@/auth/roles";
import { authStore } from "@/auth/authStore";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/skeleton";
import type { AuthUser, Role } from "@/types";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Join CloudGuard · Invitation" },
      { name: "description", content: "Accept your CloudGuard invitation." },
      { property: "og:title", content: "Join CloudGuard · Invitation" },
      { property: "og:description", content: "Accept your CloudGuard invitation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvitePage,
});

interface InvitationInfo {
  email?: string;
  inviter_name?: string;
  vault_owner?: string;
  role?: string;
  status?: string;
  expires_at?: string | null;
}

function InvitePage() {
  const { token } = useParams({ from: Route.id });
  const router = useRouter();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInvitation(token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "This invitation link is not valid.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await acceptInvitation(token, password || undefined);
      setAccepted(true);
      toast.success("Invitation accepted.");
      if (response.token && response.user) {
        setToken(response.token);
        const user = response.user as AuthUser;
        setTimeout(() => {
          void router.options.context.auth.ensureReady().then(() => navigate({ to: homeForRole(user.role as Role), replace: true }));
        }, 1200);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const needsPassword = info?.role === "owner" || info?.status === "PENDING";

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <Logo />
      <Card className="mt-10 w-full max-w-md">
        <CardContent className="pt-1">
          {loadError ? (
            <div className="p-2 text-center">
              <p className="text-sm text-destructive">{loadError}</p>
              <a href="/login" className="mt-4 inline-block text-sm font-semibold text-lavender hover:underline">
                Go to sign in
              </a>
            </div>
          ) : !info ? (
            <PageLoader label="Checking your invitation…" />
          ) : accepted ? (
            <div className="p-2 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
              <p className="mt-3 font-display text-lg font-semibold">Welcome to CloudGuard.</p>
              <p className="mt-1 text-sm text-muted-foreground">Taking you to your dashboard…</p>
              <Spinner className="mt-4 text-lavender" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-lavender" aria-hidden />
                <h1 className="mt-3 font-display text-xl font-semibold">You've been invited to CloudGuard</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {info.inviter_name ? `${info.inviter_name} invited ` : "You were invited "}
                  {info.email ? <span className="font-medium text-foreground">{info.email}</span> : "you"}
                  {info.vault_owner ? ` as ${info.role === "recipient" ? "a trusted recipient" : info.role === "nominee" ? "the nominated person" : info.role} for ${info.vault_owner}'s vault.` : "."}
                </p>
                {info.status && info.status !== "PENDING" ? (
                  <p className="mt-2 text-xs text-warning-foreground">Invitation status: {String(info.status).toLowerCase()}</p>
                ) : null}
              </div>

              {needsPassword ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (password.length < 8) return setError("Please choose a password of at least 8 characters.");
                    void handleAccept();
                  }}
                  noValidate
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-password">Create a password</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                    <FieldError>{error}</FieldError>
                  </div>
                  <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
                    {submitting ? "Accepting…" : "Accept invitation"}
                  </Button>
                </form>
              ) : (
                <>
                  {error ? <FieldError>{error}</FieldError> : null}
                  <Button variant="accent" className="w-full" disabled={submitting} onClick={() => void handleAccept()}>
                    {submitting ? "Accepting…" : "Accept invitation"}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
