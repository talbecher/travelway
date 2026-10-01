// Read-only AI trip-context API. Server only.
// Every read goes through api_resolve_token (token validity + scope + live trip access),
// then is filtered by the verified trip id (and active version for itinerary data).
import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SCHEMA_VERSION = "1.0";
const SECTIONS = ["itinerary", "saved_places", "reservations", "hotels", "expenses", "checklist", "documents"] as const;
type Section = (typeof SECTIONS)[number];
const ALLOWED_PARAMS = new Set(["trip_id", "section", "date", "city", "limit", "cursor"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_RE = /^twpat_[A-Za-z0-9_-]{43}$/;
const FULL_ITEMS_MAX = 300;
const FULL_HOTELS_MAX = 50;
const PAGE = 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
export const apiError = (status: number, code: string) => json(status, { error: code });

class ApiFail extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

// ---- cursors (HMAC-signed, bound to user/trip/section/filters) ----
type CursorBody = { u: string; t: string; s: string; f: string; k: unknown[] };
function cursorKey(): string {
  const k = process.env["API_CURSOR_SECRET"];
  if (!k) throw new ApiFail(500, "server_error");
  return k;
}
function sign(payload: string) {
  return createHmac("sha256", cursorKey()).update(payload).digest("base64url");
}
function encodeCursor(c: CursorBody): string {
  const p = Buffer.from(JSON.stringify(c)).toString("base64url");
  return `${p}.${sign(p)}`;
}
function decodeCursor(raw: string, expect: Omit<CursorBody, "k">): unknown[] {
  const [p, s] = raw.split(".");
  if (!p || !s) throw new ApiFail(400, "bad_request");
  const a = Buffer.from(sign(p)); const b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiFail(400, "bad_request");
  let c: CursorBody;
  try { c = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { throw new ApiFail(400, "bad_request"); }
  if (c.u !== expect.u || c.t !== expect.t || c.s !== expect.s || c.f !== expect.f || !Array.isArray(c.k)) {
    throw new ApiFail(400, "bad_request");
  }
  return c.k;
}

// ---- DTO mappers (stable external contract, never raw rows) ----
type Rec = Record<string, any>;
const recDto = (r: Rec) => ({
  id: r.id, name: r.name, type: r.type, city: r.city, address: r.address, status: r.status,
  latitude: r.latitude, longitude: r.longitude, google_maps_url: r.google_maps_url, notes: r.notes,
  user_rating: r.rating, google_rating: r.google_rating, google_rating_count: r.google_rating_count,
  booking: { status: r.booking_status ?? "none", deadline: r.booking_deadline, time: r.booking_time, note: r.booking_note },
});
const REC_COLS = "id,name,type,city,address,status,latitude,longitude,google_maps_url,notes,rating,google_rating,google_rating_count,booking_status,booking_deadline,booking_time,booking_note,created_at";
const hotelDto = (h: Rec) => ({
  id: h.id, name: h.hotel_name, type: h.type, city: h.city, address: h.address,
  checkin_date: h.checkin_date, checkout_date: h.checkout_date, latitude: h.latitude, longitude: h.longitude,
  google_maps_url: h.google_maps_url, booking_platform: h.booking_platform,
  cancellation_deadline: h.cancellation_deadline, total_cost_ils: h.total_cost_ils, notes: h.notes,
});
const HOTEL_COLS = "id,hotel_name,type,city,address,checkin_date,checkout_date,latitude,longitude,google_maps_url,booking_platform,cancellation_deadline,total_cost_ils,notes,created_at";
const itemDto = (e: Rec) => ({
  id: e.id, date: e.day_date, type: e.entry_type, title: e.title, description: e.description,
  time_of_day: e.time_of_day, location_name: e.location_name, latitude: e.latitude, longitude: e.longitude,
  google_maps_url: e.google_maps_url, linked_saved_place_id: e.linked_recommendation_id, linked_hotel_id: e.linked_hotel_id,
});
const checklistDto = (c: Rec) => ({ id: c.id, title: c.title, category: c.category, priority: c.priority, due_date: c.due_date, is_done: c.is_done, notes: c.notes });
const docDto = (d: Rec) => ({ id: d.id, title: d.title, type: d.type, valid_date: d.valid_date, linked_saved_place_id: d.linked_recommendation_id, created_at: d.created_at });

function escLike(s: string) { return s.replace(/[\\%_]/g, (m) => `\\${m}`); }

export async function handleTripContext(request: Request): Promise<Response> {
  try {
    return await run(request);
  } catch (e) {
    if (e instanceof ApiFail) return apiError(e.status, e.code);
    // Never log the error object (could carry request data); code only.
    console.error("[trip-context] server_error");
    return apiError(500, "server_error");
  }
}

async function run(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!TOKEN_RE.test(raw)) throw new ApiFail(401, "unauthorized");

  const url = new URL(request.url);
  for (const k of url.searchParams.keys()) if (!ALLOWED_PARAMS.has(k)) throw new ApiFail(400, "bad_request");
  const p = (k: string) => url.searchParams.get(k)?.trim() || null;
  const tripParam = p("trip_id");
  if (tripParam && !UUID_RE.test(tripParam)) throw new ApiFail(400, "bad_request");
  const sectionRaw = p("section");
  if (sectionRaw && !SECTIONS.includes(sectionRaw as Section)) throw new ApiFail(400, "bad_request");
  const section = sectionRaw as Section | null;
  const date = p("date");
  if (date && (!DATE_RE.test(date) || section !== "itinerary")) throw new ApiFail(400, "bad_request");
  const city = p("city");
  if (city && (city.length > 100 || (section !== "saved_places" && section !== "hotels"))) throw new ApiFail(400, "bad_request");
  const limitRaw = p("limit");
  const cursorRaw = p("cursor");
  if ((limitRaw || cursorRaw) && !section) throw new ApiFail(400, "bad_request");
  if ((limitRaw || cursorRaw) && (section === "expenses")) throw new ApiFail(400, "bad_request");
  const limit = limitRaw ? Number(limitRaw) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ApiFail(400, "bad_request");

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const { data: res, error: rErr } = await db.rpc("api_resolve_token", { _hash: hashToken(raw), _trip_id: (tripParam ?? null) as any });
  if (rErr) throw new ApiFail(500, "server_error");
  const r = (res as any[])?.[0];
  switch (r?.status) {
    case "ok": break;
    case "missing_trip": throw new ApiFail(400, "trip_id_required");
    case "scope_mismatch": throw new ApiFail(403, "forbidden");
    case "no_access": throw new ApiFail(404, "not_found");
    default: throw new ApiFail(401, "unauthorized");
  }
  const userId: string = r.token_user_id;
  const tripId: string = r.resolved_trip_id;

  const { data: trip, error: tErr } = await db.from("trips")
    .select("id,title,start_date,end_date,destination_country,num_travelers").eq("id", tripId).maybeSingle();
  if (tErr) throw new ApiFail(500, "server_error");
  if (!trip) throw new ApiFail(404, "not_found");

  const base = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    trip: { id: trip.id, name: trip.title, start_date: trip.start_date, end_date: trip.end_date, destination: trip.destination_country, num_travelers: trip.num_travelers },
  };

  const needsVersion = !section || section === "itinerary";
  let version: { id: string; name: string } | null = null;
  if (needsVersion) {
    const { data: vs, error } = await db.from("itinerary_versions").select("id,name").eq("trip_id", tripId).eq("is_active", true).limit(2);
    if (error) throw new ApiFail(500, "server_error");
    version = vs && vs.length === 1 ? vs[0] : null;
  }

  const filtersKey = JSON.stringify({ date, city, limit, v: version?.id ?? null });
  const bind = { u: userId, t: tripId, s: section ?? "", f: filtersKey };
  const after = cursorRaw ? decodeCursor(cursorRaw, bind) : null;

  if (!section) return json(200, { ...base, ...(await fullTrip(db, tripId, version)) });

  const out = await sectionPage(db, section, tripId, version, { date, city, limit, after });
  const next_cursor = out.nextKeys ? encodeCursor({ ...bind, k: out.nextKeys }) : null;
  return json(200, {
    ...base,
    section,
    ...(section === "itinerary" ? { itinerary_version: version, ...(version ? {} : { notice: "no_active_version" }) } : {}),
    ...out.body,
    ...(section === "expenses" ? {} : { pagination: { limit, next_cursor } }),
  });
}

type DB = any;

async function pageAll<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new ApiFail(500, "server_error");
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

async function count(q: any): Promise<number> {
  const { count: c, error } = await q;
  if (error) throw new ApiFail(500, "server_error");
  return c ?? 0;
}

async function expensesSummary(db: DB, tripId: string) {
  const { data: settings } = await db.from("settings").select("base_currency").eq("trip_id", tripId).maybeSingle();
  const baseCur = String(settings?.base_currency ?? "ILS").toUpperCase();
  const rows = await pageAll<Rec>((a, b) => db.from("expenses")
    .select("id,amount_ils,amount_foreign,foreign_currency,category").eq("trip_id", tripId).order("id").range(a, b));
  const byCur: Record<string, number> = {};
  let baseTotal = 0;
  const byCat: Record<string, number> = {};
  let unconverted = 0;
  for (const e of rows) {
    const ils = e.amount_ils == null ? null : Number(e.amount_ils);
    if (baseCur === "ILS" && ils != null && Number.isFinite(ils)) {
      baseTotal += ils;
      byCat[e.category] = (byCat[e.category] ?? 0) + ils;
    } else {
      unconverted++;
    }
    const f = e.amount_foreign == null ? null : Number(e.amount_foreign);
    if (f != null && Number.isFinite(f) && e.foreign_currency) {
      const c = String(e.foreign_currency).toUpperCase();
      byCur[c] = (byCur[c] ?? 0) + f;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    expense_count: rows.length,
    base_currency: baseCur,
    base_total: baseCur === "ILS" ? round(baseTotal) : null,
    base_total_by_category: baseCur === "ILS" ? Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, round(v)])) : null,
    unconverted_count: unconverted,
    original_currency_totals: Object.fromEntries(Object.entries(byCur).map(([k, v]) => [k, round(v)])),
  };
}

async function fullTrip(db: DB, tripId: string, version: { id: string; name: string } | null) {
  // Days: complete (paged past the 1000-row cap).
  const days = version
    ? await pageAll<Rec>((a, b) => db.from("itinerary_days").select("id,date,day_number,city_label,notes")
        .eq("trip_id", tripId).eq("version_id", version.id).order("day_number").order("id").range(a, b))
    : [];
  const itemCount = version
    ? await count(db.from("day_entries").select("id, itinerary_days!inner(trip_id,version_id)", { count: "exact", head: true })
        .eq("itinerary_days.trip_id", tripId).eq("itinerary_days.version_id", version.id))
    : 0;
  let items: Rec[] = [];
  const itemsIncluded = !!version && itemCount <= FULL_ITEMS_MAX;
  if (itemsIncluded && itemCount > 0) {
    const { data, error } = await db.rpc("api_itinerary_items", {
      _trip_id: tripId, _version_id: version!.id, _date: null, _after_date: null, _after_order: null,
      _after_created: null, _after_id: null, _limit: FULL_ITEMS_MAX + 1,
    } as any);
    if (error) throw new ApiFail(500, "server_error");
    items = data ?? [];
  }
  const countByDate: Record<string, number> = {};
  const itemsByDate: Record<string, Rec[]> = {};
  if (version) {
    // Per-day counts come from the same join regardless of inclusion.
    const rows = itemsIncluded ? items : await pageAll<Rec>((a, b) => db.from("day_entries")
      .select("id, itinerary_days!inner(date,trip_id,version_id)")
      .eq("itinerary_days.trip_id", tripId).eq("itinerary_days.version_id", version.id).order("id").range(a, b));
    for (const e of rows) {
      const d = itemsIncluded ? e.day_date : e.itinerary_days.date;
      countByDate[d] = (countByDate[d] ?? 0) + 1;
      if (itemsIncluded) (itemsByDate[d] ??= []).push(itemDto(e));
    }
  }

  const hotelCount = await count(db.from("hotels").select("id", { count: "exact", head: true }).eq("trip_id", tripId));
  const hotelsIncluded = hotelCount <= FULL_HOTELS_MAX;
  let hotels: Rec[] = [];
  if (hotelsIncluded && hotelCount > 0) {
    const { data, error } = await db.from("hotels").select(HOTEL_COLS).eq("trip_id", tripId).order("checkin_date").order("id").limit(FULL_HOTELS_MAX + 1);
    if (error) throw new ApiFail(500, "server_error");
    hotels = data ?? [];
  }

  const recs = await pageAll<Rec>((a, b) => db.from("recommendations").select("type,status,booking_status").eq("trip_id", tripId).order("id").range(a, b));
  const byType: Record<string, number> = {}; const byStatus: Record<string, number> = {};
  let reservations = 0;
  for (const r of recs) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.booking_status && r.booking_status !== "none") reservations++;
  }
  const checklistTotal = await count(db.from("checklist_items").select("id", { count: "exact", head: true }).eq("trip_id", tripId));
  const checklistDone = await count(db.from("checklist_items").select("id", { count: "exact", head: true }).eq("trip_id", tripId).eq("is_done", true));
  const docCount = await count(db.from("documents").select("id", { count: "exact", head: true }).eq("trip_id", tripId));

  return {
    itinerary_version: version,
    ...(version ? {} : { notice: "no_active_version" }),
    itinerary_days: days.map((d) => ({
      date: d.date, day_number: d.day_number, city: d.city_label, notes: d.notes,
      item_count: countByDate[d.date] ?? 0,
      ...(itemsIncluded ? { items: itemsByDate[d.date] ?? [] } : {}),
    })),
    itinerary_items: itemsIncluded
      ? { items_included: true, total: itemCount }
      : { items_included: false, total: itemCount, use_section: "itinerary" },
    hotels: hotelsIncluded
      ? { items_included: true, total: hotelCount, items: hotels.map(hotelDto) }
      : { items_included: false, total: hotelCount, use_section: "hotels" },
    saved_places: { items_included: false, total: recs.length, by_type: byType, by_status: byStatus, use_section: "saved_places" },
    reservations: { items_included: false, total: reservations, use_section: "reservations" },
    expenses_summary: await expensesSummary(db, tripId),
    checklist_summary: { items_included: false, total: checklistTotal, done: checklistDone, open: checklistTotal - checklistDone, use_section: "checklist" },
    documents: { items_included: false, total: docCount, use_section: "documents" },
  };
}

// Keyset (created_at, id) page over a single trip-scoped table.
async function keysetPage(q: any, limit: number, after: unknown[] | null) {
  if (after) {
    const [c, id] = after as [string, string];
    if (typeof c !== "string" || typeof id !== "string" || !UUID_RE.test(id)) throw new ApiFail(400, "bad_request");
    q = q.or(`created_at.gt."${c}",and(created_at.eq."${c}",id.gt.${id})`);
  }
  const { data, error } = await q.order("created_at").order("id").limit(limit + 1);
  if (error) throw new ApiFail(500, "server_error");
  const rows: Rec[] = data ?? [];
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { page, nextKeys: more && last ? [last.created_at, last.id] : null };
}

async function sectionPage(
  db: DB, section: Section, tripId: string, version: { id: string; name: string } | null,
  o: { date: string | null; city: string | null; limit: number; after: unknown[] | null },
): Promise<{ body: Record<string, unknown>; nextKeys: unknown[] | null }> {
  switch (section) {
    case "itinerary": {
      if (!version) return { body: { items: [] }, nextKeys: null };
      const a = o.after as [string, number, string, string] | null;
      if (a && (a.length !== 4 || !DATE_RE.test(String(a[0])) || !UUID_RE.test(String(a[3])))) throw new ApiFail(400, "bad_request");
      const { data, error } = await db.rpc("api_itinerary_items", {
        _trip_id: tripId, _version_id: version.id, _date: o.date,
        _after_date: a?.[0] ?? null, _after_order: a?.[1] ?? null, _after_created: a?.[2] ?? null, _after_id: a?.[3] ?? null,
        _limit: o.limit + 1,
      } as any);
      if (error) throw new ApiFail(500, "server_error");
      const rows: Rec[] = data ?? [];
      const page = rows.slice(0, o.limit);
      const last = page[page.length - 1];
      return {
        body: { items: page.map(itemDto) },
        nextKeys: rows.length > o.limit && last ? [last.day_date, last.display_order, last.created_at, last.id] : null,
      };
    }
    case "saved_places":
    case "reservations": {
      let q = db.from("recommendations").select(REC_COLS).eq("trip_id", tripId);
      if (section === "reservations") q = q.not("booking_status", "is", null).neq("booking_status", "none");
      if (o.city) q = q.ilike("city", escLike(o.city));
      const { page, nextKeys } = await keysetPage(q, o.limit, o.after);
      return { body: { items: page.map(recDto) }, nextKeys };
    }
    case "hotels": {
      let q = db.from("hotels").select(HOTEL_COLS).eq("trip_id", tripId);
      if (o.city) q = q.ilike("city", escLike(o.city));
      const { page, nextKeys } = await keysetPage(q, o.limit, o.after);
      return { body: { items: page.map(hotelDto) }, nextKeys };
    }
    case "checklist": {
      const q = db.from("checklist_items").select("id,title,category,priority,due_date,is_done,notes,created_at").eq("trip_id", tripId);
      const { page, nextKeys } = await keysetPage(q, o.limit, o.after);
      return { body: { items: page.map(checklistDto) }, nextKeys };
    }
    case "documents": {
      const q = db.from("documents").select("id,title,type,valid_date,linked_recommendation_id,created_at").eq("trip_id", tripId);
      const { page, nextKeys } = await keysetPage(q, o.limit, o.after);
      return { body: { items: page.map(docDto) }, nextKeys };
    }
    case "expenses":
      return { body: { expenses_summary: await expensesSummary(db, tripId) }, nextKeys: null };
  }
}
