import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    // Wait for the initial session restore so a refresh on a protected page
    // doesn't bounce a signed-in user back to /login.
    await context.auth.ensureReady();
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
