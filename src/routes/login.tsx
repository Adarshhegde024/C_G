import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, HeartHandshake, FolderLock } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { homeForRole } from "@/auth/roles";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Spinner } from "@/components/ui/skeleton";
import { ApiError } from "@/api/client";

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

type LoginRole = "owner" | "nominee" | "recipient";

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<LoginRole>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If redirected from registration or invite, pre-fill email and role
    const search = router.state.location.search as { email?: string; role?: string };
    if (search?.email) {
      setEmail(search.email);
    }
    if (search?.role === "nominee") {
      setSelectedRole("nominee");
    } else if (search?.role === "recipient") {
      setSelectedRole("recipient");
    }
  }, [router.state.location.search]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password, selectedRole);
      const search = router.state.location.search as { redirect?: string };
      const defaultTarget =
        selectedRole === "nominee"
          ? "/nominee/dashboard"
          : selectedRole === "recipient"
          ? "/recipient/dashboard"
          : homeForRole(user.role);
      const target =
        search.redirect && search.redirect.startsWith("/") ? search.redirect : defaultTarget;
      toast.success(
        selectedRole === "nominee"
          ? "Signed in as Nominee."
          : selectedRole === "recipient"
          ? "Signed in as Recipient."
          : "Welcome back."
      );
      await navigate({ to: target, replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Email or password is incorrect.");
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        selectedRole === "nominee"
          ? "Sign in to manage trusted legacy cases, medical holds, and verification."
          : selectedRole === "recipient"
          ? "Sign in to view and download released documents from your vault owner."
          : "Sign in to manage your vault, check-ins, and emergency nominees."
      }
    >
      {/* Role Selection Tabs */}
      <div className="mb-6 rounded-lg border border-border bg-secondary/50 p-1">
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => {
              setSelectedRole("owner");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 px-2 text-xs font-semibold transition-all ${
              selectedRole === "owner"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Vault Owner
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole("nominee");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 px-2 text-xs font-semibold transition-all ${
              selectedRole === "nominee"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HeartHandshake className="h-3.5 w-3.5 text-lavender" />
            Nominee
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole("recipient");
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 px-2 text-xs font-semibold transition-all ${
              selectedRole === "recipient"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderLock className="h-3.5 w-3.5 text-cyan-400" />
            Recipient
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">
            {selectedRole === "nominee"
              ? "Nominee email address"
              : selectedRole === "recipient"
              ? "Recipient email address"
              : "Email address"}
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={selectedRole === "nominee" ? "nominee@example.com" : "you@example.com"}
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
          ) : selectedRole === "nominee" ? (
            "Sign in as Nominee"
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      {selectedRole === "nominee" ? (
        <div className="mt-6 rounded-lg border border-lavender/30 bg-lavender/5 p-3 text-xs text-muted-foreground text-center">
          Received a nomination email? Click the link in your email to confirm or set your password first.
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          New to CloudGuard?{" "}
          <a href="/register" className="font-semibold text-lavender hover:underline focus-ring rounded-sm">
            Create an account
          </a>
        </p>
      )}
    </AuthShell>
  );
}
