import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { authApi } from "@/auth/authApi";
import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient(), auth: authApi },
    });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("registers the owner, recipient, nominee and reviewer areas", () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient(), auth: authApi },
    });

    for (const path of [
      "/login",
      "/register",
      "/dashboard",
      "/recipient/dashboard",
      "/nominee/dashboard",
      "/reviewer/cases",
    ]) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId, path).not.toBe(rootRouteId);
    }
  });
});
