// Token-authenticated creation of a single-day replace proposal. Server only.
// Authorization (scope, trip, day ∈ trip, limits, quota) is enforced in api_create_day_proposal;
// this module only shapes input and maps results. Nothing is applied here.
import { z } from "zod";
import { hashToken } from "./trip-context.server";
import { parseAIResponse } from "./ai-import";
import { explicitMapsCoordinates } from "./day-location";

const TOKEN_RE = /^twpat_[A-Za-z0-9_-]{43}$/;
const MAX_BODY = 64 * 1024;
export const MAX_PROPOSAL_ENTRIES = 40;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const bodySchema = z.object({
  trip_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional(),
  entries: z.array(z.unknown()).min(1).max(MAX_PROPOSAL_ENTRIES),
}).strict();

export type ProposalEntry = {
  entry_type: string; title: string; time_of_day: string | null;
  location_name: string | null; description: string | null; icon_emoji: string | null;
  latitude?: number; longitude?: number; google_maps_url?: string; source_saved_place_id?: string;
};

type ProposalLocation = { latitude?: number; longitude?: number; google_maps_url?: string; source_saved_place_id?: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Optional explicit location from the chat. Coordinates must be a complete finite in-range pair
 * (otherwise the proposal is rejected); a Maps URL is kept only when it names explicit destination
 * coordinates (otherwise it is dropped and the stop shows as missing).
 */
export function proposalLocation(raw: unknown): ProposalLocation | null {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  // Saved place id: the server resolves it in the token's trip and its location is authoritative,
  // so any supplied location is dropped. A malformed id rejects the proposal (never falls back).
  if (r.source_saved_place_id !== undefined) {
    const sid = r.source_saved_place_id;
    return typeof sid === "string" && UUID_RE.test(sid) ? { source_saved_place_id: sid.toLowerCase() } : null;
  }
  const out: ProposalLocation = {};
  const hasLat = r.latitude !== undefined && r.latitude !== null;
  const hasLng = r.longitude !== undefined && r.longitude !== null;
  if (hasLat || hasLng) {
    const lat = r.latitude, lng = r.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    out.latitude = lat; out.longitude = lng;
  }
  const url = r.google_maps_url;
  if (typeof url === "string" && url.trim().startsWith("https://") && url.length <= 2000 && explicitMapsCoordinates(url)) {
    out.google_maps_url = url.trim();
  }
  return out;
}

/** Reuses the existing day-mode parser; returns only fields of the existing entry contract. */
export function normalizeProposalEntries(entries: unknown[]): { entries: ProposalEntry[]; skipped: number } {
  const parsed = parseAIResponse(JSON.stringify({ version: 1, itinerary: [{ day_number: 1, entries }] }), [1]);
  const locations = entries.map(proposalLocation);
  if (locations.some((l) => l === null) || parsed.entries.length !== entries.length) {
    return { entries: [], skipped: Math.max(1, parsed.skipped) };
  }
  return {
    entries: parsed.entries.map((e, i) => ({
      entry_type: e.entry_type, title: e.title, time_of_day: e.time_of_day,
      location_name: e.location_name, description: e.description, icon_emoji: e.icon_emoji,
      ...locations[i],
    })),
    skipped: parsed.skipped,
  };
}

const STATUS_MAP: Record<string, [number, string]> = {
  invalid: [401, "unauthorized"], revoked: [401, "unauthorized"], expired: [401, "unauthorized"],
  missing_trip: [403, "forbidden"], scope_mismatch: [403, "forbidden"], missing_scope: [403, "forbidden"],
  no_access: [404, "not_found"], day_not_found: [404, "day_not_found"],
  invalid_entries: [400, "invalid_entries"], quota_exceeded: [429, "too_many_pending_proposals"],
};

export async function handleCreateProposal(request: Request): Promise<Response> {
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
    if (!b.success) return json(400, { error: "bad_request" });

    const { entries, skipped } = normalizeProposalEntries(b.data.entries);
    if (!entries.length || skipped > 0) return json(400, { error: "invalid_entries", skipped });

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data, error } = await db.rpc("api_create_day_proposal", {
      _hash: hashToken(raw),
      _trip_id: (b.data.trip_id ?? null) as never,
      _date: b.data.date,
      _entries: entries as never,
      _note: (b.data.note ?? null) as never,
    });
    if (error) {
      console.error("[day-proposals] server_error");
      return json(500, { error: "server_error" });
    }
    const r = data as { status: string; id?: string; expires_at?: string; date?: string; day_number?: number };
    if (r.status !== "ok") {
      const [s, code] = STATUS_MAP[r.status] ?? [500, "server_error"];
      return json(s, { error: code });
    }
    const origin = new URL(request.url).origin;
    return json(201, {
      id: r.id, status: "pending", date: r.date, day_number: r.day_number, expires_at: r.expires_at,
      entry_count: entries.length,
      review_url: `${origin}/day-proposals/${r.id}`,
      message: "Proposal saved. Nothing changed yet — the user must open review_url and approve it in TravelWay.",
    });
  } catch {
    console.error("[day-proposals] server_error");
    return json(500, { error: "server_error" });
  }
}
