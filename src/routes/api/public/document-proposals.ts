import { createFileRoute } from "@tanstack/react-router";

const notAllowed = () =>
  new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST", "cache-control": "no-store" },
  });

// Creates a pending document proposal only. Files are attached and approval happens in the app.
export const Route = createFileRoute("/api/public/document-proposals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateDocumentProposal } = await import("@/lib/document-proposals.server");
        return handleCreateDocumentProposal(request);
      },
      GET: notAllowed,
      PUT: notAllowed,
      PATCH: notAllowed,
      DELETE: notAllowed,
    },
  },
});
