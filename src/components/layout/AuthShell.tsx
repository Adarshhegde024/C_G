import type { ReactNode } from "react";
import { Lock, ShieldCheck, Video } from "lucide-react";

import { Logo } from "@/components/layout/Logo";

const ASSURANCES = [
  { icon: Lock, text: "Documents encrypted on our servers" },
  { icon: Video, text: "Verified check-ins keep your vault active" },
  { icon: ShieldCheck, text: "Release always reviewed by a human" },
];

/** Split-panel shell shared by the public auth pages. */
export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(420px,5fr)_7fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between vault-gradient p-10 lg:flex">
        <Logo variant="light" />
        <div>
          <h2 className="font-display text-3xl font-semibold leading-tight text-vault-foreground">
            Keep what matters.
            <br />
            Protected.
          </h2>
          <ul className="mt-8 space-y-4">
            {ASSURANCES.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm text-vault-muted">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-lavender">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-vault-muted">© {new Date().getFullYear()} CloudGuard</p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
