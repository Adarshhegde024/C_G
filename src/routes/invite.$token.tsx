import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderLock,
  HeartHandshake,
  KeyRound,
  LogIn,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

import { acceptInvitation, fetchInvitation } from "@/api/invite";
import { ApiError } from "@/api/client";
import { setToken } from "@/api/client";
import { homeForRole } from "@/auth/roles";
import { useAuth } from "@/auth/AuthProvider";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/skeleton";
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
  const rawToken = decodeURIComponent(token || "").trim();
  const cleanToken = rawToken.includes("/") ? rawToken.split("/").pop()!.trim() : rawToken;

  const router = useRouter();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptedResponse, setAcceptedResponse] = useState<{ token?: string; user?: AuthUser } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!cleanToken) {
      setLoadError("Invalid invitation token provided.");
      return;
    }
    fetchInvitation(cleanToken)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "This invitation link is not valid or has expired.");
      });
    return () => {
      cancelled = true;
    };
  }, [cleanToken]);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await acceptInvitation(cleanToken, password || undefined);
      if (response?.token) {
        setToken(response.token);
      }
      setAccepted(true);
      setAcceptedResponse(response);
      toast.success("Nomination successfully confirmed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoToDashboard() {
    if (acceptedResponse?.token && acceptedResponse.user) {
      setToken(acceptedResponse.token);
      const role = acceptedResponse.user.role as Role;
      void router.options.context.auth.ensureReady().then(() => {
        void navigate({ to: homeForRole(role), replace: true });
      });
    } else {
      void navigate({ to: "/dashboard", replace: true });
    }
  }

  function handleGoToCase() {
    if (acceptedResponse?.token && acceptedResponse.user) {
      setToken(acceptedResponse.token);
      void router.options.context.auth.ensureReady().then(() => {
        void navigate({ to: "/nominee/case", replace: true });
      });
    } else {
      void navigate({ to: "/nominee/case", replace: true });
    }
  }

  const isNominee = info?.role === "nominee";
  const ownerName = info?.vault_owner || info?.inviter_name || "the vault owner";
  const needsPassword = info?.status === "PENDING" && !currentUser;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Logo />

      <Card className="mt-8 w-full max-w-lg shadow-xl border-border">
        <CardContent className="pt-6">
          {loadError ? (
            <div className="p-4 text-center">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => void navigate({ to: "/login" })}
              >
                Go to Sign In
              </Button>
            </div>
          ) : !info ? (
            <PageLoader label="Checking your invitation status…" />
          ) : accepted ? (
            /* Dedicated Nomination Confirmed Landing View */
            <div className="space-y-6 text-center animate-in fade-in-50 duration-300">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden />
              </div>

              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {isNominee ? "Nomination Confirmed" : "Invitation Accepted"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  You are now officially registered as the trusted contact for{" "}
                  <span className="font-semibold text-foreground">{ownerName}</span>'s CloudGuard vault.
                </p>
              </div>

              {/* Informative Nominee Role Guide Card */}
              <div className="rounded-xl border border-border bg-secondary/50 p-4 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Your personal vault is ready</p>
                    <p className="text-xs text-muted-foreground">
                      You have full access to your own CloudGuard vault. You can upload sensitive documents, set up check-ins, and designate your own nominee.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-lavender" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Emergency contact role active</p>
                    <p className="text-xs text-muted-foreground">
                      {ownerName}'s vault is active and encrypted. Regular check-ins keep it secure. You will only be called upon if scheduled check-ins and grace periods lapse.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Login credentials saved</p>
                    <p className="text-xs text-muted-foreground">
                      Your credentials for <span className="font-medium text-foreground">{info.email}</span> have been saved. You can log in whenever needed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Explicit, Non-Forced Action Buttons */}
              <div className="flex flex-col gap-2.5 pt-2">
                <Button
                  variant="accent"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={handleGoToDashboard}
                >
                  <FolderLock className="h-4 w-4" />
                  {isNominee ? "Open My Personal Vault" : "Enter Dashboard"}
                </Button>

                {isNominee ? (
                  <Button
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={handleGoToCase}
                  >
                    <UserCheck className="h-4 w-4" />
                    View Nominated Case Details
                  </Button>
                ) : null}

                <Button
                  variant="ghost"
                  className="w-full flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => void navigate({ to: "/login" })}
                >
                  <LogIn className="h-4 w-4" />
                  Done · Return to Sign In
                </Button>
              </div>
            </div>
          ) : (
            /* Initial Invitation Review & Acceptance Form */
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lavender/10 text-lavender mb-3">
                  <ShieldCheck className="h-8 w-8 text-lavender" aria-hidden />
                </div>
                <h1 className="font-display text-xl font-bold text-foreground">
                  You've been invited to CloudGuard
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">{ownerName}</span> has designated{" "}
                  <span className="font-medium text-foreground">{info.email}</span> as their{" "}
                  <span className="font-semibold text-lavender">
                    {isNominee ? "trusted nominee" : "designated recipient"}
                  </span>.
                </p>
                {info.status && info.status !== "PENDING" ? (
                  <p className="mt-2 text-xs font-medium text-warning-foreground">
                    Invitation status: {String(info.status).toLowerCase()}
                  </p>
                ) : null}
              </div>

              {/* Explanation of Nominee Role */}
              <div className="rounded-lg bg-secondary/40 p-3.5 text-xs text-secondary-foreground border border-border">
                <p className="font-semibold text-foreground mb-1">About this role:</p>
                <p className="text-muted-foreground leading-relaxed">
                  As a nominee, you are an emergency contact for {ownerName}'s encrypted digital vault. You will not have access to any private documents while {ownerName} is active.
                </p>
              </div>

              {needsPassword ? (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (password.length < 8) {
                      return setError("Please choose a secure password of at least 8 characters.");
                    }
                    void handleAccept();
                  }}
                  noValidate
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-password">Create a password for your account</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      disabled={submitting}
                    />
                    <FieldError>{error}</FieldError>
                  </div>

                  <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
                    {submitting ? "Confirming nomination…" : "Confirm Nomination"}
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  {error ? <FieldError>{error}</FieldError> : null}
                  <Button
                    variant="accent"
                    className="w-full"
                    disabled={submitting}
                    onClick={() => void handleAccept()}
                  >
                    {submitting ? "Confirming nomination…" : "Confirm Nomination"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default InvitePage;
