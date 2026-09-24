import { useEffect, useState } from "react";
import { BottomSheet, BottomSheetFooter } from "@/components/BottomSheet";
import { useRecs } from "@/hooks/use-trip";
import { useMarkBooked } from "@/lib/booking";

export function MarkBookedSheet({
  recId,
  open,
  onOpenChange,
}: {
  recId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: recs = [] } = useRecs();
  const rec = (recs as Array<{ id: string; name: string; booking_time?: string | null; booking_url?: string | null; booking_note?: string | null }>).find((r) => r.id === recId);
  const [time, setTime] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTime(rec?.booking_time ?? "");
    setUrl(rec?.booking_url ?? "");
    setNote(rec?.booking_note ?? "");
    setUrlError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recId]);

  const save = useMarkBooked(() => onOpenChange(false));

  function submit() {
    if (save.isPending) return;
    const u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) {
      setUrlError("קישור חייב להתחיל ב-http:// או https://");
      return;
    }
    save.mutate({ recId, details: { booking_time: time, booking_url: u, booking_note: note } });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`סמן כהוזמן${rec ? ` · ${rec.name}` : ""}`}
      footer={
        <BottomSheetFooter>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="w-full h-11 rounded-xl bg-[color:var(--accent)] text-white font-semibold disabled:opacity-60"
          >
            {save.isPending ? "שומר…" : "✅ שמור כהוזמן"}
          </button>
        </BottomSheetFooter>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-muted-foreground">שעה (אופציונלי)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full h-11 rounded-xl border border-border bg-background px-3" dir="ltr" />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">קישור להזמנה (אופציונלי)</span>
          <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setUrlError(null); }} placeholder="https://" className="mt-1 w-full h-11 rounded-xl border border-border bg-background px-3" dir="ltr" />
          {urlError && <span className="text-xs text-destructive">{urlError}</span>}
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">הערה (אופציונלי)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" dir="auto" />
        </label>
      </div>
    </BottomSheet>
  );
}
