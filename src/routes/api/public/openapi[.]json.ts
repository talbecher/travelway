import { createFileRoute } from "@tanstack/react-router";
import { openApiSpec as spec } from "@/lib/openapi-spec";

export const Route = createFileRoute("/api/public/openapi.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(spec), {
          headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
        }),
    },
  },
});
