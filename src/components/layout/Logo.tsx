import { ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export function Logo({ to = "/", variant = "dark", className }: { to?: string; variant?: "dark" | "light"; className?: string }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2 focus-ring rounded-md", className)}>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          variant === "light" ? "bg-lavender/20 text-lavender" : "bg-primary text-primary-foreground",
        )}
      >
        <ShieldCheck className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span
        className={cn(
          "font-display text-lg font-semibold tracking-tight",
          variant === "light" ? "text-vault-foreground" : "text-foreground",
        )}
      >
        cloudguard<span className="text-lavender">.</span>
      </span>
    </Link>
  );
}
