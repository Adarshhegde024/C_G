import { createFileRoute, redirect } from "@tanstack/react-router";

import { roleGuard } from "@/auth/roles";

import { RecipientDocuments } from "../-recipient.documents";

export const Route = createFileRoute("/_authenticated/recipient/documents")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["recipient"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Shared documents · CloudGuard" },
      { name: "description", content: "Documents released to you through CloudGuard." },
      { property: "og:title", content: "Shared documents · CloudGuard" },
      { property: "og:description", content: "Documents released to you through CloudGuard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientDocuments,
});
