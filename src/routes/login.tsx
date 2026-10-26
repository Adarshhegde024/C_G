import { useState, type FormEvent } from "react";
import { useNavigate, useRouter, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

import { completeGoogleSignIn, isGoogleConfigured, startGoogleSignIn, GoogleNotConfiguredError } from "@/api/auth";
import { useAuth } from "@/auth/AuthProvider";
import { homeForRole } from "@/auth/roles";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Spinner } from "@/components/ui/skeleton";
import { ApiError, onSessionExpired } from "@/api/client";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    const user = context.auth.getUser();
    if (user) throw redirect({ to: homeForRole(user.role), replace: true });
  },
  head: () => ({
    meta: [
      { title: "Sign in · CloudGuard" },
      { name: "description", content: "Sign in to your CloudGuard secure digital legacy vault." },
      { property: "og:title", content: "Sign in · CloudGuard" },
      { property: "og:description", content: "Sign in to your CloudGuard secure digital legacy vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      const search = router.state.location.search as { redirect?: string };
      const target =
        search.redirect && search.redirect.startsWith("/") ? search.redirect : homeForRole(user.role);
      toast.success("Welcome back.");
      await navigate({ to: target, replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Email or password is incorrect.");
      setSubmitting(false);
    }
  }

  function handleGoogleSignIn() {
    try {
      startGoogleSignIn();
    } catch (err) {
      toast.error(
        err instanceof GoogleNotConfiguredError
          ? "Google sign-in isn't configured for this environment yet. Please use email and password."
          : "Google sign-in couldn't be started. Please try again.",
      );
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your secure vault.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a href="/forgot-password" className="text-xs font-medium text-lavender hover:underline focus-ring rounded-sm">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-ring rounded-sm"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <FieldError>{error}</FieldError>
        </div>

        <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogleSignIn}>
        <GoogleIcon />
        Continue with Google
      </Button>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to CloudGuard?{" "}
        <a href="/register" className="font-semibold text-lavender hover:underline focus-ring rounded-sm">
          Create an account
        </a>
      </p>
    </AuthShell>
  );
}
