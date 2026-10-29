import { createFileRoute, redirect } from "@tanstack/react-router";

import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityHistoryView } from "@/components/pages/ActivityHistoryView";

export const Route = createFileRoute("/_authenticated/nominee/history")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["nominee"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Nominee history · CloudGuard" },
      { name: "description", content: "Activity related to your nominee role in CloudGuard." },
      { property: "og:title", content: "Nominee history · CloudGuard" },
      { property: "og:description", content: "Activity related to your nominee role in CloudGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NomineeHistoryPage,
});

function NomineeHistoryPage() {
  return (
    <>
      <PageHeader title="History" description="Activity related to your nominee role." />
      <ActivityHistoryView emptyTitle="No activity yet." />
    </>
  );
}
