import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface RatingSheetProps {
  recId: string;
  recName: string;
  initialRating?: number;
  initialReview?: string;
  onClose: () => void;
}

const REACTIONS: { emoji: string; label: string; rating: number }[] = [
  { emoji: "😍", label: "מדהים", rating: 5 },
  { emoji: "👍", label: "טוב", rating: 4 },
  { emoji: "😐", label: "בסדר", rating: 3 },
  { emoji: "👎", label: "לא שווה", rating: 2 },
];

export function RatingSheet({
  recId,
  recName,
  initialRating,
  initialReview,
  onClose,
}: RatingSheetProps) {
  const qc = useQueryClient();
  const [rating, setRating] = useState<number | undefined>(initialRating);
  const [review, setReview] = useState(initialReview ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("recommendations")
        .update({ rating, review: review.trim() || null })
        .eq("id", recId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["linked-recs"] });
      qc.invalidateQueries({ queryKey: ["recs"] });
      toast.success("✅ נשמר!");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  function toggleStar(n: number) {
    setRating((prev) => (prev === n ? undefined : n));
  }

  function applyReaction(r: number) {
    setRating((prev) => (prev === r ? undefined : r));
  }

  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title="">
      <div className="pt-2 pb-4 space-y-5" dir="rtl">
        <div className="text-center space-y-2">
          <div className="text-[48px] leading-none">✅</div>
          <h2 className="text-[18px] font-bold text-foreground">
            איך היה {recName}?
          </h2>
          <p className="text-[13px] text-muted-foreground">דירוג אופציונלי</p>
        </div>

        {/* Stars */}
        <div className="flex items-center justify-center gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = typeof rating === "number" && rating >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleStar(n)}
                className="w-11 h-11 flex items-center justify-center text-[34px] leading-none transition-transform active:scale-90"
                style={{ color: filled ? "var(--accent)" : "var(--muted-foreground)" }}
                aria-label={`דירוג ${n}`}
              >
                {filled ? "★" : "☆"}
              </button>
            );
          })}
        </div>

        {/* Quick reactions */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {REACTIONS.map((r) => {
            const active = rating === r.rating;
            return (
              <button
                key={r.rating}
                type="button"
                onClick={() => applyReaction(r.rating)}
                className={
                  "px-3 h-9 rounded-full text-[13px] font-medium border transition-colors " +
                  (active
                    ? "bg-[color:var(--accent)]/20 border-[color:var(--accent)] text-foreground"
                    : "bg-muted border-border text-muted-foreground hover:bg-muted/70")
                }
              >
                <span className="ml-1">{r.emoji}</span>
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Review */}
        <div>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="כתבו משהו... (אופציונלי)"
            className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-[color:var(--accent)] resize-none"
          />
          <div className="text-[11px] text-muted-foreground text-left mt-1" dir="ltr">
            {review.length}/200
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            💾 שמור דירוג
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl border border-border bg-card text-foreground text-[15px] font-medium"
          >
            דלג
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
