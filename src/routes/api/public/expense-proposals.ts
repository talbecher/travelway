import { createFileRoute } from "@tanstack/react-router";

const notAllowed = () =>
  new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST", "cache-control": "no-store" },
  });

// Creates a pending expense proposal only. Applying happens in the app after the user approves.
export const Route = createFileRoute("/api/public/expense-proposals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCreateExpenseProposal } = await import("@/lib/item-proposals.server");
        return handleCreateExpenseProposal(request);
      },
      GET: notAllowed,
      PUT: notAllowed,
      PATCH: notAllowed,
      DELETE: notAllowed,
    },
  },
});
