import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, MapPinOff, Pencil, Plus, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/item-proposals/$id")({
  head: () => ({
    meta: [
      { title: "הצעה לשינוי · TravelWay" },
      { name: "description", content: "בדיקה ואישור של שינויים במסלול או בהוצאות שהציע הצ׳אט" },
      { property: "og:title", content: "הצעה לשינוי · TravelWay" },
      { property: "og:description", content: "בדיקה ואישור של שינויים במסלול או בהוצאות" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type J = Record<string, any>;
type Op = { index: number; op: J; current: J | null; conflict: boolean; protected: boolean; duplicate_of: string[]; missing_location: boolean };
type View = {
  id: string; kind: "itinerary" | "expenses"; state: "pending" | "applied" | "rejected" | "expired" | "token_revoked";
  result: { added: number; updated: number } | null; note: string | null; seen_hash: string; ops: Op[];
  money: { base_currency: string; target_currency: string; manual_rate: number | null } | null;
  current_money: View["money"]; days: Record<string, { date: string; day_number: number }>;
};

const STATE: Record<View["state"], string> = { pending: "ממתינה לאישור", applied: "הוחלה", rejected: "נדחתה", expired: "פג תוקף", token_revoked: "הטוקן שהגיש בוטל" };
const TYPE: Record<string, string> = { attraction: "אטרקציה", food: "אוכל", transport: "תחבורה", note: "הערה", flight: "טיסה", hotel_checkin: "מלון" };
const CAT: Record<string, string> = { food: "אוכל", attraction: "אטרקציה", transport: "תחבורה", shopping: "קניות", accommodation: "לינה", other: "אחר" };
const LOC: Record<string, string> = {
  saved: "מיקום מההמלצה", saved_missing: "להמלצה אין מיקום שמור", supplied: "מיקום שהצ׳אט שלח", supplied_url: "קישור מפות מהצ׳אט",
  kept: "המיקום הקודם נשמר במכוון", cleared: "המיקום יוסר", unchanged: "המיקום לא משתנה", none: "ללא מיקום",
};
const fmtDate = (d?: string | null) => (d ? String(d).split("-").reverse().join(".") : "—");
const ENTRY_LABEL: Record<string, string> = { entry_type: "סוג", title: "שם", description: "תיאור", time_of_day: "שעה", location_name: "מקום", latitude: "קו רוחב", longitude: "קו אורך", google_maps_url: "קישור מפות" };
const EXP_LABEL: Record<string, string> = { expense_date: "תאריך", category: "קטגוריה", description: "תיאור", location_name: "מקום", amount_ils: "סכום בבסיס", amount_foreign: "סכום מקורי", foreign_currency: "מטבע מקורי" };
const showVal = (k: string, v: unknown) =>
  v == null || v === "" ? "—" : k === "entry_type" ? TYPE[String(v)] ?? String(v) : k === "category" ? CAT[String(v)] ?? String(v)
  : k === "expense_date" ? fmtDate(String(v)) : String(v);

function Page() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const key = ["item-proposal", id];
  const q = useQuery({
    queryKey: key, enabled: !!user, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_item_proposal_view", { _id: id });
      if (error) throw error;
      return data as unknown as View;
    },
  });
  const [accept, setAccept] = useState<Set<number>>(new Set());
  const [acceptFor, setAcceptFor] = useState<string | null>(null);
  if (q.data && q.data.seen_hash !== acceptFor) { setAcceptFor(q.data.seen_hash); if (accept.size) setAccept(new Set()); }
  const [busy, setBusy] = useState(false);

  async function call(fn: "apply_item_proposal" | "reject_item_proposal", args: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw error;
      const st = (data as { status?: string })?.status ?? "";
      const msg: Record<string, string> = {
        done: "השינויים נשמרו.", already_applied: "ההצעה כבר הוחלה.", rejected: "ההצעה נדחתה.",
        conflict: "חלק מהפריטים או ההגדרות השתנו מאז ההצעה. בקשו מהצ׳אט הצעה חדשה.", duplicates: "יש כפילויות שלא אושרו.",
        stale_view: "ההצעה השתנתה מאז שנטענה. בדקו שוב.", expired: "תוקף ההצעה פג.", token_revoked: "הטוקן שהגיש את ההצעה בוטל או איבד גישה.",
      };
      (["done", "already_applied", "rejected"].includes(st) ? toast.success : toast.error)(msg[st] ?? "הפעולה לא הושלמה");
      if (st === "done") await qc.invalidateQueries();
    } catch {
      toast.error("לא התקבלה תשובה. בודק את המצב העדכני…");
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  if (!user) return <p className="p-6 text-center text-muted-foreground" dir="rtl">{loading ? "טוען…" : "יש להתחבר כדי לראות את ההצעה."}</p>;
  if (q.isLoading) return <p className="p-6 text-center text-muted-foreground" dir="rtl">טוען…</p>;
  if (q.isError || !q.data) return <p className="p-6 text-center text-muted-foreground" dir="rtl">ההצעה לא נמצאה או שאין לכם גישה אליה.</p>;

  const v = q.data;
  const isIt = v.kind === "itinerary";
  const pending = v.state === "pending";
  const adds = v.ops.filter((o) => o.op.op === "add").length;
  const blocked = v.ops.filter((o) => o.conflict || o.protected).length;
  const missing = isIt ? v.ops.filter((o) => o.missing_location).length : 0;
  const unresolvedDups = v.ops.filter((o) => o.duplicate_of.length > 0 && !accept.has(o.index)).length;
  const canApply = pending && blocked === 0 && unresolvedDups === 0;
  const base = v.money?.base_currency ?? "ILS";
  const LABEL = isIt ? ENTRY_LABEL : EXP_LABEL;
  const fmtField = (k: string, val: unknown) =>
    !isIt && k === "amount_ils" ? (val == null ? "—" : formatMoney(Number(val), base))
    : !isIt && k === "amount_foreign" ? (val == null ? "—" : String(val)) : showVal(k, val);

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-48" dir="rtl">
      <header className="space-y-2">
        <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold">{STATE[v.state]}</span>
        <h1 className="text-2xl font-bold">{isIt ? "הצעה לשינוי תחנות במסלול" : "הצעה להוצאות"}</h1>
        <p className="text-sm text-muted-foreground">שום דבר לא משתנה עד שתאשרו. פריטים ושדות שלא מופיעים כאן לא ישתנו, ושום דבר לא נמחק.</p>
      </header>

      {v.state === "applied" && v.result && (
        <div className="flex items-start gap-3 rounded-2xl bg-cat-booked p-4 text-sm text-cat-booked-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p>הוחל: {v.result.added} נוספו, {v.result.updated} עודכנו. <Link to={isIt ? "/itinerary" : "/budget"} className="font-semibold underline">{isIt ? "למסלול" : "לתקציב"}</Link></p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-cat-booked p-3 text-center text-cat-booked-foreground"><div className="text-2xl font-bold">{adds}</div><div className="text-xs">יתווספו</div></div>
        <div className="rounded-2xl bg-muted p-3 text-center"><div className="text-2xl font-bold">{v.ops.length - adds}</div><div className="text-xs">יעודכנו</div></div>
      </div>

      {!isIt && v.money && (
        <p className="rounded-2xl bg-muted p-3 text-xs">
          מטבע בסיס: <bdi>{v.money.base_currency}</bdi> · מטבע יעד: <bdi>{v.money.target_currency}</bdi>
          {v.money.manual_rate ? <> · שער ידני: <bdi>1 {v.money.base_currency} = {v.money.manual_rate} {v.money.target_currency}</bdi></> : " · אין שער ידני"}
        </p>
      )}

      {pending && blocked > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-destructive bg-card p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          {blocked} פריטים השתנו, מוגנים או שההגדרות השתנו מאז ההצעה, ולכן אי אפשר להחיל אותה. בקשו מהצ׳אט הצעה חדשה.
        </p>
      )}
      {missing > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-border bg-accent-soft p-4 text-sm text-accent-text">
          <MapPinOff className="mt-0.5 size-5 shrink-0" />
          {missing} תחנות יישארו ללא מיקום במפה. אפשר לאשר בכל זאת או לבקש מהצ׳אט מקום שמור.
        </p>
      )}

      {v.note && <p dir="auto" className="whitespace-pre-wrap rounded-2xl bg-muted p-4 text-start text-sm">{v.note}</p>}

      <ul className="space-y-3">
        {v.ops.map((o) => {
          const fields: J = o.op.op === "add" ? o.op.values : o.op.set;
          const day = o.op.day_id ? v.days?.[o.op.day_id] : null;
          const money = o.op.money as J | null;
          return (
            <li key={o.index} className={`rounded-2xl border bg-card p-3 text-sm ${o.conflict || o.protected ? "border-destructive" : "border-border"}`}>
              <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                {o.op.op === "add" ? <><Plus className="size-4" />{isIt ? "תחנה חדשה" : "הוצאה חדשה"}</> : <><Pencil className="size-4" />{isIt ? "עדכון תחנה קיימת" : "עדכון הוצאה קיימת"}</>}
                {day && <span>· יום {day.day_number} ({fmtDate(day.date)})</span>}
                {o.conflict && <span className="text-destructive"> · השתנה מאז</span>}
                {o.protected && <span className="flex items-center gap-1 text-destructive"><Lock className="size-3" />מוגן</span>}
              </p>
              {o.op.op === "add" ? (
                <dl className="space-y-0.5 text-xs">
                  {Object.keys(LABEL).filter((k) => fields[k] != null).map((k) => (
                    <div key={k} className="flex flex-wrap gap-1"><dt className="text-muted-foreground">{LABEL[k]}:</dt><dd dir="auto" className="font-semibold">{fmtField(k, fields[k])}</dd></div>
                  ))}
                </dl>
              ) : (
                <>
                  <p dir="auto" className="text-start font-semibold">{o.current?.title ?? o.current?.description ?? (o.current ? "—" : "פריט שנמחק")}</p>
                  <dl className="mt-1 space-y-0.5 text-xs">
                    {Object.keys(LABEL).filter((k) => k in fields).map((k) => (
                      <div key={k} className="flex flex-wrap gap-1">
                        <dt className="text-muted-foreground">{LABEL[k]}:</dt>
                        <dd dir="auto"><span className="text-muted-foreground line-through">{o.current ? fmtField(k, o.current[k]) : "—"}</span> ← <span className="font-semibold">{fmtField(k, fields[k])}</span></dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ללא שינוי: {Object.keys(LABEL).filter((k) => !(k in fields)).map((k) => LABEL[k]).join(", ") || "—"}
                  </p>
                </>
              )}
              {isIt && (
                <p className={`mt-1 text-xs ${o.missing_location ? "text-destructive" : "text-muted-foreground"}`}>
                  {LOC[o.op.location?.source] ?? ""}{o.op.location?.source_name ? `: ${o.op.location.source_name}` : ""}
                  {o.missing_location ? " · אין מיקום במפה" : ""}
                </p>
              )}
              {money && (
                <p className="mt-1 text-xs text-muted-foreground">
                  סכום שהוזן: <bdi>{formatMoney(money.input_amount, money.input_currency)}</bdi> → <bdi>{formatMoney(money.amount_ils, money.base_currency)}</bdi>
                  {" "}({money.rate_source === "same" ? "מטבע הבסיס, ללא המרה"
                    : money.rate_source === "live" ? <>שער שוק אוטומטי <bdi>1 {money.base_currency} = {money.rate} {money.input_currency}</bdi> · <bdi>{money.rate_provider}</bdi> · {fmtDate(money.rate_date)}{money.rate_stale ? " · שער מגיבוי (השירות לא היה זמין)" : ""}</>
                    : <>שער ידני <bdi>1 {money.base_currency} = {money.rate} {money.input_currency}</bdi></>})
                </p>
              )}
              {o.duplicate_of.length > 0 && pending && (
                <label className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-accent-soft px-3 text-xs text-accent-text">
                  <Copy className="size-4 shrink-0" />
                  <span className="flex-1">{isIt ? "תחנה עם אותו שם ושעה כבר קיימת ביום הזה" : "הוצאה עם אותו תאריך, קטגוריה וסכום כבר קיימת"}</span>
                  <input type="checkbox" className="h-5 w-5" checked={accept.has(o.index)}
                    onChange={(e) => setAccept((s) => { const n = new Set(s); e.target.checked ? n.add(o.index) : n.delete(o.index); return n; })} />
                  הוסף בכל זאת
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {pending && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-1 p-3">
            {unresolvedDups > 0 && blocked === 0 && <p className="text-xs text-muted-foreground">סמנו "הוסף בכל זאת" או בקשו מהצ׳אט להסיר את הכפילויות.</p>}
            <button type="button" disabled={busy || !canApply} className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
              onClick={() => call("apply_item_proposal", { _id: v.id, _seen_hash: v.seen_hash, _accept_duplicates: [...accept] })}>
              {busy ? "מעדכן…" : "אשר ושמור"}
            </button>
            <button type="button" disabled={busy} className="h-11 w-full text-sm font-medium text-muted-foreground disabled:opacity-60"
              onClick={() => call("reject_item_proposal", { _id: v.id })}>דחה את ההצעה</button>
          </div>
        </div>
      )}
    </div>
  );
}
