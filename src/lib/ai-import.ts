import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const ENTRY_TYPES = [
  "attraction",
  "food",
  "transport",
  "note",
  "flight",
  "hotel_checkin",
] as const;
export type ImportEntryType = (typeof ENTRY_TYPES)[number];

export const REC_TYPES = ["food", "attraction", "hotel"] as const;
export type ImportRecType = (typeof REC_TYPES)[number];

export type ParsedEntry = {
  day_number: number;
  title: string;
  entry_type: ImportEntryType;
  time_of_day: string | null;
  location_name: string | null;
  description: string | null;
  icon_emoji: string | null;
};

export type ParsedRec = {
  name: string;
  type: ImportRecType;
  city: string | null;
  notes: string | null;
  booking_deadline: string | null;
  booking_time: string | null;
  booking_url: string | null;
  booking_note: string | null;
};

export type ParseResult = {
  entries: ParsedEntry[];
  recs: ParsedRec[];
  skipped: number;
  error?: string;
};

const nullableStr = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  });

const entrySchema = z.object({
  title: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  entry_type: nullableStr,
  time_of_day: nullableStr,
  location_name: nullableStr,
  description: nullableStr,
  icon_emoji: nullableStr,
});

const daySchema = z.object({
  day_number: z.union([z.number(), z.string()]),
  entries: z.array(z.unknown()).optional(),
});

const recSchema = z.object({
  name: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  type: nullableStr,
  city: nullableStr,
  notes: nullableStr,
  booking_deadline: nullableStr,
  booking_time: nullableStr,
  booking_url: nullableStr,
  booking_note: nullableStr,
});

const rootSchema = z.object({
  version: z.unknown().optional(),
  itinerary: z.array(z.unknown()).optional(),
  recommendations: z.array(z.unknown()).optional(),
});

export function extractJsonBlock(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) candidates.push(m[1].trim());

  // Also try raw braces (last balanced object wins)
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates.reverse()) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function normTime(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = Math.min(23, parseInt(m[1], 10));
  const mi = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function normDate(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function normUrl(v: string | null): string | null {
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : null;
}

function normEntryType(v: string | null): ImportEntryType {
  const s = (v ?? "").toLowerCase().trim();
  if ((ENTRY_TYPES as readonly string[]).includes(s)) return s as ImportEntryType;
  if (s === "hotel" || s === "lodging" || s === "checkin") return "hotel_checkin";
  if (s === "restaurant" || s === "meal") return "food";
  if (s === "travel" || s === "train" || s === "bus") return "transport";
  return "attraction";
}

function normRecType(v: string | null): ImportRecType {
  const s = (v ?? "").toLowerCase().trim();
  if ((REC_TYPES as readonly string[]).includes(s)) return s as ImportRecType;
  if (s === "restaurant" || s === "meal") return "food";
  if (s === "lodging" || s === "hotel_checkin") return "hotel";
  return "attraction";
}

export function defaultIcon(t: ImportEntryType): string {
  switch (t) {
    case "food":
      return "🍜";
    case "transport":
      return "🚆";
    case "flight":
      return "✈️";
    case "hotel_checkin":
      return "🏨";
    case "note":
      return "📝";
    default:
      return "⛩";
  }
}

export function parseAIResponse(raw: string, validDayNumbers?: number[]): ParseResult {
  const empty: ParseResult = { entries: [], recs: [], skipped: 0 };
  const block = extractJsonBlock(raw);
  if (!block) return { ...empty, error: "לא נמצא בלוק JSON תקין בטקסט שהודבק" };

  let json: unknown;
  try {
    json = JSON.parse(block);
  } catch {
    return { ...empty, error: "ה-JSON שהודבק אינו תקין" };
  }

  const root = rootSchema.safeParse(json);
  if (!root.success) return { ...empty, error: "מבנה ה-JSON אינו תואם לפורמט המצופה" };

  const allowedDays = validDayNumbers && validDayNumbers.length ? new Set(validDayNumbers) : null;
  const entries: ParsedEntry[] = [];
  const recs: ParsedRec[] = [];
  let skipped = 0;

  for (const rawDay of root.data.itinerary ?? []) {
    const d = daySchema.safeParse(rawDay);
    if (!d.success) {
      skipped += 1;
      continue;
    }
    const dayNumber = Number(d.data.day_number);
    if (!Number.isFinite(dayNumber) || (allowedDays && !allowedDays.has(dayNumber))) {
      skipped += (d.data.entries ?? []).length || 1;
      continue;
    }
    for (const rawEntry of d.data.entries ?? []) {
      const e = entrySchema.safeParse(rawEntry);
      if (!e.success || !e.data.title) {
        skipped += 1;
        continue;
      }
      const entry_type = normEntryType(e.data.entry_type);
      entries.push({
        day_number: dayNumber,
        title: e.data.title.slice(0, 200),
        entry_type,
        time_of_day: normTime(e.data.time_of_day),
        location_name: e.data.location_name,
        description: e.data.description,
        icon_emoji: e.data.icon_emoji ?? defaultIcon(entry_type),
      });
    }
  }

  for (const rawRec of root.data.recommendations ?? []) {
    const r = recSchema.safeParse(rawRec);
    if (!r.success || !r.data.name) {
      skipped += 1;
      continue;
    }
    recs.push({
      name: r.data.name.slice(0, 200),
      type: normRecType(r.data.type),
      city: r.data.city,
      notes: r.data.notes,
      booking_deadline: normDate(r.data.booking_deadline),
      booking_time: normTime(r.data.booking_time),
      booking_url: normUrl(r.data.booking_url),
      booking_note: r.data.booking_note,
    });
  }

  if (!entries.length && !recs.length) {
    return { entries, recs, skipped, error: "לא נמצאו פריטים לייבוא ב-JSON" };
  }
  return { entries, recs, skipped };
}

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s'"׳״.,\-–—()]/g, "");
}

/* ---------- writing to the database ---------- */

export type PlaceLookup = (query: string) => Promise<{
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  google_maps_url: string | null;
  photo_url: string | null;
  rating: number | null;
  ratingCount: number | null;
} | null>;

type OrderItem = { id: string; time: string | null };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Sorts a day's entries by time of day while keeping items without a time
 * attached to the item they currently follow (notes stay in place).
 * Returns the ids in their merged order.
 */
export function mergeByTime(items: OrderItem[]): string[] {
  const groups: Array<{ time: string | null; ids: string[]; idx: number }> = [];
  for (const it of items) {
    const time = it.time && TIME_RE.test(it.time) ? it.time : null;
    if (time || groups.length === 0) {
      groups.push({ time, ids: [it.id], idx: groups.length });
    } else {
      groups[groups.length - 1]!.ids.push(it.id);
    }
  }
  const sorted = [...groups].sort((a, b) => {
    if (a.time === b.time) return a.idx - b.idx;
    if (!a.time) return -1;
    if (!b.time) return 1;
    return a.time < b.time ? -1 : 1;
  });
  return sorted.flatMap((g) => g.ids);
}

export async function applyEntries(
  entries: ParsedEntry[],
  dayIdByNumber: Map<number, string>,
  lookup?: PlaceLookup
): Promise<number> {
  if (!entries.length) return 0;

  const dayIds = Array.from(new Set(entries.map((e) => dayIdByNumber.get(e.day_number)).filter(Boolean))) as string[];
  const orderByDay = new Map<string, number>();
  if (dayIds.length) {
    const { data } = await supabase
      .from("day_entries")
      .select("day_id, display_order")
      .in("day_id", dayIds);
    for (const row of data ?? []) {
      const cur = orderByDay.get(row.day_id) ?? -1;
      orderByDay.set(row.day_id, Math.max(cur, row.display_order ?? 0));
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const e of entries) {
    const dayId = dayIdByNumber.get(e.day_number);
    if (!dayId) continue;
    const next = (orderByDay.get(dayId) ?? -1) + 1;
    orderByDay.set(dayId, next);

    let place: Awaited<ReturnType<PlaceLookup>> | null = null;
    if (lookup && e.entry_type !== "note") {
      place = await lookup(e.location_name || e.title);
    }

    rows.push({
      day_id: dayId,
      title: e.title,
      entry_type: e.entry_type,
      time_of_day: e.time_of_day,
      description: e.description,
      icon_emoji: e.icon_emoji ?? defaultIcon(e.entry_type),
      location_name: e.location_name ?? place?.address ?? null,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      google_maps_url: place?.google_maps_url ?? null,
      photo_url: place?.photo_url ?? null,
      display_order: next,
    });
  }

  if (!rows.length) return 0;
  const { error } = await supabase.from("day_entries").insert(rows as never);
  if (error) throw error;

  await resortDaysByTime(Array.from(new Set(rows.map((r) => r["day_id"] as string))));
  return rows.length;
}

/** Re-writes display_order for the given days so entries follow their time of day. */
export async function resortDaysByTime(dayIds: string[]): Promise<void> {
  for (const dayId of dayIds) {
    const { data, error } = await supabase
      .from("day_entries")
      .select("id, time_of_day, display_order")
      .eq("day_id", dayId)
      .order("display_order")
      .order("created_at");
    if (error || !data?.length) continue;

    const ordered = mergeByTime(data.map((d) => ({ id: d.id, time: d.time_of_day })));
    const currentById = new Map(data.map((d) => [d.id, d.display_order ?? 0]));
    const updates = ordered
      .map((id, i) => ({ id, i }))
      .filter(({ id, i }) => currentById.get(id) !== i);

    for (const u of updates) {
      await supabase.from("day_entries").update({ display_order: u.i }).eq("id", u.id);
    }
  }
}


export async function applyRecs(
  tripId: string,
  recs: ParsedRec[],
  lookup?: PlaceLookup
): Promise<number> {
  if (!recs.length) return 0;
  const rows: Array<Record<string, unknown>> = [];

  for (const r of recs) {
    const place = lookup ? await lookup(r.city ? `${r.name} ${r.city}` : r.name) : null;
    rows.push({
      trip_id: tripId,
      name: r.name,
      type: r.type,
      city: r.city ?? place?.city ?? null,
      address: place?.address ?? null,
      notes: r.notes,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
      google_maps_url: place?.google_maps_url ?? null,
      photo_url: place?.photo_url ?? null,
      google_rating: place?.rating ?? null,
      google_rating_count: place?.ratingCount ?? null,
      booking_deadline: r.booking_deadline,
      booking_time: r.booking_time,
      booking_url: r.booking_url,
      booking_note: r.booking_note,
      booking_status: r.booking_deadline ? "none" : null,
    });
  }

  const { error } = await supabase.from("recommendations").insert(rows as never);
  if (error) throw error;
  return rows.length;
}
