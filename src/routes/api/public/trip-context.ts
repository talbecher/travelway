import { createFileRoute } from "@tanstack/react-router";

const notAllowed = () =>
  new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "GET", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/trip-context")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleTripContext } = await import("@/lib/trip-context.server");
        return handleTripContext(request);
      },
      POST: notAllowed,
      PUT: notAllowed,
      PATCH: notAllowed,
      DELETE: notAllowed,
    },
  },
});
