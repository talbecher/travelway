import { createFileRoute } from "@tanstack/react-router";

const notAllowed = () =>
  new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST", "cache-control": "no-store" },
  });

// Creates a pending itinerary-item proposal only. Applying happens in the app after the user approves.
export const Route = createFileRoute("/api/public/itinerary-proposals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateItineraryProposal } = await import("@/lib/item-proposals.server");
        return handleCreateItineraryProposal(request);
      },
      GET: notAllowed,
      PUT: notAllowed,
      PATCH: notAllowed,
      DELETE: notAllowed,
    },
  },
});
