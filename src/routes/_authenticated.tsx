import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    // In SSR, localStorage is not available, so route gating is handled on the client.
    if (typeof window === "undefined") {
      return;
    }

    await context.auth.ensureReady();
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated") {
      const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard";
      void navigate({
        to: "/login",
        search: { redirect: currentPath },
        replace: true,
      });
    }
  }, [status, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
