import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  FileLock2,
  Fingerprint,
  HeartHandshake,
  Lock,
  ShieldCheck,
  UserCheck,
  Video,
} from "lucide-react";

import heroImage from "@/assets/hero-vault.png";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CloudGuard — Keep what matters. Protected." },
      {
        name: "description",
        content:
          "CloudGuard is a secure digital-legacy vault: store your important documents, stay connected through secure check-ins, and protect the people you trust.",
      },
      { property: "og:title", content: "CloudGuard — Keep what matters. Protected." },
      {
        property: "og:description",
        content:
          "A private, thoughtfully designed home for your most important documents and the people you trust.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Lock,
    title: "Private by design",
    text: "Your vault is yours alone. Nothing is shared until you choose to share it.",
  },
  {
    icon: FileLock2,
    title: "Encrypted documents",
    text: "Every document you store is protected with encryption confirmed by our servers.",
  },
  {
    icon: HeartHandshake,
    title: "Trusted recipients",
    text: "Choose the people who should receive specific documents, on your terms.",
  },
  {
    icon: Video,
    title: "Secure check-ins",
    text: "A short verified check-in confirms you're well and keeps your vault active.",
  },
  {
    icon: Fingerprint,
    title: "Human-reviewed verification",
    text: "Legacy release is never automatic — trained reviewers examine every case.",
  },
];

const WORKFLOW = [
  { icon: FileLock2, label: "Store", text: "Upload documents to your encrypted vault" },
  { icon: ShieldCheck, label: "Secure", text: "Assign recipients you trust" },
  { icon: Video, label: "Check in", text: "A quick verified check-in keeps your vault active" },
  { icon: Fingerprint, label: "Verify", text: "If ever needed, identity is verified by humans" },
  { icon: CheckCircle2, label: "Release", text: "Documents reach the right people, at the right time" },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link to="/register" className="hidden sm:block">
              <Button variant="accent">Create your vault</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:pb-24 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-lavender" aria-hidden />
              Secure digital legacy vault
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Keep what matters.
              <br />
              <span className="bg-gradient-to-r from-primary to-lavender bg-clip-text text-transparent">
                Protected.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              A private, thoughtfully designed home for your most important documents and the people
              you trust.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register">
                <Button variant="accent" size="lg" className="gap-2">
                  Create your vault
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg">
                  Sign in
                </Button>
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Encrypted storage · Verified check-ins · Human-reviewed release
            </p>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-border surface-shadow">
              <img
                src={heroImage}
                alt="Illustration of a glowing digital vault surrounded by protected documents"
                width={1536}
                height={1024}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border/70 bg-card/50 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Security at every step
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            CloudGuard is built around a simple promise — your documents stay private, and release
            only through a process you control.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="card-hover p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <feature.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.text}</p>
              </Card>
            ))}
            <Card className="vault-gradient p-6 text-vault-foreground">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lavender">
                <UserCheck className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">Built for peace of mind</h3>
              <p className="mt-1.5 text-sm text-vault-muted">
                Missing a check-in never changes anything on its own. Release requires verified
                evidence and a human reviewer — always.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              How CloudGuard works
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
              One calm, deliberate process — from storing a document to releasing it to the people
              you chose.
            </p>
          </div>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {WORKFLOW.map((step, index) => (
              <li key={step.label} className="relative">
                <Card className="card-hover h-full p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <step.icon className="h-4.5 w-4.5 text-lavender" aria-hidden />
                  </div>
                  <h3 className="mt-4 font-display text-sm font-semibold uppercase tracking-wider">
                    {step.label}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA band */}
      <section className="px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="vault-gradient mx-auto max-w-6xl rounded-2xl px-6 py-12 text-center sm:px-12">
          <h2 className="font-display text-2xl font-semibold text-vault-foreground sm:text-3xl">
            Set up your vault in minutes
          </h2>
          <p className="mx-auto mt-3 max-w-md text-vault-muted">
            Create your account, choose your check-in rhythm, and add the documents that matter.
          </p>
          <Link to="/register" className="mt-8 inline-block">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90">
              Create your vault
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-xs text-muted-foreground">
              A secure digital vault for important documents and digital legacy.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link to="/register" className="hover:text-foreground">
              Create account
            </Link>
            <Link to="/forgot-password" className="hover:text-foreground">
              Forgot password
            </Link>
          </div>
        </div>
        <div className="border-t border-border/70 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CloudGuard. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
