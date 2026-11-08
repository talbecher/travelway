import { createFileRoute } from "@tanstack/react-router";

const sections = ["itinerary", "saved_places", "reservations", "hotels", "expenses", "checklist", "documents"];
const err = (d: string) => ({ description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

const spec = {
  openapi: "3.1.0",
  info: {
    title: "TravelWay trip context",
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
    "/api/public/day-proposals": {
      post: {
        operationId: "proposeDayReplacement",
        summary: "Save a proposal to replace one day's plan (nothing changes until the user approves in TravelWay)",
        description: "Requires a trip-scoped token with the 'submit day proposals' permission. Hotel check-ins and booked stops are always kept. Return review_url to the user; they must open it and approve. Max 40 entries. Proposals expire after 72 hours. כשתחנה מבוססת על תחנה קיימת (גם אם שינית את שמה) או על מקום שמור, העתק את latitude, longitude ו-google_maps_url שלה מ-trip-context. אל תמציא קואורדינטות.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false, required: ["date", "entries"],
            properties: {
              trip_id: { type: "string", format: "uuid" },
              date: { type: "string", format: "date", description: "Day date in the active itinerary." },
              note: { type: "string", maxLength: 2000 },
              entries: { type: "array", minItems: 1, maxItems: 40, items: {
                type: "object", required: ["title", "entry_type"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  entry_type: { type: "string", enum: ["attraction", "food", "transport", "note", "flight", "hotel_checkin"] },
                  time_of_day: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                  location_name: { type: "string" }, description: { type: "string" }, icon_emoji: { type: "string" },
                  latitude: { type: "number", minimum: -90, maximum: 90, description: "Send together with longitude only. Copy from trip-context; never invent." },
                  longitude: { type: "number", minimum: -180, maximum: 180, description: "Send together with latitude only. Copy from trip-context; never invent." },
                  google_maps_url: { type: "string", format: "uri", description: "Copy from trip-context. Only Google Maps links with explicit destination coordinates are kept." },
                },
              } },
            },
          } } },
        },
        responses: {
          "201": { description: "Proposal saved (pending). Includes id, review_url, expires_at.", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          "400": err("Invalid body or entries"),
          "401": err("Missing, invalid, revoked or expired token"),
          "403": err("Token lacks the proposal permission or trip scope"),
          "404": err("Trip or day not available"),
          "413": err("Body too large"),
          "429": err("Too many pending proposals for this trip"),
          "500": err("Unexpected error"),
        },
      },
    },
    "/api/public/checklist-proposals": {
      post: {
        operationId: "proposeChecklistChanges",
        summary: "Save a proposal to add, update or mark checklist tasks done (nothing changes until the user approves in TravelWay)",
        description: "Requires a trip-scoped token with the 'propose checklist changes' permission. Use task ids from getTripContext section=checklist for update/mark_done. Tasks not listed are never touched. Duplicate titles are flagged for the user. Return review_url to the user. Max 50 operations. Proposals expire after 72 hours.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false, required: ["request_id", "operations"],
            properties: {
              request_id: { type: "string", format: "uuid", description: "Unique id you generate for this request. Retrying with the same request_id and payload returns the existing proposal instead of creating a duplicate." },
              trip_id: { type: "string", format: "uuid" },
              note: { type: "string", maxLength: 2000 },
              operations: { type: "array", minItems: 1, maxItems: 50, items: {
                type: "object", required: ["op"],
                properties: {
                  op: { type: "string", enum: ["add", "update", "mark_done"] },
                  id: { type: "string", format: "uuid", description: "Required for update and mark_done." },
                  title: { type: "string", maxLength: 200, description: "Required for add." },
                  category: { type: "string", enum: ["documents", "money", "bookings", "transport", "health", "tech", "packing", "departure", "other"] },
                  priority: { type: "string", enum: ["high", "normal", "low"] },
                  due_date: { type: ["string", "null"], format: "date" },
                  notes: { type: ["string", "null"], maxLength: 2000 },
                  is_done: { type: "boolean", description: "update/mark_done only." },
                },
              } },
            },
          } } },
        },
        responses: {
          "201": { description: "Proposal saved (pending).", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" }, status: { type: "string" }, expires_at: { type: "string" },
              operation_count: { type: "integer" }, review_url: { type: "string" }, message: { type: "string" },
            },
          } } } },
          "400": err("Invalid body or operations"),
          "401": err("Missing, invalid, revoked or expired token"),
          "403": err("Token lacks the checklist proposal permission or trip scope"),
          "404": err("Trip or task not available"),
          "413": err("Body too large"),
          "429": err("Too many pending proposals for this trip"),
          "500": err("Unexpected error"),
        },
      },
    },
    "/api/public/document-proposals": {
      post: {
        operationId: "proposeDocumentChanges",
        summary: "Save a proposal to add or update a trip document (nothing changes until the user approves in TravelWay)",
        description: "Requires a trip-scoped token with the 'propose documents' permission. Omit target_document_id to add a new document; send it to update an existing one (use document ids from getTripContext section=documents). Never deletes anything. This action NEVER receives files: if the document needs a PDF or image, set wants_file=true and tell the user to attach the file on the review page before approving. Return review_url to the user; they must open it and approve. Updating details only keeps the existing file; replacing a file keeps the previous one as a prior version. Proposals expire after 72 hours.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false, required: ["request_id", "fields"],
            properties: {
              request_id: { type: "string", format: "uuid", description: "Unique id you generate for this request. Retrying with the same request_id and payload returns the existing proposal instead of creating a duplicate." },
              trip_id: { type: "string", format: "uuid" },
              target_document_id: { type: ["string", "null"], format: "uuid", description: "Omit or null to add a new document." },
              wants_file: { type: "boolean", description: "True when the document should have a PDF/image attached. The user attaches it in the app; the chat never sends files." },
              note: { type: "string", maxLength: 2000 },
              fields: {
                type: "object", additionalProperties: false,
                properties: {
                  title: { type: "string", maxLength: 200, description: "Required when adding." },
                  type: { type: "string", enum: ["flight", "hotel", "attraction", "insurance", "visa", "transport", "other"] },
                  valid_date: { type: ["string", "null"], format: "date" },
                  notes: { type: ["string", "null"], maxLength: 2000 },
                  external_url: { type: ["string", "null"], maxLength: 2000, description: "http/https link, e.g. a booking confirmation page." },
                  linked_recommendation_id: { type: ["string", "null"], format: "uuid", description: "A recommendation id from the same trip (getTripContext section=saved_places)." },
                },
              },
            },
          } } },
        },
        responses: {
          "201": { description: "Proposal saved (pending).", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" }, status: { type: "string" }, expires_at: { type: "string" },
              review_url: { type: "string" }, message: { type: "string" },
            },
          } } } },
          "400": err("Invalid body or fields"),
          "401": err("Missing, invalid, revoked or expired token"),
          "403": err("Token lacks the documents proposal permission or trip scope"),
          "404": err("Trip, document or recommendation not available"),
          "409": err("request_id reused with a different payload"),
          "413": err("Body too large"),
          "429": err("Too many pending proposals for this trip"),
          "500": err("Unexpected error"),
        },
      },
    },
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
          "403": err("trip_id outside the token's trip scope, or a checklist-only token asking for other data"),
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
