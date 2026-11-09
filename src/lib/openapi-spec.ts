// Single source for the GPT Actions OpenAPI document (served by /api/public/openapi.json and exported to docs/).
const sections = ["itinerary", "saved_places", "reservations", "hotels", "expenses", "expense_items", "checklist", "documents"];
const err = (d: string) => ({ description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "TravelWay trip context",
    version: "1.0",
    description: "Trip read API plus proposal actions. Proposals change nothing until the user approves them in TravelWay.",
  },
  servers: [{ url: "https://travelway.lovable.app" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Personal access token (twpat_…)" } },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" }, reason: { type: "string" } }, required: ["error"] },
      ProposalCreated: { type: "object", properties: {
        id: { type: "string" }, status: { type: "string" }, replayed: { type: "boolean" }, expires_at: { type: "string" },
        operation_count: { type: "integer" }, review_url: { type: "string" }, message: { type: "string" },
      } },
    },
  },
  security: [{ bearer: [] }],
  paths: {
    "/api/public/day-proposals": {
      post: {
        operationId: "proposeDayReplacement",
        summary: "Save a proposal to replace one day's plan (nothing changes until the user approves in TravelWay)",
        description: "Booked stops and check-ins are kept. Max 40 entries. Return review_url for approval. For a saved place prefer source_saved_place_id. כשתחנה מבוססת על תחנה קיימת (גם אם שינית את שמה) או על מקום שמור, העתק את latitude, longitude ו-google_maps_url שלה מ-trip-context. אל תמציא קואורדינטות.",
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
                  source_saved_place_id: { type: "string", format: "uuid", description: "Preferred. id of a saved place (getTripContext section=saved_places) this stop is based on, even if renamed. TravelWay copies its saved location; latitude/longitude/google_maps_url are then ignored. Unknown ids reject the proposal." },
                  latitude: { type: "number", minimum: -90, maximum: 90, description: "Send together with longitude only. Copy from trip-context; never invent." },
                  longitude: { type: "number", minimum: -180, maximum: 180, description: "Send together with latitude only. Copy from trip-context; never invent." },
                  google_maps_url: { type: "string", format: "uri", description: "Copy from trip-context. Only Google Maps links with explicit destination coordinates are kept." },
                },
              } },
            },
          } } },
        },
        responses: {
          "201": { description: "Proposal saved (pending).", content: { "application/json": { schema: {
            type: "object",
            properties: {
              id: { type: "string" }, status: { type: "string" }, date: { type: "string" }, day_number: { type: "integer" },
              expires_at: { type: "string" }, entry_count: { type: "integer" }, review_url: { type: "string" }, message: { type: "string" },
            },
          } } } },
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
        description: "Trip-scoped token with checklist-proposal permission. Use task ids from getTripContext section=checklist for update/mark_done. Unlisted tasks are never touched. Duplicates are flagged. Max 50 operations, expires in 72h. Return review_url for approval.",
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
        description: "Trip-scoped token with document-proposal permission. Omit target_document_id to add; send it (from section=documents) to update. Never deletes. Never receives files: set wants_file=true and tell the user to attach it on the review page. Return review_url for approval. Expires in 72h.",
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
    "/api/public/itinerary-proposals": {
      post: {
        operationId: "proposeItineraryChanges",
        summary: "Save a proposal to add or update individual itinerary stops (nothing changes until the user approves in TravelWay)",
        description: "Max 10 ops. add needs date; update needs an item id from section=itinerary and patches only sent fields. No delete/move; booked and hotel stops are rejected. Prefer source_saved_place_id. Renaming a located stop needs a location or location_decision. Return review_url.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false, required: ["request_id", "operations"],
            properties: {
              request_id: { type: "string", format: "uuid", description: "Unique id you generate. Same id + same payload returns the existing proposal; a different payload is rejected." },
              trip_id: { type: "string", format: "uuid" },
              note: { type: "string", maxLength: 2000 },
              operations: { type: "array", minItems: 1, maxItems: 10, items: {
                type: "object", required: ["op"],
                properties: {
                  op: { type: "string", enum: ["add", "update"] },
                  id: { type: "string", format: "uuid", description: "update only: item id from getTripContext section=itinerary." },
                  date: { type: "string", format: "date", description: "add only: a day in the active itinerary." },
                  entry_type: { type: "string", enum: ["attraction", "food", "transport", "note", "flight"], description: "Required for add." },
                  title: { type: "string", maxLength: 200, description: "Required for add." },
                  description: { type: ["string", "null"], maxLength: 2000 },
                  time_of_day: { type: ["string", "null"], pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
                  location_name: { type: ["string", "null"], maxLength: 300 },
                  source_saved_place_id: { type: "string", format: "uuid", description: "Preferred. Saved place id (section=saved_places); TravelWay copies its saved location. Unknown ids reject the proposal." },
                  latitude: { type: "number", minimum: -90, maximum: 90, description: "With longitude only. Copy from trip-context; never invent." },
                  longitude: { type: "number", minimum: -180, maximum: 180, description: "With latitude only. Copy from trip-context; never invent." },
                  google_maps_url: { type: ["string", "null"], format: "uri", description: "Google Maps links only." },
                  location_decision: { type: "string", enum: ["keep", "clear"], description: "update only, when changing title/location_name without a new location: keep the old location or clear it." },
                },
              } },
            },
          } } },
        },
        responses: {
          "201": { description: "Proposal saved (pending).", content: { "application/json": { schema: { $ref: "#/components/schemas/ProposalCreated" } } } },
          "200": { description: "Replay of an existing proposal (same request_id and payload).", content: { "application/json": { schema: { $ref: "#/components/schemas/ProposalCreated" } } } },
          "400": err("Invalid body or operations (reason explains)"),
          "401": err("Missing, invalid, revoked or expired token"),
          "403": err("Token lacks the itinerary proposal permission or trip scope"),
          "404": err("Trip, day, item or active itinerary not available"),
          "409": err("Protected stop, or request_id reused with a different payload"),
          "413": err("Body too large"),
          "429": err("Too many pending proposals for this trip"),
          "500": err("Unexpected error"),
        },
      },
    },
    "/api/public/expense-proposals": {
      post: {
        operationId: "proposeExpenseChanges",
        summary: "Save a proposal to add or update expenses (nothing changes until the user approves in TravelWay)",
        description: "Max 10 ops. update needs an id from section=expense_items and patches only sent fields. Send amount with currency as paid; never convert yourself. TravelWay converts with the trip's manual rate or rejects (422). No delete or budget changes. Return review_url.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false, required: ["request_id", "operations"],
            properties: {
              request_id: { type: "string", format: "uuid", description: "Unique id you generate. Same id + same payload returns the existing proposal; a different payload is rejected." },
              trip_id: { type: "string", format: "uuid" },
              note: { type: "string", maxLength: 2000 },
              operations: { type: "array", minItems: 1, maxItems: 10, items: {
                type: "object", required: ["op"],
                properties: {
                  op: { type: "string", enum: ["add", "update"] },
                  id: { type: "string", format: "uuid", description: "update only: expense id from section=expense_items." },
                  date: { type: "string", format: "date", description: "Required for add." },
                  category: { type: "string", enum: ["food", "attraction", "transport", "shopping", "accommodation", "other"], description: "Required for add." },
                  description: { type: ["string", "null"], maxLength: 500 },
                  location_name: { type: ["string", "null"], maxLength: 300 },
                  amount: { type: "number", exclusiveMinimum: 0, description: "Amount as paid. Send with currency. Required for add." },
                  currency: { type: "string", pattern: "^[A-Za-z]{3}$", description: "ISO code of amount: the trip base or target currency." },
                },
              } },
            },
          } } },
        },
        responses: {
          "201": { description: "Proposal saved (pending).", content: { "application/json": { schema: { $ref: "#/components/schemas/ProposalCreated" } } } },
          "200": { description: "Replay of an existing proposal (same request_id and payload).", content: { "application/json": { schema: { $ref: "#/components/schemas/ProposalCreated" } } } },
          "400": err("Invalid body or operations (reason explains)"),
          "401": err("Missing, invalid, revoked or expired token"),
          "403": err("Token lacks the expense proposal permission or trip scope"),
          "404": err("Trip or expense not available"),
          "409": err("request_id reused with a different payload"),
          "413": err("Body too large"),
          "422": err("No valid exchange rate for this currency"),
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
          { name: "section", in: "query", schema: { type: "string", enum: sections }, description: "Return one paginated section instead of the full trip. expense_items lists expenses with ids, amount_base (in currency.base_currency) and original amount/currency." },
          { name: "date", in: "query", schema: { type: "string", format: "date" }, description: "Only with section=itinerary." },
          { name: "city", in: "query", schema: { type: "string", maxLength: 100 }, description: "Exact, case-insensitive. Only with section=saved_places or hotels." },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 }, description: "Only with section (not expenses)." },
          { name: "cursor", in: "query", schema: { type: "string" }, description: "pagination.next_cursor from the previous page; bound to the same trip, section and filters." },
        ],
        responses: {
          "200": {
            description: "Trip context. Always includes schema_version (\"1.0\"), generated_at (RFC3339) and trip.",
            content: { "application/json": { schema: {
              type: "object", additionalProperties: true, required: ["schema_version", "generated_at", "trip"],
              properties: {
                schema_version: { type: "string" }, generated_at: { type: "string" },
                trip: { type: "object", additionalProperties: true, properties: { id: { type: "string" }, title: { type: "string" } } },
              },
            } } },
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

