// Token-authenticated creation of itinerary-item and expense proposals. Server only.
// Authorization, ownership, protection, location resolution and currency conversion are enforced
// in api_create_itinerary_proposal / api_create_expense_proposal. Nothing is applied here.
import { z } from "zod";
import { hashToken } from "./trip-context.server";

const TOKEN_RE = /^twpat_[A-Za-z0-9_-]{43}$/;
const MAX_BODY = 64 * 1024;
export const MAX_ITEM_OPS = 10;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const ENTRY_TYPES = ["attraction", "food", "transport", "note", "flight"] as const;
const entryFields = {
  entry_type: z.enum(ENTRY_TYPES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  time_of_day: TIME.nullable().optional(),
  location_name: z.string().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  google_maps_url: z.string().url().max(2000).nullable().optional(),
  source_saved_place_id: z.string().uuid().optional(),
};
export const itineraryOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), date: DATE, ...entryFields, entry_type: z.enum(ENTRY_TYPES), title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ op: z.literal("update"), id: z.string().uuid(), ...entryFields, location_decision: z.enum(["keep", "clear"]).optional() }).strict(),
]);

const CATEGORIES = ["food", "attraction", "transport", "shopping", "accommodation", "other"] as const;
const expenseFields = {
  date: DATE.optional(),
  category: z.enum(CATEGORIES).optional(),
  description: z.string().max(500).nullable().optional(),
  location_name: z.string().max(300).nullable().optional(),
  amount: z.number().positive().max(1e9).optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
};
export const expenseOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), ...expenseFields, date: DATE, category: z.enum(CATEGORIES), amount: z.number().positive().max(1e9), currency: z.string().regex(/^[A-Za-z]{3}$/) }).strict(),
  z.object({ op: z.literal("update"), id: z.string().uuid(), ...expenseFields }).strict(),
]);

const body = <T extends z.ZodTypeAny>(op: T) =>
  z.object({
    request_id: z.string().uuid(),
    trip_id: z.string().uuid().optional(),
    note: z.string().max(2000).optional(),
    operations: z.array(op).min(1).max(MAX_ITEM_OPS),
  }).strict();
export const itineraryBody = body(itineraryOp);
export const expenseBody = body(expenseOp);

const STATUS_MAP: Record<string, [number, string]> = {
  invalid: [401, "unauthorized"], revoked: [401, "unauthorized"], expired: [401, "unauthorized"],
  missing_trip: [403, "forbidden"], scope_mismatch: [403, "forbidden"], missing_scope: [403, "forbidden"],
  no_access: [404, "not_found"], item_not_found: [404, "item_not_found"], day_not_found: [404, "day_not_found"],
  no_active_version: [404, "no_active_version"], protected_item: [409, "protected_item"],
  no_valid_rate: [422, "no_valid_exchange_rate"],
  invalid_ops: [400, "invalid_operations"], idempotency_conflict: [409, "request_id_reused_with_different_payload"],
  quota_exceeded: [429, "too_many_pending_proposals"],
};

const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

async function handle(request: Request, kind: "itinerary" | "expenses"): Promise<Response> {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!TOKEN_RE.test(raw)) return json(401, { error: "unauthorized" });
    if (new URL(request.url).search) return json(400, { error: "bad_request" });
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) return json(413, { error: "payload_too_large" });
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { error: "payload_too_large" });
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return json(400, { error: "bad_request" }); }
    const b = (kind === "itinerary" ? itineraryBody : expenseBody).safeParse(parsed);
    if (!b.success) return json(400, { error: "bad_request", detail: b.error.issues[0]?.path.join(".") });
    const ops = b.data.operations.map((o) => {
      const s = strip(o as Record<string, unknown>);
      if (typeof s.currency === "string") s.currency = s.currency.toUpperCase();
      return s;
    });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const fn = kind === "itinerary" ? "api_create_itinerary_proposal" : "api_create_expense_proposal";
    const { data, error } = await db.rpc(fn, {
      _hash: hashToken(raw),
      _trip_id: (b.data.trip_id ?? null) as never,
      _request_id: b.data.request_id,
      _ops: ops as never,
      _note: (b.data.note ?? null) as never,
    });
    if (error) {
      console.error(`[${kind}-proposals] server_error`);
      return json(500, { error: "server_error" });
    }
    const r = data as { status: string; id?: string; expires_at?: string; reason?: string; replayed?: boolean };
    if (r.status !== "ok") {
      const [s, code] = STATUS_MAP[r.status] ?? [500, "server_error"];
      return json(s, { error: code, ...(r.reason ? { reason: r.reason } : {}) });
    }
    const origin = new URL(request.url).origin;
    return json(r.replayed ? 200 : 201, {
      id: r.id, status: "pending", replayed: !!r.replayed, expires_at: r.expires_at, operation_count: ops.length,
      review_url: `${origin}/item-proposals/${r.id}`,
      message: "Proposal saved. Nothing changed yet — the user must open review_url and approve it in TravelWay.",
    });
  } catch {
    console.error(`[${kind}-proposals] server_error`);
    return json(500, { error: "server_error" });
  }
}

export const handleCreateItineraryProposal = (r: Request) => handle(r, "itinerary");
export const handleCreateExpenseProposal = (r: Request) => handle(r, "expenses");
