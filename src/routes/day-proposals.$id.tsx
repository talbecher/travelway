import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, MapPin, MessageSquare, Search, X } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { BottomSheet } from "@/components/BottomSheet";
import {
  buildLocationRevisions,
  filterSavedPlaces,
  missingIndexes,
  type SavedPlace,
} from "@/lib/proposal-location-fix";

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

type Row = { title: string; time_of_day: string | null; entry_type?: string; location_name?: string | null; description?: string | null; is_protected?: boolean; latitude?: number | null; longitude?: number | null; google_maps_url?: string | null; location_source?: string };
type View = {
  id: string; trip_id: string; day_id: string; state: "pending" | "applied" | "rejected" | "expired" | "token_revoked";
  result: { removed: number; kept: number; added: number } | null;
  date: string; day_number: number; city_label: string | null; note: string | null;
  entries: Row[]; location_sources?: string[]; entry_count: number; fingerprint: string; expires_at: string;
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
        <Timeline rows={v.entries.map((e, i) => ({ ...e, location_source: v.location_sources?.[i] ?? "missing" }))} />
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
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const sources = view.location_sources ?? view.entries.map(() => "missing");
  const missing = useMemo(() => missingIndexes(view.entries, sources), [view.entries, sources]);

  const placesQuery = useQuery({
    queryKey: ["proposal-saved-places", view.trip_id],
    enabled: open,
    queryFn: async (): Promise<SavedPlace[]> => {
      const [recs, hotels] = await Promise.all([
        supabase.from("recommendations").select("id,name,address,latitude,longitude,google_maps_url").eq("trip_id", view.trip_id).not("latitude", "is", null).limit(500),
        supabase.from("hotels").select("id,hotel_name,address,latitude,longitude,google_maps_url").eq("trip_id", view.trip_id).not("latitude", "is", null).limit(100),
      ]);
      if (recs.error) throw recs.error;
      if (hotels.error) throw hotels.error;
      const out: SavedPlace[] = [];
      for (const r of recs.data ?? []) {
        if (r.latitude == null || r.longitude == null) continue;
        out.push({ key: `rec:${r.id}`, name: r.name, address: r.address, latitude: r.latitude, longitude: r.longitude, google_maps_url: r.google_maps_url, source: "recommendation" });
      }
      for (const h of hotels.data ?? []) {
        if (h.latitude == null || h.longitude == null) continue;
        out.push({ key: `hotel:${h.id}`, name: h.hotel_name, address: h.address, latitude: h.latitude, longitude: h.longitude, google_maps_url: h.google_maps_url, source: "hotel" });
      }
      return out;
    },
  });

  const filtered = useMemo(
    () => filterSavedPlaces(placesQuery.data ?? [], search),
    [placesQuery.data, search],
  );

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

  return (
    <BottomSheet open={open} onOpenChange={(o) => { if (!o) close(); }} title="תחנות ללא מיקום">
      {pickingFor === null ? (
        <div className="flex flex-col gap-3 pb-24">
          <p className="text-xs text-muted-foreground">
            בחרו מקום שמור מהטיול לכל תחנה, או השאירו אותה במפורש ללא מיקום — לא נמציא נקודה לאזור כללי.
          </p>
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
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" />
                        <span dir="auto" className="truncate">{pick.name}{pick.address ? ` · ${pick.address}` : ""}</span>
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5">{pick.source === "hotel" ? "מלון" : "מקום שמור"}</span>
                      </p>
                      <div className="flex gap-2">
                        <button type="button" className="min-h-11 flex-1 rounded-lg border border-border text-xs font-semibold"
                          onClick={() => { setPickingFor(i); setSearch(""); }}>
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
                      onClick={() => { setPickingFor(i); setSearch(""); }}>
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
        <div className="flex flex-col gap-3 pb-24">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="חזרה" className="flex size-11 items-center justify-center rounded-lg border border-border"
              onClick={() => setPickingFor(null)}>
              <X className="size-4" />
            </button>
            <p dir="auto" className="min-w-0 flex-1 truncate text-start text-sm font-semibold">{view.entries[pickingFor]?.title}</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש במקומות השמורים…"
              className="h-11 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm"
            />
          </div>
          {placesQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">טוען מקומות שמורים…</p>
          ) : placesQuery.isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">טעינת המקומות נכשלה</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">לא נמצאו מקומות שמורים מתאימים</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {filtered.map((p) => (
                <li key={p.key}>
                  <button type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-card p-3 text-start"
                    onClick={() => { setPicks((prev) => ({ ...prev, [pickingFor]: p })); setPickingFor(null); setSearch(""); }}>
                    <MapPin className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-sm font-semibold">{p.name}</span>
                      {p.address && <span dir="auto" className="block truncate text-xs text-muted-foreground">{p.address}</span>}
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs">{p.source === "hotel" ? "מלון" : "מקום שמור"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
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
          {r.location_source === "existing" ? "מיקום שמור בטיול" : r.location_source === "ai" ? (r.latitude != null ? "מיקום מהצ׳אט" : "מיקום מהצ׳אט (קישור מפות)") : "ללא מיקום"}
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
