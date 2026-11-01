import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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

type Row = { title: string; time_of_day: string | null; entry_type?: string; location_name?: string | null; description?: string | null; is_protected?: boolean };
type View = {
  id: string; day_id: string; state: "pending" | "applied" | "rejected" | "expired" | "token_revoked";
  result: { removed: number; kept: number; added: number } | null;
  date: string; day_number: number; city_label: string | null; note: string | null;
  entries: Row[]; entry_count: number; fingerprint: string; expires_at: string;
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

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-24" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">הצעה להחלפת יום {v.day_number}</h1>
        <p className="text-sm text-muted-foreground">
          {fmtDate(v.date)}{v.city_label ? ` · ${v.city_label}` : ""} · {STATE_LABEL[v.state]}
        </p>
        {v.note && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{v.note}</p>}
      </header>

      {v.state === "applied" && v.result && (
        <p className="rounded-xl border border-border bg-card p-3 text-sm">
          הוחל: {v.result.removed} הוסרו, {v.result.kept} נשמרו, {v.result.added} נוספו.{" "}
          <Link to="/itinerary/$dayId" params={{ dayId: v.day_id }} className="underline">פתח את היום</Link>
        </p>
      )}

      {actionable && (
        <section className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
          <p>יוסרו {v.current.remove_count} תחנות · יישמרו {v.current.keep_count} · יתווספו {v.entry_count}</p>
          {v.current.protected.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {v.current.protected.map((p, i) => (
                <li key={i}>נשמרת: {p.time_of_day ? `${p.time_of_day} · ` : ""}{p.title} ({p.reason === "hotel" ? "מלון" : "הוזמן"})</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {actionable && changed && (
        <div className="space-y-2 rounded-xl border border-destructive bg-card p-3 text-sm" role="alert">
          <p>התכנון של היום השתנה מאז שההצעה נשמרה. ההשוואה כאן מציגה את המצב הנוכחי.</p>
          <button type="button" disabled={busy} className="h-11 w-full rounded-lg border border-border font-semibold disabled:opacity-60"
            onClick={() => call("reconfirm_day_proposal", { _id: v.id, _seen_fingerprint: v.current.fingerprint })}>
            {busy ? "בודק…" : "בדקתי — עדכן את ההשוואה לפי המצב הנוכחי"}
          </button>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">התכנון המוצע ({v.entry_count})</h2>
        <RowList rows={v.entries} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">התכנון הנוכחי ({v.current_rows.length})</h2>
        {v.current_rows.length ? <RowList rows={v.current_rows} /> : <p className="text-sm text-muted-foreground">היום ריק.</p>}
      </section>

      {actionable && !changed && (
        <div className="sticky bottom-0 space-y-2 border-t border-border bg-background py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {confirming && <p className="text-sm">לפני ההחלפה יישמר גיבוי שאפשר לשחזר דרך ׳גרסאות היום׳.</p>}
          <button type="button" disabled={busy} className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
            onClick={() => (confirming ? call("apply_day_proposal", { _id: v.id, _seen_fingerprint: v.fingerprint }) : setConfirming(true))}>
            {busy ? "מחליף…" : confirming ? "אשר והחלף את התכנון" : "בדיקת החלפת היום"}
          </button>
          <button type="button" disabled={busy} className="h-11 w-full rounded-lg border border-border disabled:opacity-60"
            onClick={() => (confirming ? setConfirming(false) : call("reject_day_proposal", { _id: v.id }))}>
            {confirming ? "ביטול" : "דחה את ההצעה"}
          </button>
        </div>
      )}
    </div>
  );
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="rounded-lg border border-border bg-card p-2 text-sm">
          <span className="font-medium">{r.time_of_day ? `${r.time_of_day} · ` : ""}{r.title}</span>
          {r.is_protected && <span className="text-xs text-muted-foreground"> · נשמרת</span>}
          {r.location_name && <span className="block text-xs text-muted-foreground">{r.location_name}</span>}
          {r.description && <span className="block whitespace-pre-wrap text-xs text-muted-foreground">{r.description}</span>}
        </li>
      ))}
    </ul>
  );
}
