import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { authApi } from "./auth/authApi";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 60 seconds: avoids unnecessary refetch spinners when navigating
        gcTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false, // Prevents sudden refetch lag when clicking between browser tabs
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient, auth: authApi },
    scrollRestoration: true,
    defaultPreload: "intent", // Instantly preloads page code & data on link hover
    defaultPreloadStaleTime: 1000 * 60,
    defaultErrorComponent: ErrorFallback,
    defaultNotFoundComponent: NotFoundFallback,
  });

  return router;
};

function NotFoundFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <p className="font-display text-6xl font-bold text-primary">404</p>
        <p className="mt-3 text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
      </div>
    </div>
  );
}

function ErrorFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <p className="font-display text-xl font-semibold">This page didn't load</p>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end. Please try refreshing.</p>
      </div>
    </div>
  );
}
