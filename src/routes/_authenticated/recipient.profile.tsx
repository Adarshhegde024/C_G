import { createFileRoute, redirect } from "@tanstack/react-router";

import { roleGuard } from "@/auth/roles";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileView } from "@/components/pages/ProfileView";

export const Route = createFileRoute("/_authenticated/recipient/profile")({
  beforeLoad: ({ context, location }) => {
    const redirectTo = roleGuard(context.auth.getUser(), ["recipient"]);
    if (redirectTo) throw redirect({ to: redirectTo, replace: true, search: { redirect: location.href } });
  },
  head: () => ({
    meta: [
      { title: "Recipient profile · CloudGuard" },
      { name: "description", content: "Your CloudGuard recipient profile details." },
      { property: "og:title", content: "Recipient profile · CloudGuard" },
      { property: "og:description", content: "Your CloudGuard recipient profile details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecipientProfilePage,
});

function RecipientProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Your account details." />
      <ProfileView />
    </>
  );
}
