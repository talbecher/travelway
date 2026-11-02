import { createFileRoute } from "@tanstack/react-router";

// Hourly pg_cron callback: deletes expired/unused staged document files from private storage.
// The bearer check only filters stray traffic — the job is idempotent and never touches
// approved files (server_document_cleanup_candidates excludes any path referenced by
// document_files or documents).
export const Route = createFileRoute("/api/public/hooks/document-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: candidates, error } = await supabaseAdmin.rpc("server_document_cleanup_candidates", { _limit: 100 });
          if (error) throw error;
          const rows = (candidates ?? []) as { upload_id: string; paths: string[] }[];
          const done: string[] = [];
          for (const row of rows) {
            if (row.paths?.length) {
              await supabaseAdmin.storage.from("trip-files").remove(row.paths);
            }
            done.push(row.upload_id);
          }
          let cleaned = 0;
          if (done.length) {
            const { data: n } = await supabaseAdmin.rpc("server_document_cleanup_done", { _ids: done });
            cleaned = typeof n === "number" ? n : 0;
          }
          return Response.json({ ok: true, cleaned });
        } catch {
          console.error("[document-cleanup] server_error");
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
      GET: async () => Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST" } }),
    },
  },
});
