import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Mail } from "lucide-react";

import { sendPasswordResetEmail } from "@/api/auth";
import { ApiError } from "@/api/client";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password · CloudGuard" },
      { name: "description", content: "Request a password reset link for your CloudGuard account." },
      { property: "og:title", content: "Reset your password · CloudGuard" },
      { property: "og:description", content: "Request a password reset link for your CloudGuard account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordResetEmail(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to set a new password.">
      {sent ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center">
          <Mail className="mx-auto h-8 w-8 text-success" aria-hidden />
          <p className="mt-3 text-sm">
            If an account exists for <span className="font-semibold">{email}</span>, a reset link is on
            its way. Check your inbox.
          </p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => void navigate({ to: "/login" })}>
            Back to sign in
          </Button>
        </div>
      ) : (
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
            <FieldError>{error}</FieldError>
          </div>
          <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <a href="/login" className="font-semibold text-lavender hover:underline focus-ring rounded-sm">
              Sign in
            </a>
          </p>
        </form>
      )}
      <CheckCircle2 className="sr-only" />
    </AuthShell>
  );
}
