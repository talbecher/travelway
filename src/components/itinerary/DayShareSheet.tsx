import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import { hebDate, hebWeekday } from "@/lib/format";

type ShareDay = { day_number: number; date: string; city_label: string | null };
type ShareEntry = { title: string; time_of_day: string | null };

/** Plain-text day summary built from in-memory data only. */
export function buildDayShareText(day: ShareDay, entries: ShareEntry[]): string {
  const head = [`יום ${day.day_number}`, `${hebWeekday(day.date)}, ${hebDate(day.date)}`, day.city_label?.trim() || null]
    .filter(Boolean)
    .join(" · ");
  const lines = entries.map((e, i) => `${i + 1}. ${e.time_of_day ? `${e.time_of_day} ` : ""}${e.title}`);
  return [head, ...lines].join("\n");
}

export function DayShareSheet({
  open, onOpenChange, day, entries,
}: { open: boolean; onOpenChange: (o: boolean) => void; day: ShareDay; entries: ShareEntry[] }) {
  const text = buildDayShareText(day, entries);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("התקציר הועתק");
      onOpenChange(false);
    } catch {
      toast.error("לא הצלחנו להעתיק");
    }
  };
  const btn = "w-full min-h-12 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-right text-sm text-foreground";
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="שיתוף היום">
      <div className="flex flex-col gap-2 pb-2" dir="rtl">
        <pre className="whitespace-pre-wrap break-words rounded-xl bg-[color:var(--surface-2)] p-3 text-[12px] leading-relaxed text-foreground font-sans" dir="auto">{text}</pre>
        <button type="button" onClick={copy} className={btn}>
          <Copy size={16} className="text-muted-foreground" /> העתקת תקציר
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={btn} onClick={() => onOpenChange(false)}>
          <MessageCircle size={16} className="text-muted-foreground" /> שליחה בוואטסאפ
        </a>
      </div>
    </BottomSheet>
  );
}
