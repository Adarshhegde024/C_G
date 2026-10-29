import { createFileRoute } from "@tanstack/react-router";

import { ProfileView } from "@/components/pages/ProfileView";
import { PageHeader } from "@/components/layout/PageHeader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile · CloudGuard" },
      { name: "description", content: "View and manage your CloudGuard profile details." },
      { property: "og:title", content: "Profile · CloudGuard" },
      { property: "og:description", content: "View and manage your CloudGuard profile details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Your account details. Sensitive identity fields are managed by the backend." />
      <ProfileView />
    </>
  );
}
