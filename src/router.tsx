import { QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // keep data around long enough to survive an offline session
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: (count) =>
          typeof navigator !== "undefined" && navigator.onLine === false ? false : count < 2,
      },
    },
    mutationCache: new MutationCache({
      onError: () => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          toast.error("אין חיבור לאינטרנט", { description: "צריך חיבור כדי לשמור את השינוי" });
        }
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
