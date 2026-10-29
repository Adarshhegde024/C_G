import { createFileRoute, redirect } from "@tanstack/react-router";

import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityHistoryView } from "@/components/pages/ActivityHistoryView";

export const Route = createFileRoute("/_authenticated/recipient/history")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["recipient"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Recipient history · CloudGuard" },
      { name: "description", content: "Activity related to your recipient access in CloudGuard." },
      { property: "og:title", content: "Recipient history · CloudGuard" },
      { property: "og:description", content: "Activity related to your recipient access in CloudGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientHistoryPage,
});

function RecipientHistoryPage() {
  return (
    <>
      <PageHeader title="History" description="Activity related to your recipient access." />
      <ActivityHistoryView emptyTitle="No activity yet." />
    </>
  );
}
