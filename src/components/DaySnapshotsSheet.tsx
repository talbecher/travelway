import { useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import {
  useCreateDaySnapshot,
  useDaySnapshots,
  useDeleteDaySnapshot,
  useRenameDaySnapshot,
  useRestoreDaySnapshot,
  type DaySnapshot,
} from "@/hooks/use-day-snapshots";

function reasonLabel(reason: string) {
  if (reason === "ai_import") return "🤖 ייבוא AI";
  if (reason === "pre_restore") return "↩️ לפני שחזור";
  return "📌 ידני";
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DaySnapshotsSheet({
  open,
  onOpenChange,
  dayId,
  tripId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dayId: string;
  tripId: string;
}) {
  const { data: snapshots = [], isLoading } = useDaySnapshots(dayId);
  const create = useCreateDaySnapshot();
  const restore = useRestoreDaySnapshot();
  const rename = useRenameDaySnapshot();
  const del = useDeleteDaySnapshot();

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<DaySnapshot | null>(null);

  async function doRestore(s: DaySnapshot) {
    try {
      const n = await restore.mutateAsync({ snapshot: s });
      setConfirmRestore(null);
      onOpenChange(false);
      toast.success(`היום שוחזר · ${n} פעילויות`);
    } catch (e) {
      toast.error((e as Error).message ?? "השחזור נכשל");
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="🕘 גרסאות היום">
      <div className="pb-2 text-right space-y-3">
        <div className="text-[13px] text-muted-foreground">
          נקודות שחזור נשמרות אוטומטית לפני כל ייבוא מ-AI. שחזור מחזיר את היום בדיוק למצב שנשמר.
        </div>

        <button
          type="button"
          disabled={create.isPending}
          onClick={async () => {
            try {
              await create.mutateAsync({ dayId, tripId, reason: "manual" });
              toast.success("נקודת שחזור נשמרה");
            } catch (e) {
              toast.error((e as Error).message ?? "השמירה נכשלה");
            }
          }}
          className="w-full h-11 rounded-xl bg-surface border border-border text-[14px] disabled:opacity-50"
        >
          {create.isPending ? "שומר…" : "📌 שמור נקודת שחזור עכשיו"}
        </button>

        {isLoading ? (
          <div className="text-[13px] text-muted-foreground py-6 text-center">טוען…</div>
        ) : snapshots.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-6 text-center">
            אין עדיין נקודות שחזור ליום הזה
          </div>
        ) : (
          <div className="space-y-2 max-h-[52vh] overflow-y-auto">
            {snapshots.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                {renaming === s.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="flex-1 h-10 rounded-lg bg-background border border-input px-3 text-[14px]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const name = draftName.trim();
                        if (!name) return setRenaming(null);
                        await rename.mutateAsync({ id: s.id, name, dayId });
                        setRenaming(null);
                      }}
                      className="h-10 px-3 rounded-lg bg-[color:var(--accent)] text-white text-[13px]"
                    >
                      שמור
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="font-medium text-[14px]">{s.name}</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {reasonLabel(s.reason)} · {s.entry_count} פעילויות · {whenLabel(s.created_at)}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={restore.isPending}
                        onClick={() => setConfirmRestore(s)}
                        className="h-9 px-3 rounded-full bg-[color:var(--accent)] text-white text-[12px] disabled:opacity-50"
                      >
                        ↩️ שחזר
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(s.id);
                          setDraftName(s.name);
                        }}
                        className="h-9 px-3 rounded-full bg-surface border border-border text-[12px]"
                      >
                        ✏️ שנה שם
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await del.mutateAsync({ id: s.id, dayId });
                          toast.success("נקודת השחזור נמחקה");
                        }}
                        className="h-9 px-3 rounded-full bg-surface border border-border text-[12px] text-muted-foreground"
                      >
                        🗑 מחק
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {confirmRestore && (
          <div className="rounded-xl border border-border bg-[color:var(--surface-2)] p-3">
            <div className="text-[13px]">
              לשחזר את היום ל־"{confirmRestore.name}"? כל הפעילויות הנוכחיות ביום יוחלפו
              ({confirmRestore.entry_count} פעילויות יחזרו). המצב הנוכחי יישמר כנקודת שחזור.
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={restore.isPending}
                onClick={() => doRestore(confirmRestore)}
                className="flex-1 h-10 rounded-lg bg-[color:var(--accent)] text-white text-[13px] disabled:opacity-50"
              >
                {restore.isPending ? "משחזר…" : "כן, שחזר"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestore(null)}
                className="flex-1 h-10 rounded-lg bg-surface border border-border text-[13px]"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

export default DaySnapshotsSheet;
