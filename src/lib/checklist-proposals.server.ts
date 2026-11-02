// Token-authenticated creation of a checklist proposal. Server only.
// Authorization (scope, trip, item ∈ trip, limits, quota) and value validation are enforced in
// api_create_checklist_proposal; this module shapes input and maps results. Nothing is applied here.
import { z } from "zod";
import { hashToken } from "./trip-context.server";
import { CATEGORY_ALIASES } from "./checklist-import";

const TOKEN_RE = /^twpat_[A-Za-z0-9_-]{43}$/;
const MAX_BODY = 64 * 1024;
export const MAX_CHECKLIST_OPS = 50;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const fields = {
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(40).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};
const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), ...fields, title: z.string().trim().min(1).max(200) }).strict(),
  z.object({ op: z.literal("update"), id: z.string().uuid(), ...fields, is_done: z.boolean().optional() }).strict(),
  z.object({ op: z.literal("mark_done"), id: z.string().uuid(), is_done: z.boolean().optional() }).strict(),
]);
const bodySchema = z.object({
  request_id: z.string().uuid(),
  trip_id: z.string().uuid().optional(),
  note: z.string().max(2000).optional(),
  operations: z.array(opSchema).min(1).max(MAX_CHECKLIST_OPS),
}).strict();

type InOp = z.infer<typeof opSchema>;

/** Maps API ops to the stored contract: add|update, known category aliases, mark_done → is_done. */
export function normalizeChecklistOps(ops: InOp[]): Record<string, unknown>[] {
  return ops.map((o) => {
    if (o.op === "mark_done") return { op: "update", id: o.id, is_done: o.is_done ?? true };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
    if (typeof out.category === "string") {
      const c = (out.category as string).toLowerCase();
      out.category = CATEGORY_ALIASES[c] ?? c;
    }
    return out;
  });
}

const STATUS_MAP: Record<string, [number, string]> = {
  invalid: [401, "unauthorized"], revoked: [401, "unauthorized"], expired: [401, "unauthorized"],
  missing_trip: [403, "forbidden"], scope_mismatch: [403, "forbidden"], missing_scope: [403, "forbidden"],
  no_access: [404, "not_found"], item_not_found: [404, "item_not_found"],
  invalid_ops: [400, "invalid_operations"], idempotency_conflict: [409, "request_id_reused_with_different_payload"], quota_exceeded: [429, "too_many_pending_proposals"],
};

export async function handleCreateChecklistProposal(request: Request): Promise<Response> {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!TOKEN_RE.test(raw)) return json(401, { error: "unauthorized" });
    if (new URL(request.url).search) return json(400, { error: "bad_request" });
    const len = Number(request.headers.get("content-length") ?? "0");
    if (len > MAX_BODY) return json(413, { error: "payload_too_large" });
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { error: "payload_too_large" });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json(400, { error: "bad_request" }); }
    const b = bodySchema.safeParse(body);
    if (!b.success) return json(400, { error: "bad_request", detail: b.error.issues[0]?.path.join(".") });

    const ops = normalizeChecklistOps(b.data.operations);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data, error } = await db.rpc("api_create_checklist_proposal", {
      _hash: hashToken(raw),
      _trip_id: (b.data.trip_id ?? null) as never,
      _ops: ops as never,
      _note: (b.data.note ?? null) as never,
      _request_id: b.data.request_id,
    });
    if (error) {
      console.error("[checklist-proposals] server_error");
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
      review_url: `${origin}/checklist-proposals/${r.id}`,
      message: "Proposal saved. Nothing changed yet — the user must open review_url and approve it in TravelWay.",
    });
  } catch {
    console.error("[checklist-proposals] server_error");
    return json(500, { error: "server_error" });
  }
}
