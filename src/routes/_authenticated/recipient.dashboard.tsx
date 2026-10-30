import { createFileRoute, redirect } from "@tanstack/react-router";

import { roleGuard } from "@/auth/roles";

import { RecipientDashboard } from "../-recipient.dashboard";

export const Route = createFileRoute("/_authenticated/recipient/dashboard")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["recipient"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Recipient dashboard · CloudGuard" },
      { name: "description", content: "Documents shared with you through CloudGuard." },
      { property: "og:title", content: "Recipient dashboard · CloudGuard" },
      { property: "og:description", content: "Documents shared with you through CloudGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientDashboard,
});
