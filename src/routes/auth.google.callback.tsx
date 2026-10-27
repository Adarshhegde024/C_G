import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { completeGoogleSignIn } from "@/api/auth";
import { homeForRole } from "@/auth/roles";
import { Logo } from "@/components/layout/Logo";
import { Spinner } from "@/components/ui/skeleton";

export const Route = createFileRoute("/auth/google/callback")({
  head: () => ({
    meta: [{ title: "Completing sign-in · CloudGuard" }],
  }),
  ssr: false,
  component: GoogleCallbackPage,
});

/**
 * Public OAuth callback. Receives the Google authorization code and hands it
 * to the backend, which performs the token exchange and returns a CloudGuard
 * session. No Google account data is ever handled locally.
 */
function GoogleCallbackPage() {
  const router = useRouter();
  const attempted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    if (oauthError) {
      setError("Google sign-in was cancelled. You can try again or sign in with your email.");
      return;
    }
    if (!code) {
      setError("The sign-in response was incomplete. Please start again from the sign-in page.");
      return;
    }

    completeGoogleSignIn(code, state)
      .then(async (user) => {
        toast.success("Signed in with Google.");
        await router.options.context.auth.ensureReady();
        await router.navigate({ to: homeForRole(user.role), replace: true });
      })
      .catch(() => {
        setError("We couldn't complete the Google sign-in. Please try again or use your email and password.");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Logo />
      {error ? (
        <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/10 p-6">
          <p className="text-sm text-foreground">{error}</p>
          <a href="/login" className="mt-4 inline-block text-sm font-semibold text-lavender hover:underline">
            Back to sign in
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner className="h-6 w-6 text-lavender" />
          <p className="text-sm">Completing your secure sign-in…</p>
        </div>
      )}
    </div>
  );
}
