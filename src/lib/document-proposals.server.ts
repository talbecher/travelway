// Token-authenticated creation of a document proposal. Server only.
// Authorization (upload_documents scope, trip scope, target ∈ trip, quota) and value validation are
// enforced in api_create_document_proposal; this module shapes input and maps results.
// The file itself is NEVER sent through this API — the user attaches it in the app review page.
import { z } from "zod";
import { hashToken } from "./trip-context.server";

const TOKEN_RE = /^twpat_[A-Za-z0-9_-]{43}$/;
const MAX_BODY = 32 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const fieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    type: z.enum(["flight", "hotel", "attraction", "insurance", "visa", "transport", "other"]).optional(),
    valid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    external_url: z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i).nullable().optional(),
    linked_recommendation_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const bodySchema = z
  .object({
    request_id: z.string().uuid(),
    trip_id: z.string().uuid().optional(),
    target_document_id: z.string().uuid().nullable().optional(),
    fields: fieldsSchema,
    wants_file: z.boolean().default(false),
    note: z.string().max(2000).optional(),
  })
  .strict();

const STATUS_MAP: Record<string, [number, string]> = {
  revoked: [401, "unauthorized"], expired: [401, "unauthorized"],
  missing_trip: [403, "forbidden"], scope_mismatch: [403, "forbidden"], missing_scope: [403, "forbidden"],
  no_access: [404, "not_found"], document_not_found: [404, "document_not_found"],
  recommendation_not_found: [404, "recommendation_not_found"],
  idempotency_conflict: [409, "request_id_reused_with_different_payload"],
  quota_exceeded: [429, "too_many_pending_proposals"],
};

export async function handleCreateDocumentProposal(request: Request): Promise<Response> {
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

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data, error } = await db.rpc("api_create_document_proposal", {
      _hash: hashToken(raw),
      _trip_id: (b.data.trip_id ?? null) as never,
      _request_id: b.data.request_id,
      _target: (b.data.target_document_id ?? null) as never,
      _fields: b.data.fields as never,
      _wants_file: b.data.wants_file,
      _note: (b.data.note ?? null) as never,
    });
    if (error) {
      console.error("[document-proposals] server_error");
      return json(500, { error: "server_error" });
    }
    const r = data as { status: string; id?: string; expires_at?: string; reason?: string; replayed?: boolean };
    if (r.status !== "ok") {
      if (r.status === "invalid") {
        return r.reason ? json(400, { error: "invalid_fields", reason: r.reason }) : json(401, { error: "unauthorized" });
      }
      const [s, code] = STATUS_MAP[r.status] ?? [500, "server_error"];
      return json(s, { error: code });
    }
    const origin = new URL(request.url).origin;
    return json(r.replayed ? 200 : 201, {
      id: r.id, status: "pending", replayed: !!r.replayed, expires_at: r.expires_at,
      review_url: `${origin}/document-proposals/${r.id}`,
      message: b.data.wants_file
        ? "Proposal saved. Nothing changed yet — the user must open review_url, attach the file there, and approve in TravelWay."
        : "Proposal saved. Nothing changed yet — the user must open review_url and approve it in TravelWay.",
    });
  } catch {
    console.error("[document-proposals] server_error");
    return json(500, { error: "server_error" });
  }
}
