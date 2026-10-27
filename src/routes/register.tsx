import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

import { register, GoogleNotConfiguredError, startGoogleSignIn } from "@/api/auth";
import { ApiError } from "@/api/client";
import { AuthShell } from "@/components/layout/AuthShell";
import { FaceEnrollment } from "@/components/checkin/FaceEnrollment";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/skeleton";
import type { DurationValue, RegisterPayload } from "@/types";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your account · CloudGuard" },
      { name: "description", content: "Create your CloudGuard vault — a private home for your most important documents." },
      { property: "og:title", content: "Create your account · CloudGuard" },
      { property: "og:description", content: "Create your CloudGuard vault — a private home for your most important documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});

const UNITS: DurationValue["unit"][] = ["seconds", "minutes", "hours", "days"];
const UNIT_LABEL: Record<DurationValue["unit"], string> = {
  seconds: "Seconds",
  minutes: "Minutes",
  hours: "Hours",
  days: "Days",
};

type Step = 1 | 2 | 3;

interface PersonalForm {
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  password: string;
  confirmPassword: string;
}

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
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = ["Your details", "Security settings", "Face enrollment"];
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Registration progress">
      {steps.map((label, index) => {
        const value = index + 1;
        const done = step > value;
        const active = step === value;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : value}
            </span>
            <span className={active ? "font-semibold text-foreground" : "text-muted-foreground hidden sm:inline"}>
              {label}
            </span>
            {value < steps.length ? <span className="mx-1 h-px w-4 bg-border" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function DurationField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: DurationValue;
  onChange: (value: DurationValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          min={1}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: Math.max(1, Number(e.target.value) || 1) })}
          className="w-24"
        />
        <Select
          aria-label={`${label} unit`}
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as DurationValue["unit"] })}
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABEL[unit]}
            </option>
          ))}
        </Select>
      </div>
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}

function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [personal, setPersonal] = useState<PersonalForm>({
    fullName: "",
    email: "",
    phone: "",
    dob: "",
    password: "",
    confirmPassword: "",
  });
  const [frequency, setFrequency] = useState<DurationValue>({ value: 30, unit: "days" });
  const [grace, setGrace] = useState<DurationValue>({ value: 72, unit: "hours" });
  const [samples, setSamples] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  function validatePersonal(): string | null {
    if (!personal.fullName.trim()) return "Please enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personal.email)) return "Please enter a valid email address.";
    if (!personal.phone.trim()) return "Please enter your phone number.";
    if (!personal.dob) return "Please enter your date of birth.";
    if (personal.password.length < 8) return "Your password must be at least 8 characters.";
    if (personal.password !== personal.confirmPassword) return "The passwords don't match.";
    return null;
  }

  function handlePersonalNext(event: FormEvent) {
    event.preventDefault();
    setError(validatePersonal());
    if (!validatePersonal()) setStep(2);
  }

  function handleSecurityNext() {
    setStep(3);
  }

  async function handleFaceComplete(faceSamples: string[]) {
    setSubmitting(true);
    setError(null);
    const payload: RegisterPayload = {
      full_name: personal.fullName.trim(),
      email: personal.email.trim(),
      phone: personal.phone.trim(),
      date_of_birth: personal.dob,
      password: personal.password,
      check_in_frequency: frequency,
      grace_period: grace,
      face_samples: faceSamples,
    };
    try {
      await register(payload);
      // Per the registration contract: never auto-sign-in. Show confirmation,
      // then send the user to /login.
      setCreated(true);
      setSubmitting(false);
      toast.success("Account created successfully.");
      setTimeout(() => void navigate({ to: "/login", replace: true }), 2500);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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

  if (created) {
    return (
      <AuthShell title="Account created successfully." subtitle="Please sign in to continue.">
        <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
          <p className="mt-3 text-sm text-foreground">
            Your vault is ready. You'll be taken to the sign-in page in a moment.
          </p>
          <Button variant="accent" className="mt-5 w-full" onClick={() => void navigate({ to: "/login", replace: true })}>
            Go to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="A few details to set up your private space.">
      <Stepper step={step} />

      <div className="mt-6">
        {step === 1 ? (
          <form onSubmit={handlePersonalNext} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                autoComplete="name"
                value={personal.fullName}
                onChange={(e) => setPersonal({ ...personal, fullName: e.target.value })}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={personal.email}
                onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={personal.phone}
                  onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                  placeholder="+1 555 000 0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  autoComplete="bday"
                  value={personal.dob}
                  onChange={(e) => setPersonal({ ...personal, dob: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={personal.password}
                onChange={(e) => setPersonal({ ...personal, password: e.target.value })}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={personal.confirmPassword}
                onChange={(e) => setPersonal({ ...personal, confirmPassword: e.target.value })}
                placeholder="Repeat your password"
              />
            </div>
            <FieldError>{error}</FieldError>
            <Button type="submit" variant="accent" className="w-full">
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Choose how often you'll check in and how long a missed check-in can be recovered from.
              You choose your own values — shorter intervals are handy while testing; longer intervals
              suit real-world use.
            </p>
            <DurationField
              id="frequency"
              label="Check-in frequency"
              hint="How often you complete a verified check-in to keep your vault active."
              value={frequency}
              onChange={setFrequency}
            />
            <DurationField
              id="grace"
              label="Grace period"
              hint="How long after a missed check-in you can still check in before further steps become possible."
              value={grace}
              onChange={setGrace}
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>
              <Button variant="accent" className="flex-1" onClick={handleSecurityNext}>
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <FaceEnrollment onComplete={handleFaceComplete} submitting={submitting} />
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {step === 1 ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn}>
            <GoogleIcon />
            Continue with Google
          </Button>
        </>
      ) : null}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-lavender hover:underline focus-ring rounded-sm">
          Sign in
        </a>
      </p>
      {submitting ? <Spinner className="sr-only" /> : null}
    </AuthShell>
  );
}
