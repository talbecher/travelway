import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import { PlacesSearch, type SelectedPlace } from "@/components/PlacesSearch";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useDays, useRecs } from "@/hooks/use-trip";
import { todayISO } from "@/lib/format";

type Step = "search" | "confirm" | "rate" | "done";

const REACTIONS = [
  { emoji: "😍", label: "מדהים", rating: 5 },
  { emoji: "👍", label: "טוב", rating: 4 },
  { emoji: "😐", label: "בסדר", rating: 3 },
  { emoji: "👎", label: "לא שווה", rating: 2 },
];

const FOOD_TYPES = ["restaurant", "cafe", "food", "bakery", "bar", "meal_takeaway", "coffee_shop"];
const HOTEL_TYPES = ["lodging", "hotel"];

function guessType(primaryType?: string | null): "food" | "attraction" | "hotel" {
  if (!primaryType) return "attraction";
  const t = primaryType.toLowerCase();
  if (FOOD_TYPES.some((x) => t.includes(x))) return "food";
  if (HOTEL_TYPES.some((x) => t.includes(x))) return "hotel";
  return "attraction";
}

function guessEntryType(primaryType?: string | null): "food" | "attraction" | "hotel_checkin" {
  const t = guessType(primaryType);
  if (t === "food") return "food";
  if (t === "hotel") return "hotel_checkin";
  return "attraction";
}

function getCurrentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const TYPE_LABEL: Record<string, string> = {
  food: "🍜 אוכל",
  hotel: "🏨 לינה",
  attraction: "⛩ אטרקציה",
};

export function HayinuKanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const tripId = useActiveTripId();
  const { data: recs } = useRecs();
  const { data: days } = useDays();

  const [step, setStep] = useState<Step>("search");
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [savedRecId, setSavedRecId] = useState<string | null>(null);
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);

  const name = selectedPlace?.name ?? manualName;
  const today = todayISO();
  const todayDay = (days ?? []).find((d) => d.date === today);

  function reset() {
    setStep("search");
    setSelectedPlace(null);
    setManualName("");
    setManualInput("");
    setSavedRecId(null);
    setRating(undefined);
    setReview("");
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleSaveVisit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const existing = (recs ?? []).find(
        (r) =>
          (selectedPlace?.google_maps_url && r.google_maps_url === selectedPlace.google_maps_url) ||
          r.name === name,
      );
      let recId: string;
      if (existing) {
        const { error } = await supabase
          .from("recommendations")
          .update({ status: "visited" })
          .eq("id", existing.id);
        if (error) throw error;
        recId = existing.id;
        setRating(existing.rating ?? undefined);
        setReview(existing.review ?? "");
      } else {
        const { data, error } = await supabase
          .from("recommendations")
          .insert({
            trip_id: tripId,
            name: name.trim(),
            type: guessType(selectedPlace?.primaryType),
            city: selectedPlace?.city ?? null,
            address: selectedPlace?.address ?? null,
            latitude: selectedPlace?.latitude ?? null,
            longitude: selectedPlace?.longitude ?? null,
            google_maps_url: selectedPlace?.google_maps_url ?? null,
            photo_url: selectedPlace?.photo_url ?? null,
            status: "visited" as const,
          })
          .select("id")
          .single();
        if (error) throw error;
        recId = data.id;
      }
      setSavedRecId(recId);
      qc.invalidateQueries({ queryKey: ["recs", tripId] });
      qc.invalidateQueries({ queryKey: ["linked-recs"] });
      setStep("rate");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  }

  async function saveRating() {
    if (!savedRecId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("recommendations")
        .update({ rating: rating ?? null, review: review.trim() || null })
        .eq("id", savedRecId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["recs", tripId] });
      qc.invalidateQueries({ queryKey: ["linked-recs"] });
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setBusy(false);
    }
  }

  async function addToToday() {
    if (!todayDay) return;
    setBusy(true);
    try {
      const { data: existing, error: readErr } = await supabase
        .from("day_entries")
        .select("display_order")
        .eq("day_id", todayDay.id)
        .order("display_order", { ascending: false })
        .limit(1);
      if (readErr) throw readErr;
      const nextOrder = (existing?.[0]?.display_order ?? -1) + 1;

      const { error } = await supabase.from("day_entries").insert({
        day_id: todayDay.id,
        entry_type: guessEntryType(selectedPlace?.primaryType),
        title: name.trim(),
        location_name: selectedPlace?.address ?? null,
        latitude: selectedPlace?.latitude ?? null,
        longitude: selectedPlace?.longitude ?? null,
        google_maps_url: selectedPlace?.google_maps_url ?? null,
        photo_url: selectedPlace?.photo_url ?? null,
        time_of_day: getCurrentTime(),
        display_order: nextOrder,
        linked_recommendation_id: savedRecId,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["day-entries", todayDay.id] });
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("✅ נוסף למסלול!");
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בהוספה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && close()} title="">
      <div className="pt-1 pb-4 space-y-5" dir="rtl">
        {step === "search" && (
          <>
            <h2 className="text-[18px] font-bold text-foreground text-center">איפה הייתם?</h2>
            <PlacesSearch
              placeholder="חפשו מסעדה, קפה, אטרקציה..."
              onSelect={(p) => {
                setSelectedPlace(p);
                setManualName("");
                setStep("confirm");
              }}
            />
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              או
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2">
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="הזינו שם ידנית..."
                className="flex-1 rounded-lg bg-background border border-input px-3 h-11 outline-none focus:border-[color:var(--accent)]"
              />
              <button
                type="button"
                disabled={!manualInput.trim()}
                onClick={() => {
                  setManualName(manualInput.trim());
                  setSelectedPlace(null);
                  setStep("confirm");
                }}
                className="px-4 h-11 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50"
              >
                המשך ›
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="text-center space-y-1">
              <div className="text-[18px] font-bold text-foreground">{name}</div>
              {selectedPlace ? (
                <>
                  <div className="text-[13px] text-muted-foreground" dir="ltr">
                    {selectedPlace.address}
                  </div>
                  <div className="inline-block mt-1 px-2.5 h-7 leading-7 rounded-full bg-muted text-[12px] text-muted-foreground">
                    {TYPE_LABEL[guessType(selectedPlace.primaryType)]}
                  </div>
                </>
              ) : (
                <div className="inline-block mt-1 px-2.5 h-7 leading-7 rounded-full bg-muted text-[12px] text-muted-foreground">
                  מיקום ידני
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveVisit()}
                className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[15px] disabled:opacity-60"
              >
                ✅ אישור — היינו כאן!
              </button>
              <button
                type="button"
                onClick={() => setStep("search")}
                className="w-full h-11 rounded-xl border border-border bg-card text-foreground text-[15px] font-medium"
              >
                ← חזור
              </button>
            </div>
          </>
        )}

        {step === "rate" && (
          <>
            <div className="text-center space-y-1">
              <div className="text-[40px] leading-none">✅</div>
              <h2 className="text-[18px] font-bold text-foreground">איך היה {name}?</h2>
              <p className="text-[13px] text-muted-foreground">דירוג אופציונלי</p>
            </div>

            <div className="flex items-center justify-center gap-1" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = typeof rating === "number" && rating >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating((p) => (p === n ? undefined : n))}
                    className="w-11 h-11 flex items-center justify-center text-[34px] leading-none active:scale-90 transition-transform"
                    style={{ color: filled ? "var(--accent)" : "var(--muted-foreground)" }}
                    aria-label={`דירוג ${n}`}
                  >
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {REACTIONS.map((r) => {
                const active = rating === r.rating;
                return (
                  <button
                    key={r.rating}
                    type="button"
                    onClick={() => setRating((p) => (p === r.rating ? undefined : r.rating))}
                    className={
                      "px-3 h-9 rounded-full text-[13px] font-medium border transition-colors " +
                      (active
                        ? "bg-[color:var(--accent)]/20 border-[color:var(--accent)] text-foreground"
                        : "bg-muted border-border text-muted-foreground")
                    }
                  >
                    <span className="ml-1">{r.emoji}</span>
                    {r.label}
                  </button>
                );
              })}
            </div>

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

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveRating()}
                className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[15px] disabled:opacity-60"
              >
                💾 שמור
              </button>
              <button
                type="button"
                onClick={() => setStep("done")}
                className="w-full h-11 rounded-xl border border-border bg-card text-foreground text-[15px] font-medium"
              >
                דלג
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="text-center space-y-1">
              <div className="text-[48px] leading-none">✅</div>
              <h2 className="text-[18px] font-bold text-foreground">נשמר!</h2>
              <p className="text-[13px] text-muted-foreground">{name} נוסף למקומות שביקרתם</p>
            </div>
            {todayDay ? (
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-muted-foreground text-center">
                  רוצים להוסיף גם למסלול של היום?
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addToToday()}
                  className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[15px] disabled:opacity-60"
                >
                  ➕ הוסף ליום {todayDay.day_number}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="w-full h-11 rounded-xl border border-border bg-card text-foreground text-[15px] font-medium"
                >
                  סגור
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  toast.success("✅ נשמר בהמלצות!");
                  close();
                }}
                className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white font-semibold text-[15px]"
              >
                סגור
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
