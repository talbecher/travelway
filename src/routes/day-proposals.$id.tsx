import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, MapPin, MessageSquare, Search, X } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BottomSheet } from "@/components/BottomSheet";
import {
  autoMatchSaved,
  buildLocationRevisions,
  filterSavedPlaces,
  mergePlaceResults,
  missingIndexes,
  nearbySaved,
  prefillQuery,
  savedFromGooglePlace,
  stopAreaCenter,
  type GoogleSuggestion,
  type SavedPlace,
} from "@/lib/proposal-location-fix";
import { fmtDistance } from "@/lib/geo";
import { autocompletePlaces, getPlaceDetails } from "@/lib/places.functions";

export const Route = createFileRoute("/day-proposals/$id")({
  head: () => ({
    meta: [
      { title: "הצעה להחלפת יום · TravelWay" },
      { name: "description", content: "בדיקה ואישור של הצעה מהצ׳אט להחלפת תכנון יום" },
      { property: "og:title", content: "הצעה להחלפת יום · TravelWay" },
      { property: "og:description", content: "בדיקה ואישור של הצעה להחלפת תכנון יום" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProposalPage,
});

type Row = { title: string; time_of_day: string | null; entry_type?: string; location_name?: string | null; description?: string | null; is_protected?: boolean; latitude?: number | null; longitude?: number | null; google_maps_url?: string | null; location_source?: string; location_source_name?: string | null };
type View = {
  id: string; trip_id: string; day_id: string; state: "pending" | "applied" | "rejected" | "expired" | "token_revoked";
  result: { removed: number; kept: number; added: number } | null;
  date: string; day_number: number; city_label: string | null; note: string | null;
  entries: Row[]; location_sources?: string[]; location_source_names?: (string | null)[] | null; entry_count: number; fingerprint: string; expires_at: string;
  current: { fingerprint: string; remove_count: number; keep_count: number; protected: Array<{ title: string; time_of_day: string | null; reason: "hotel" | "booked" }> };
  current_rows: Row[];
};

const fmtDate = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}.${m}.${y}`; };
const STATE_LABEL: Record<View["state"], string> = {
  pending: "ממתינה לאישור", applied: "הוחלה", rejected: "נדחתה", expired: "פג תוקף", token_revoked: "הטוקן שהגיש בוטל",
};

function ProposalPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const key = ["day-proposal", id];
  const q = useQuery({
    queryKey: key, enabled: !!user, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_day_proposal_view", { _id: id });
      if (error) throw error;
      return data as unknown as View;
    },
  });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);

  async function call(fn: string, args: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw error;
      const st = (data as { status?: string })?.status;
      const msg: Record<string, string> = {
        done: "התכנון הוחלף. אפשר לשחזר דרך ׳גרסאות היום׳.", already_applied: "ההצעה כבר הוחלה.",
        day_changed: "היום השתנה. ההשוואה עודכנה — בדקו ואשרו מחדש.", stale_view: "ההצעה עודכנה ממכשיר אחר. בדקו שוב.",
        rejected: "ההצעה נדחתה.", ok: "ההשוואה אושרה. אפשר להחליף עכשיו.", expired: "תוקף ההצעה פג.",
        token_revoked: "הטוקן שהגיש את ההצעה בוטל.", in_progress: "ההחלפה בתהליך. רעננו בעוד רגע.",
      };
      const good = st === "done" || st === "already_applied" || st === "rejected" || st === "ok";
      (good ? toast.success : toast.error)(msg[st ?? ""] ?? "הפעולה לא הושלמה");
    } catch {
      // Outcome may be unknown: re-read the server state instead of retrying.
      toast.error("לא התקבלה תשובה. בודק את המצב העדכני…");
    } finally {
      setConfirming(false);
      setBusy(false);
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  if (!user) return <p className="p-6 text-center text-muted-foreground" dir="rtl">{loading ? "טוען…" : "יש להתחבר כדי לראות את ההצעה."}</p>;
  if (q.isLoading) return <p className="p-6 text-center text-muted-foreground" dir="rtl">טוען…</p>;
  if (q.isError || !q.data) return (
    <div className="space-y-3 p-6 text-center" dir="rtl">
      <p className="text-muted-foreground">ההצעה לא נמצאה או שאין לכם גישה אליה.</p>
      <button type="button" className="h-11 rounded-lg border border-border px-4" onClick={() => q.refetch()}>נסו שוב</button>
    </div>
  );

  const v = q.data;
  const changed = v.fingerprint !== v.current.fingerprint;
  const actionable = v.state === "pending";
  const stateTone = v.state === "pending" ? "bg-accent-soft text-accent-text" : v.state === "applied" ? "bg-cat-booked text-cat-booked-foreground" : "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-48" dir="rtl">
      <header className="space-y-2">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${stateTone}`}>{STATE_LABEL[v.state]}</span>
        <h1 className="text-2xl font-bold leading-tight">יום {v.day_number}{v.city_label ? ` · ${v.city_label}` : ""}</h1>
        <p className="text-sm text-muted-foreground"><span dir="ltr">{fmtDate(v.date)}</span> · הצ׳אט הציע תכנון חדש ליום הזה. בדקו ואשרו.</p>
      </header>

      {v.state === "applied" && v.result && (
        <div className="flex items-start gap-3 rounded-2xl bg-cat-booked p-4 text-sm text-cat-booked-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p>הוחל: {v.result.removed} הוסרו, {v.result.kept} נשמרו, {v.result.added} נוספו.{" "}
            <Link to="/itinerary/$dayId" params={{ dayId: v.day_id }} className="font-semibold underline">פתח את היום</Link></p>
        </div>
      )}

      {actionable && (
        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat n={v.current.remove_count} label="יוסרו" cls="bg-accent-soft text-accent-text" />
            <Stat n={v.current.keep_count} label="יישמרו" cls="bg-muted text-foreground" />
            <Stat n={v.entry_count} label="יתווספו" cls="bg-cat-booked text-cat-booked-foreground" />
          </div>
          {v.current.protected.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-border bg-card p-3 text-sm">
              {v.current.protected.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Lock className="size-4 shrink-0 text-muted-foreground" />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-start">{p.title}</span>
                  {p.time_of_day && <span dir="ltr" className="text-xs text-muted-foreground">{p.time_of_day}</span>}
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{p.reason === "hotel" ? "מלון" : "הוזמן"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {actionable && changed && (
        <div className="space-y-3 rounded-2xl border border-destructive bg-card p-4 text-sm" role="alert">
          <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />התכנון של היום השתנה מאז שההצעה נשמרה. ההשוואה כאן מציגה את המצב הנוכחי.</p>
          <button type="button" disabled={busy} className="h-11 w-full rounded-xl border border-border font-semibold disabled:opacity-60"
            onClick={() => call("reconfirm_day_proposal", { _id: v.id, _seen_fingerprint: v.current.fingerprint })}>
            {busy ? "בודק…" : "בדקתי — עדכן את ההשוואה לפי המצב הנוכחי"}
          </button>
        </div>
      )}

      {v.note && <NoteBox text={v.note} />}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">התכנון המוצע <span className="text-muted-foreground">({v.entry_count})</span></h2>
        <Timeline rows={v.entries.map((e, i) => ({ ...e, location_source: v.location_sources?.[i] ?? "missing", location_source_name: v.location_source_names?.[i] ?? null }))} />
        {(() => {
          const n = (v.location_sources ?? v.entries.map(() => "missing")).filter((x) => x === "missing").length;
          if (!n) return null;
          if (actionable && !changed) return (
            <button type="button" onClick={() => setFixOpen(true)}
              className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-start text-sm font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-5 shrink-0" />
              ל־{n} {n === 1 ? "תחנה חסר" : "תחנות חסר"} מיקום — הצג וטפל
            </button>
          );
          return <p className="text-xs text-muted-foreground">{n} תחנות ללא מיקום שמור</p>;
        })()}
      </section>

      <MissingLocationsSheet
        open={fixOpen}
        onOpenChange={setFixOpen}
        view={v}
        onSaved={async () => { setFixOpen(false); await qc.invalidateQueries({ queryKey: key }); }}
      />

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between p-4 font-semibold">
          התכנון הנוכחי ({v.current_rows.length})
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
          {v.current_rows.length ? <Timeline rows={v.current_rows} /> : <p className="text-sm text-muted-foreground">היום ריק.</p>}
        </div>
      </details>

      {actionable && !changed && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-1 p-3">
            {confirming && <p className="pb-1 text-sm">לפני ההחלפה יישמר גיבוי שאפשר לשחזר דרך ׳גרסאות היום׳.</p>}
            <button type="button" disabled={busy} className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
              onClick={() => (confirming ? call("apply_day_proposal", { _id: v.id, _seen_fingerprint: v.fingerprint }) : setConfirming(true))}>
              {busy ? "מחליף…" : confirming ? "אשר והחלף את התכנון" : "בדיקת החלפת היום"}
            </button>
            <button type="button" disabled={busy} className="h-11 w-full text-sm font-medium text-muted-foreground disabled:opacity-60"
              onClick={() => (confirming ? setConfirming(false) : call("reject_day_proposal", { _id: v.id }))}>
              {confirming ? "ביטול" : "דחה את ההצעה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lets the user attach saved trip places to proposal stops that have no location. */
const newSessionToken = () => crypto.randomUUID().replace(/-/g, "");

/**
 * Google autocomplete for the missing-locations picker: 400ms debounce, at least 2 characters,
 * one session token until a Details call, and a cache per sheet opening so the same text (e.g. a
 * stop's prefilled name) is searched at most once. `results` is null when Google failed.
 */
function useGoogleSuggestions(query: string, sheetOpen: boolean, picking: boolean) {
  const autocomplete = useServerFn(autocompletePlaces);
  const [results, setResults] = useState<GoogleSuggestion[] | null>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(new Map<string, GoogleSuggestion[]>());
  const tokenRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const active = sheetOpen && picking;

  // Each sheet opening starts fresh: no cached results, no session, no late responses.
  useEffect(() => {
    if (sheetOpen) return;
    seqRef.current++;
    cacheRef.current.clear();
    tokenRef.current = null;
  }, [sheetOpen]);

  useEffect(() => {
    const q = query.trim();
    const my = ++seqRef.current; // any newer query invalidates in-flight responses
    if (!q) tokenRef.current = null; // abandoned session
    if (!active || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const hit = cacheRef.current.get(q);
    if (hit) {
      setResults(hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      tokenRef.current ??= newSessionToken();
      try {
        const r = await autocomplete({ data: { input: q, sessionToken: tokenRef.current } });
        if (my !== seqRef.current) return;
        if (r.error) {
          setResults(null);
          return;
        }
        cacheRef.current.set(q, r.suggestions);
        setResults(r.suggestions);
      } catch {
        if (my === seqRef.current) setResults(null);
      } finally {
        if (my === seqRef.current) setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, active, autocomplete]);

  return {
    results,
    loading,
    /** Token for the Details call that ends the session; never reused afterwards. */
    takeToken: () => {
      const t = tokenRef.current ?? newSessionToken();
      tokenRef.current = null;
      return t;
    },
  };
}

function MissingLocationsSheet({
  open,
  onOpenChange,
  view,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  view: View;
  onSaved: () => void | Promise<void>;
}) {
  const [picks, setPicks] = useState<Record<number, SavedPlace>>({});
  // Stop index -> key of the saved place pre-selected automatically in this opening.
  const [autoPicks, setAutoPicks] = useState<Record<number, string>>({});
  const autoDoneRef = useRef(false);
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const pickSeqRef = useRef(0);
  const google = useGoogleSuggestions(search, open, pickingFor !== null);
  const details = useServerFn(getPlaceDetails);

  // The page may close the sheet directly (after a save), so reset the picker on any close.
  useEffect(() => {
    if (open) return;
    pickSeqRef.current++;
    setPickingFor(null);
    setSearch("");
    setPicks({});
    setAutoPicks({});
    autoDoneRef.current = false;
  }, [open]);

  const sources = view.location_sources ?? view.entries.map(() => "missing");
  const missing = useMemo(() => missingIndexes(view.entries, sources), [view.entries, sources]);

  const placesQuery = useQuery({
    queryKey: ["proposal-saved-places", view.trip_id],
    enabled: open,
    queryFn: async (): Promise<SavedPlace[]> => {
      const [recs, hotels] = await Promise.all([
        supabase.from("recommendations").select("id,name,address,latitude,longitude,google_maps_url,provider_place_id").eq("trip_id", view.trip_id).not("latitude", "is", null).limit(500),
        supabase.from("hotels").select("id,hotel_name,address,latitude,longitude,google_maps_url,checkin_date,checkout_date").eq("trip_id", view.trip_id).not("latitude", "is", null).limit(100),
      ]);
      if (recs.error) throw recs.error;
      if (hotels.error) throw hotels.error;
      const out: SavedPlace[] = [];
      for (const r of recs.data ?? []) {
        if (r.latitude == null || r.longitude == null) continue;
        out.push({ key: `rec:${r.id}`, name: r.name, address: r.address, latitude: r.latitude, longitude: r.longitude, google_maps_url: r.google_maps_url, source: "recommendation", provider_place_id: r.provider_place_id });
      }
      for (const h of hotels.data ?? []) {
        if (h.latitude == null || h.longitude == null) continue;
        out.push({ key: `hotel:${h.id}`, name: h.hotel_name, address: h.address, latitude: h.latitude, longitude: h.longitude, google_maps_url: h.google_maps_url, source: "hotel", checkin_date: h.checkin_date, checkout_date: h.checkout_date });
      }
      return out;
    },
  });

  // Once per opening, after saved places load: pre-select unambiguous saved matches as visible
  // picks. Nothing is written until the user taps save.
  useEffect(() => {
    if (!open || autoDoneRef.current || !placesQuery.data) return;
    autoDoneRef.current = true;
    const matched = autoMatchSaved(view.entries, missing, placesQuery.data, picks);
    if (!Object.keys(matched).length) return;
    setPicks((prev) => ({ ...matched, ...prev }));
    setAutoPicks(Object.fromEntries(Object.entries(matched).map(([i, p]) => [i, p.key])));
  }, [open, placesQuery.data, view.entries, missing, picks]);

  const filtered = useMemo(
    () => filterSavedPlaces(placesQuery.data ?? [], search),
    [placesQuery.data, search],
  );
  const options = useMemo(() => mergePlaceResults(filtered, google.results), [filtered, google.results]);

  function openPicker(i: number) {
    pickSeqRef.current++;
    setPickingFor(i);
    // Prefilled so results show without typing; the per-opening cache keeps it to one search per text.
    setSearch(prefillQuery(view.entries[i]));
  }

  function backToList() {
    pickSeqRef.current++;
    setPickingFor(null);
    setSearch("");
  }

  async function pickGoogle(s: GoogleSuggestion) {
    if (pickingFor === null || resolvingId) return;
    const forIndex = pickingFor;
    const my = pickSeqRef.current;
    setResolvingId(s.placeId);
    try {
      const r = await details({ data: { placeId: s.placeId, sessionToken: google.takeToken(), profile: "expense" } });
      if (my !== pickSeqRef.current) return;
      const pick = r.place ? savedFromGooglePlace(r.place) : null;
      if (!pick) {
        toast.error("לא הצלחנו לטעון את המקום מ-Google. נסו שוב או בחרו מקום שמור.");
        return;
      }
      setPicks((prev) => ({ ...prev, [forIndex]: pick }));
      backToList();
    } catch {
      if (my === pickSeqRef.current) toast.error("לא הצלחנו לטעון את המקום מ-Google. נסו שוב או בחרו מקום שמור.");
    } finally {
      setResolvingId(null);
    }
  }

  function close() {
    setPicks({});
    setPickingFor(null);
    setSearch("");
    onOpenChange(false);
  }

  async function save() {
    const revisions = buildLocationRevisions(view.entries, sources, picks);
    if (!revisions.length) { close(); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("revise_day_proposal_locations", {
        _id: view.id,
        _seen_fingerprint: view.current.fingerprint,
        _locations: revisions,
      } as never);
      if (error) throw error;
      const st = (data as { status?: string })?.status;
      if (st === "ok") {
        toast.success("המיקומים נשמרו בהצעה — בדקו את הסקירה המעודכנת");
        await onSaved();
        return;
      }
      if (st === "day_changed") toast.error("היום השתנה. ההשוואה עודכנה — בדקו ואשרו מחדש.");
      else if (st === "expired") toast.error("תוקף ההצעה פג.");
      else if (st === "token_revoked") toast.error("הטוקן שהגיש את ההצעה בוטל.");
      else toast.error("שמירת המיקומים נכשלה");
      await onSaved();
    } catch {
      toast.error("שמירת המיקומים נכשלה");
    } finally {
      setSaving(false);
    }
  }

  const pickCount = Object.keys(picks).length;
  const isAuto = (i: number) => picks[i] !== undefined && autoPicks[i] === picks[i].key;
  const autoCount = missing.filter(isAuto).length;

  // "Saved near the area": only for a stop without an automatic match, and only while the search
  // still holds the prefilled text. Any edit falls back to the usual text filter + Google.
  const pickingAuto = pickingFor !== null && isAuto(pickingFor);
  const showNearby =
    pickingFor !== null && !pickingAuto && search === prefillQuery(view.entries[pickingFor]);
  const nearby = useMemo(() => {
    if (!showNearby || pickingFor === null || !placesQuery.data) return [];
    const center = stopAreaCenter(view.entries, picks, pickingFor, placesQuery.data, view.date);
    const shownKeys = filtered.map((p) => p.key);
    return nearbySaved(center, placesQuery.data, undefined, undefined, shownKeys);
  }, [showNearby, pickingFor, placesQuery.data, view.entries, view.date, picks, filtered]);

  function choose(p: SavedPlace) {
    if (pickingFor === null) return;
    const i = pickingFor;
    setPicks((prev) => ({ ...prev, [i]: p }));
    backToList();
  }

  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) close(); }} title="תחנות ללא מיקום" repositionInputs={false}>
      {pickingFor === null ? (
        <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
          <p className="text-xs text-muted-foreground">
            בחרו מקום שמור מהטיול לכל תחנה, או השאירו אותה במפורש ללא מיקום — לא נמציא נקודה לאזור כללי.
          </p>
          {autoCount > 0 && (
            <p
              role="status"
              className="rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-text"
            >
              {autoCount === 1 ? "תחנה אחת הותאמה" : `${autoCount} הותאמו`} אוטומטית למקום שמור,
              בדקו לפני שמירה
            </p>
          )}
          <ul className="space-y-2">
            {missing.map((i) => {
              const e = view.entries[i];
              const pick = picks[i];
              return (
                <li key={i} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="text-xs font-semibold tabular-nums text-muted-foreground">{e.time_of_day ?? "—"}</span>
                    <p dir="auto" className="min-w-0 flex-1 truncate text-start text-sm font-semibold">{e.title}</p>
                  </div>
                  {pick ? (
                    <div className="mt-2 space-y-1.5">
                      {isAuto(i) && (
                        <span className="inline-block rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-text">
                          הותאם אוטומטית · {pick.source === "hotel" ? "מלון" : "מקום שמור"}
                        </span>
                      )}
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" />
                        <span dir="auto" className="truncate">{pick.name}{pick.address ? ` · ${pick.address}` : ""}</span>
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5">{pick.source === "hotel" ? "מלון" : pick.source === "google" ? "Google" : "מקום שמור"}</span>
                      </p>
                      <div className="flex gap-2">
                        <button type="button" className="min-h-11 flex-1 rounded-lg border border-border text-xs font-semibold"
                          onClick={() => openPicker(i)}>
                          החלף בחירה
                        </button>
                        <button type="button" className="min-h-11 flex-1 rounded-lg border border-border text-xs font-semibold text-muted-foreground"
                          onClick={() => setPicks((p) => { const n = { ...p }; delete n[i]; return n; })}>
                          השאר ללא מיקום
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                      onClick={() => openPicker(i)}>
                      <MapPin className="size-4" /> בחר מיקום
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-0 -mx-5 mt-1 border-t border-border bg-card px-5 pt-3 pb-4">
            <button type="button" disabled={saving || pickCount === 0} onClick={save}
              className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
              {saving ? "שומר…" : pickCount ? `שמור ${pickCount === 1 ? "מיקום אחד" : `${pickCount} מיקומים`}` : "לא נבחרו מיקומים"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="חזרה" className="flex size-11 items-center justify-center rounded-lg border border-border"
              onClick={backToList}>
              <X className="size-4" />
            </button>
            <p dir="auto" className="min-w-0 flex-1 truncate text-start text-sm font-semibold">{view.entries[pickingFor]?.title}</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              // Prefilled: no auto-focus, so the keyboard does not cover the ready results.
              autoFocus={!search.trim()}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש במקומות השמורים או ב-Google…"
              className="h-11 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm"
            />
          </div>
          {placesQuery.isLoading && <p className="text-xs text-muted-foreground">טוען מקומות שמורים…</p>}
          {placesQuery.isError && <p className="text-xs text-muted-foreground">טעינת המקומות השמורים נכשלה</p>}
          {google.loading ? (
            <p className="text-xs text-muted-foreground">מחפש ב-Google…</p>
          ) : google.results === null ? (
            <p role="status" className="text-xs text-muted-foreground">חיפוש Google לא זמין כרגע. אפשר לבחור מהמקומות השמורים.</p>
          ) : null}
          {nearby.length > 0 && (
            <section aria-labelledby="nearby-saved-title" className="space-y-1.5">
              <h3 id="nearby-saved-title" className="text-xs font-semibold text-muted-foreground">שמורים קרובים לאזור</h3>
              <ul className="space-y-1.5">
                {nearby.map(({ place, km }) => (
                  <li key={`near:${place.key}`}>
                    <SavedOptionButton place={place} km={km} onPick={() => choose(place)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {nearby.length > 0 && options.length > 0 && (
            <h3 className="text-xs font-semibold text-muted-foreground">לפי החיפוש</h3>
          )}
          {options.length === 0 ? (
            !placesQuery.isLoading && !google.loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">לא נמצאו מקומות מתאימים</p>
            )
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {options.map((o) => {
                if (o.kind === "saved") {
                  const p = o.place;
                  return (
                    <li key={p.key}>
                      <SavedOptionButton place={p} onPick={() => choose(p)} />
                    </li>
                  );
                }
                const g = o.suggestion;
                const busy = resolvingId === g.placeId;
                return (
                  <li key={`google:${g.placeId}`}>
                    <button type="button" disabled={resolvingId !== null}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-card p-3 text-start disabled:cursor-default ${resolvingId && !busy ? "opacity-50" : ""}`}
                      onClick={() => void pickGoogle(g)}>
                      <MapPin className={`size-4 shrink-0 text-muted-foreground ${busy ? "animate-pulse" : ""}`} />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-sm font-semibold">{g.main}</span>
                        {g.secondary && <span dir="auto" className="block truncate text-xs text-muted-foreground">{g.secondary}</span>}
                      </span>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs">{busy ? "טוען…" : "Google"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function SavedOptionButton({
  place: p,
  km,
  onPick,
}: {
  place: SavedPlace;
  km?: number;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-card p-3 text-start"
      onClick={onPick}
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {p.name}
        </span>
        {p.address && (
          <span dir="auto" className="block truncate text-xs text-muted-foreground">
            {p.address}
          </span>
        )}
      </span>
      {km !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmtDistance(km)}
        </span>
      )}
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs">
        {p.source === "hotel" ? "מלון" : "מקום שמור"}
      </span>
    </button>
  );
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${cls}`}>
      <div className="text-2xl font-bold leading-none">{n}</div>
      <div className="mt-1 text-xs font-medium">{label}</div>
    </div>
  );
}

function NoteBox({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl bg-muted p-4 text-sm">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MessageSquare className="size-4" />הערה מהצ׳אט</p>
      <p dir="auto" className={`whitespace-pre-wrap text-start leading-relaxed ${open ? "" : "line-clamp-3"}`}>{text}</p>
      <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-primary" onClick={() => setOpen((o) => !o)}>{open ? "הצג פחות" : "הצג עוד"}</button>
    </section>
  );
}

function Timeline({ rows }: { rows: Row[] }) {
  return (
    <ol className="relative space-y-3">
      {rows.map((r, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex w-12 shrink-0 flex-col items-center gap-1">
            <span dir="ltr" className="text-sm font-semibold tabular-nums">{r.time_of_day ?? "—"}</span>
            <CategoryIcon category={r.entry_type ?? "other"} size={30} />
            {i < rows.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <RowCard r={r} />
        </li>
      ))}
    </ol>
  );
}

function RowCard({ r }: { r: Row }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <p dir="auto" className="min-w-0 flex-1 text-start font-semibold leading-snug">{r.title}</p>
        {r.is_protected && <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"><Lock className="size-3" />נשמרת</span>}
      </div>
      {r.location_name && <p dir="auto" className="mt-1 flex items-center gap-1 text-start text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{r.location_name}</span></p>}
      {r.location_source && (
        <p className="mt-1 text-xs text-muted-foreground">
          {r.location_source === "existing" ? (r.location_source_name ? <>מיקום מההמלצה: <bdi>{r.location_source_name}</bdi></> : "מיקום שמור בטיול") : r.location_source === "ai" ? (r.latitude != null ? "מיקום מהצ׳אט" : "מיקום מהצ׳אט (קישור מפות)") : "ללא מיקום"}
        </p>
      )}
      {r.description && (
        <>
          <p dir="auto" className={`mt-2 whitespace-pre-wrap text-start text-sm text-muted-foreground ${open ? "" : "line-clamp-2"}`}>{r.description}</p>
          {r.description.length > 90 && <button type="button" className="min-h-9 text-xs font-semibold text-primary" onClick={() => setOpen((o) => !o)}>{open ? "פחות" : "עוד"}</button>}
        </>
      )}
    </div>
  );
}
