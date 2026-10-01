import { createFileRoute } from "@tanstack/react-router";

const sections = ["itinerary", "saved_places", "reservations", "hotels", "expenses", "checklist", "documents"];
const err = (d: string) => ({ description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

const spec = {
  openapi: "3.1.0",
  info: {
    title: "TravelWay trip context (read-only)",
    version: "1.0",
    description:
      "Read-only view of one trip. Trip-scoped tokens may omit trip_id (a different trip_id returns 403). Tokens without a trip scope must send trip_id (400 otherwise). Access is re-checked on every call: the token owner must currently own the trip or have it shared. Full-trip mode returns complete days and summaries; lists marked items_included:false must be fetched with section=<use_section>, paginated with pagination.next_cursor.",
  },
  servers: [{ url: "https://travelway.lovable.app" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Personal access token (twpat_…)" } },
    schemas: { Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] } },
  },
  security: [{ bearer: [] }],
  paths: {
    "/api/public/trip-context": {
      get: {
        operationId: "getTripContext",
        summary: "Get the current state of a trip",
        parameters: [
          { name: "trip_id", in: "query", schema: { type: "string", format: "uuid" }, description: "Required unless the token is scoped to one trip." },
          { name: "section", in: "query", schema: { type: "string", enum: sections }, description: "Return one paginated section instead of the full trip." },
          { name: "date", in: "query", schema: { type: "string", format: "date" }, description: "Only with section=itinerary." },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 }, description: "Exact, case-insensitive. Only with section=saved_places or hotels." },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 }, description: "Only with section (not expenses)." },
          { name: "cursor", in: "query", schema: { type: "string" }, description: "pagination.next_cursor from the previous page; bound to the same trip, section and filters." },
        ],
        responses: {
          "200": {
            description: "Trip context. Always includes schema_version (\"1.0\"), generated_at (RFC3339) and trip.",
            content: { "application/json": { schema: { type: "object", additionalProperties: true, required: ["schema_version", "generated_at", "trip"] } } },
          },
          "400": err("Invalid parameters, missing trip_id, or invalid cursor"),
          "401": err("Missing, invalid, revoked or expired token"),
          "403": err("trip_id outside the token's trip scope"),
          "404": err("Trip not available"),
          "500": err("Unexpected error"),
        },
      },
    },
  },
};

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
