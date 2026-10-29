import { createFileRoute, redirect } from "@tanstack/react-router";

import { roleGuard } from "@/auth/roles";
import { NomineeCasePage } from "./-nominee.case";

export const Route = createFileRoute("/_authenticated/nominee/case")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["nominee"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Verification case · CloudGuard" },
      { name: "description", content: "Submit identity evidence for your CloudGuard verification case." },
      { property: "og:title", content: "Verification case · CloudGuard" },
      { property: "og:description", content: "Submit identity evidence for your CloudGuard verification case." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NomineeCasePage,
});
