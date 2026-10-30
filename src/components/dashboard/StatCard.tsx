import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string | undefined;
}

export function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <Card className="card-hover p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          {icon}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 font-display text-lg font-semibold leading-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
