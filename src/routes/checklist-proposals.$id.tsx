import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { categoryMeta } from "@/lib/checklist-templates";

export const Route = createFileRoute("/checklist-proposals/$id")({
  head: () => ({
    meta: [
      { title: "הצעה לצ׳ק־ליסט · TravelWay" },
      { name: "description", content: "בדיקה ואישור של שינויים בצ׳ק־ליסט שהציע הצ׳אט" },
      { property: "og:title", content: "הצעה לצ׳ק־ליסט · TravelWay" },
      { property: "og:description", content: "בדיקה ואישור של שינויים בצ׳ק־ליסט" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Fields = { title?: string; category?: string; priority?: string; due_date?: string | null; notes?: string | null; is_done?: boolean };
type Op = { index: number; op: Fields & { op: "add" | "update"; id?: string }; current: (Fields & { id: string }) | null; conflict: boolean; duplicate: "existing" | "in_proposal" | null };
type View = { id: string; state: "pending" | "applied" | "rejected" | "expired" | "token_revoked"; result: { added: number; updated: number } | null; note: string | null; seen_hash: string; ops: Op[] };

const STATE: Record<View["state"], string> = { pending: "ממתינה לאישור", applied: "הוחלה", rejected: "נדחתה", expired: "פג תוקף", token_revoked: "הטוקן שהגיש בוטל" };
const PRI: Record<string, string> = { high: "גבוהה", normal: "רגילה", low: "נמוכה" };
const fmtDate = (d?: string | null) => (d ? d.split("-").reverse().join(".") : "ללא");
const show = (k: keyof Fields, v: unknown) =>
  k === "category" ? categoryMeta(String(v)).label : k === "priority" ? PRI[String(v)] ?? String(v)
  : k === "due_date" ? fmtDate(v as string | null) : k === "is_done" ? (v ? "בוצע" : "פתוח") : (v as string) || "—";
const LABEL: Record<keyof Fields, string> = { title: "כותרת", category: "קטגוריה", priority: "עדיפות", due_date: "תאריך יעד", notes: "הערות", is_done: "מצב" };

function Page() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const key = ["checklist-proposal", id];
  const q = useQuery({
    queryKey: key, enabled: !!user, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_checklist_proposal_view", { _id: id });
      if (error) throw error;
      return data as unknown as View;
    },
  });
  const [accept, setAccept] = useState<Set<number>>(new Set());
  // Manual "add anyway" overrides belong to one displayed state; any new view (new hash) clears them.
  const [acceptFor, setAcceptFor] = useState<string | null>(null);
  if (q.data && q.data.seen_hash !== acceptFor) { setAcceptFor(q.data.seen_hash); if (accept.size) setAccept(new Set()); }
  const [busy, setBusy] = useState(false);

  async function call(fn: "apply_checklist_proposal" | "reject_checklist_proposal", args: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(fn as never, args as never);
      if (error) throw error;
      const st = (data as { status?: string })?.status ?? "";
      const msg: Record<string, string> = {
        done: "הצ׳ק־ליסט עודכן.", already_applied: "ההצעה כבר הוחלה.", rejected: "ההצעה נדחתה.",
        conflict: "חלק מהמשימות השתנו מאז ההצעה. בקשו מהצ׳אט הצעה חדשה.", duplicates: "יש כפילויות שלא אושרו.",
        stale_view: "ההצעה עודכנה. בדקו שוב.", expired: "תוקף ההצעה פג.", token_revoked: "הטוקן שהגיש את ההצעה בוטל.",
      };
      (["done", "already_applied", "rejected"].includes(st) ? toast.success : toast.error)(msg[st] ?? "הפעולה לא הושלמה");
      if (st === "done") await qc.invalidateQueries({ queryKey: ["checklist"] });
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
  const pending = v.state === "pending";
  const adds = v.ops.filter((o) => o.op.op === "add").length;
  const conflicts = v.ops.filter((o) => o.conflict).length;
  const unresolvedDups = v.ops.filter((o) => o.duplicate && !accept.has(o.index)).length;
  const canApply = pending && conflicts === 0 && unresolvedDups === 0;

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-48" dir="rtl">
      <header className="space-y-2">
        <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold">{STATE[v.state]}</span>
        <h1 className="text-2xl font-bold">הצעה לצ׳ק־ליסט</h1>
        <p className="text-sm text-muted-foreground">הצ׳אט הציע שינויים. שום דבר לא משתנה עד שתאשרו. משימות שלא מופיעות כאן לא ישתנו.</p>
      </header>

      {v.state === "applied" && v.result && (
        <div className="flex items-start gap-3 rounded-2xl bg-cat-booked p-4 text-sm text-cat-booked-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p>הוחל: {v.result.added} נוספו, {v.result.updated} עודכנו. <Link to="/checklist" className="font-semibold underline">לצ׳ק־ליסט</Link></p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-cat-booked p-3 text-center text-cat-booked-foreground"><div className="text-2xl font-bold">{adds}</div><div className="text-xs">יתווספו</div></div>
        <div className="rounded-2xl bg-muted p-3 text-center"><div className="text-2xl font-bold">{v.ops.length - adds}</div><div className="text-xs">יעודכנו</div></div>
      </div>

      {pending && conflicts > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-destructive bg-card p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          {conflicts} משימות השתנו מאז שההצעה נשמרה, ולכן אי אפשר להחיל אותה. בקשו מהצ׳אט הצעה חדשה.
        </p>
      )}

      {v.note && <p dir="auto" className="whitespace-pre-wrap rounded-2xl bg-muted p-4 text-start text-sm">{v.note}</p>}

      <ul className="space-y-3">
        {v.ops.map((o) => (
          <li key={o.index} className={`rounded-2xl border bg-card p-3 text-sm ${o.conflict ? "border-destructive" : "border-border"}`}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              {o.op.op === "add" ? <><Plus className="size-4" />משימה חדשה</> : <><Pencil className="size-4" />עדכון משימה קיימת</>}
              {o.conflict && <span className="text-destructive"> · השתנתה מאז</span>}
            </p>
            {o.op.op === "add" ? (
              <>
                <p dir="auto" className="text-start font-semibold">{o.op.title}</p>
                <p className="text-xs text-muted-foreground">
                  {categoryMeta(o.op.category ?? "other").label} · עדיפות {PRI[o.op.priority ?? "normal"]} · יעד {fmtDate(o.op.due_date)}
                </p>
                {o.op.notes && <p dir="auto" className="mt-1 text-start text-xs text-muted-foreground">{o.op.notes}</p>}
              </>
            ) : (
              <>
                <p dir="auto" className="text-start font-semibold">{o.current?.title ?? "משימה שנמחקה"}</p>
                <dl className="mt-1 space-y-0.5 text-xs">
                  {(Object.keys(LABEL) as (keyof Fields)[]).filter((k) => k in o.op).map((k) => (
                    <div key={k} className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">{LABEL[k]}:</dt>
                      <dd><span className="text-muted-foreground line-through">{o.current ? show(k, o.current[k]) : "—"}</span> ← <span className="font-semibold">{show(k, o.op[k])}</span></dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {o.duplicate && pending && (
              <label className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-accent-soft px-3 text-xs text-accent-text">
                <Copy className="size-4 shrink-0" />
                <span className="flex-1">{o.duplicate === "existing" ? "משימה בשם הזה כבר קיימת" : "מופיעה פעמיים בהצעה"}</span>
                <input type="checkbox" className="h-5 w-5" checked={accept.has(o.index)}
                  onChange={(e) => setAccept((s) => { const n = new Set(s); e.target.checked ? n.add(o.index) : n.delete(o.index); return n; })} />
                הוסף בכל זאת
              </label>
            )}
          </li>
        ))}
      </ul>

      {pending && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-1 p-3">
            {unresolvedDups > 0 && conflicts === 0 && <p className="text-xs text-muted-foreground">סמנו "הוסף בכל זאת" או בקשו מהצ׳אט להסיר את הכפילויות.</p>}
            <button type="button" disabled={busy || !canApply} className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
              onClick={() => call("apply_checklist_proposal", { _id: v.id, _seen_hash: v.seen_hash, _accept_duplicates: [...accept] })}>
              {busy ? "מעדכן…" : "אשר ועדכן את הצ׳ק־ליסט"}
            </button>
            <button type="button" disabled={busy} className="h-11 w-full text-sm font-medium text-muted-foreground disabled:opacity-60"
              onClick={() => call("reject_checklist_proposal", { _id: v.id })}>דחה את ההצעה</button>
          </div>
        </div>
      )}
    </div>
  );
}
