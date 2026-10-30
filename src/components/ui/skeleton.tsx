import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Skeleton(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("animate-pulse rounded-lg bg-muted", className)} {...props} />;
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner className="h-6 w-6 text-lavender" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
