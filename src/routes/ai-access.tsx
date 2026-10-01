import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTripsList } from "@/hooks/use-trips-list";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api-tokens.functions";

export const Route = createFileRoute("/ai-access")({
  head: () => ({
    meta: [
      { title: "גישת AI לטיול · TravelWay" },
      { name: "description", content: "יצירה וביטול של טוקן קריאה בלבד לחיבור ChatGPT לנתוני הטיול" },
      { property: "og:title", content: "גישת AI לטיול · TravelWay" },
      { property: "og:description", content: "טוקן קריאה בלבד לנתוני הטיול" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiAccessPage,
});

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

function AiAccessPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const activeTripId = useActiveTripId();
  const { data: trips = [] } = useTripsList(user?.id);
  const list = useServerFn(listApiTokens);
  const create = useServerFn(createApiToken);
  const revoke = useServerFn(revokeApiToken);
  const tokens = useQuery({ queryKey: ["api-tokens", user?.id], enabled: !!user, queryFn: () => list() });

  const [label, setLabel] = useState("ChatGPT");
  const [tripId, setTripId] = useState<string>("");
  const [days, setDays] = useState<30 | 90 | 365>(90);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const scope = tripId || activeTripId || "";

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await create({ data: { label, tripId: scope === "all" ? null : scope || null, days } });
      setShown(r.token);
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "יצירת הטוקן נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      await revoke({ data: { id } });
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("הטוקן בוטל");
    } catch {
      toast.error("הביטול נכשל");
    }
  }

  if (!user) return <p className="p-6 text-center text-muted-foreground">יש להתחבר כדי לנהל גישת AI.</p>;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4" dir="rtl">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold"><KeyRound size={20} /> גישת AI</h1>
        <p className="text-sm text-muted-foreground">
          הטוקן נותן גישת קריאה בלבד לנתוני הטיול שלכם. הוא לא יכול לשנות את הטיולים.
        </p>
      </header>

      {shown && (
        <div className="space-y-2 rounded-xl border border-primary bg-card p-4" role="alert">
          <p className="text-sm font-semibold">העתיקו את הטוקן עכשיו — הוא לא יוצג שוב.</p>
          <code className="block break-all rounded bg-muted p-2 text-xs" dir="ltr">{shown}</code>
          <div className="flex gap-2">
            <button type="button" className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-primary-foreground"
              onClick={async () => { try { await navigator.clipboard.writeText(shown); toast.success("הועתק"); } catch { toast.error("ההעתקה נכשלה"); } }}>
              <Copy size={16} /> העתק
            </button>
            <button type="button" className="h-11 rounded-lg border border-border px-4" onClick={() => setShown(null)}>סיימתי</button>
          </div>
        </div>
      )}

      <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="block text-sm">שם הטוקן
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3" />
        </label>
        <label className="block text-sm">טיול
          <select value={scope} onChange={(e) => setTripId(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3">
            {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            <option value="all">כל הטיולים שלי (צריך לציין טיול בכל בקשה)</option>
          </select>
        </label>
        <label className="block text-sm">תוקף
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as 30 | 90 | 365)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3">
            <option value={30}>30 ימים</option>
            <option value={90}>90 ימים</option>
            <option value={365}>שנה</option>
          </select>
        </label>
        <button type="submit" disabled={busy || !scope}
          className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "יוצר…" : "צור טוקן"}
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">טוקנים קיימים</h2>
        {tokens.isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}
        {tokens.data?.length === 0 && <p className="text-sm text-muted-foreground">אין טוקנים עדיין.</p>}
        <ul className="space-y-2">
          {tokens.data?.map((t) => {
            const expired = new Date(t.expires_at) <= new Date();
            const state = t.revoked_at ? "בוטל" : expired ? "פג תוקף" : "פעיל";
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{t.label} · <span className="text-muted-foreground">{state}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {t.trip_id ? `טיול: ${t.trip_title ?? "לא זמין"}` : "כל הטיולים"} · נוצר {fmt(t.created_at)} · שימוש אחרון {fmt(t.last_used_at)} · תוקף עד {fmt(t.expires_at)}
                  </p>
                </div>
                {!t.revoked_at && !expired && (
                  <button type="button" onClick={() => onRevoke(t.id)}
                    className="h-11 shrink-0 rounded-lg border border-destructive px-3 text-destructive">בטל</button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
