import { createFileRoute, redirect } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Briefcase, HeartPulse, Info, ShieldCheck } from "lucide-react";

import { fetchNomineeCase } from "@/api/nominee";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { NomineeCase } from "@/types";

export const Route = createFileRoute("/_authenticated/nominee/dashboard")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["nominee"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Nominee dashboard · CloudGuard" },
      { name: "description", content: "Your CloudGuard nominee verification overview." },
      { property: "og:title", content: "Nominee dashboard · CloudGuard" },
      { property: "og:description", content: "Your CloudGuard nominee verification overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NomineeDashboardPage,
});

const CASE_STATUS_COPY: Record<string, string> = {
  ELIGIBLE: "A verification case is available. You can now submit identity evidence.",
  EVIDENCE_SUBMITTED: "Your evidence has been submitted and is being analysed.",
  AWAITING_REVIEW: "A human reviewer is examining the case. No decision has been made yet.",
  MORE_INFO_REQUESTED: "The reviewer requested additional information. Please submit further evidence.",
  APPROVED: "The case was approved. The backend handles any subsequent document release.",
  REJECTED: "The case was not approved. Contact support if you believe this is a mistake.",
};

export function NomineeDashboardPage() {
  const { user } = useAuth();
  const query = useQuery<NomineeCase | null, ApiError>({
    queryKey: ["nominee-case"],
    queryFn: fetchNomineeCase,
    retry: 1,
  });

  const caseData = query.data;
  const hasCase = Boolean(caseData?.id);

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(" ")[0] ?? "there"}`}
        description="Your role in a CloudGuard verification process, when one is needed."
      />

      <Card className="mb-6 border-lavender/40 bg-secondary/40">
        <CardContent className="flex items-start gap-3 pt-1">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-lavender" aria-hidden />
          <p className="text-sm text-secondary-foreground">
            You were nominated by a CloudGuard vault owner. If their account ever becomes eligible —
            after missed check-ins and a required review process — you may be asked to verify your
            identity so documents can reach the right people. Nothing is triggered by a single missed
            check-in.
          </p>
        </CardContent>
      </Card>

      {query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {query.error.status === 404
              ? "No verification case is open for you yet."
              : query.error.message}
          </p>
        </Card>
      ) : hasCase && caseData ? (
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-4.5 w-4.5 text-lavender" aria-hidden />
              Verification case
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="lavender">{String(caseData.status).replace(/_/g, " ")}</Badge>
              <span className="text-sm text-muted-foreground">
                {CASE_STATUS_COPY[String(caseData.status).toUpperCase()] ?? "Case updates as the backend reports them."}
              </span>
            </div>
            <Link to="/nominee/case">
              <Button variant="accent">Open case</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-4.5 w-4.5 text-lavender" aria-hidden />
              No verification case open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The vault owner's account is operating normally. If a case ever opens, you'll see it here
              and receive a notification.
            </p>
          </CardContent>
        </Card>
      )}

      <ShieldCheck className="sr-only" />
    </>
  );
}
