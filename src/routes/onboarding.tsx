import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripsList } from "@/hooks/use-trips-list";
import { setActiveTripId, clearActiveTripId, getActiveTripId } from "@/lib/constants";
import { daysBetween } from "@/lib/format";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Share2, Trash2 } from "lucide-react";

const searchSchema = z.object({ edit: z.coerce.boolean().optional() });

export const Route = createFileRoute("/onboarding")({
  validateSearch: searchSchema,
  component: Onboarding,
});

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function autoTitle(destination: string, start: string) {
  const dest = destination.trim();
  if (!dest) return "";
  const year = start ? Number(start.slice(0, 4)) : new Date().getFullYear();
  return `${dest} ${year}`;
}

function Onboarding() {
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const { data: existingTrip } = useTrip();
  const { user } = useAuth();
  const { data: allTrips = [] } = useTripsList(user?.id);
  const qc = useQueryClient();
  const isEditing = !!edit && !!existingTrip;
  const isOwner = !!existingTrip && !!user && existingTrip.owner_id === user.id;

  const deleteTrip = useMutation({
    mutationFn: async () => {
      if (!existingTrip) throw new Error("אין טיול פעיל");
      const { error } = await supabase.from("trips").delete().eq("id", existingTrip.id);
      if (error) throw error;
      return existingTrip.id;
    },
    onSuccess: (deletedId) => {
      const remaining = allTrips.filter((t) => t.id !== deletedId);
      const activeId = getActiveTripId();
      if (deletedId === activeId) {
        const nextId = remaining[0]?.id ?? null;
        if (nextId) setActiveTripId(nextId);
        else clearActiveTripId();
      }
      qc.clear();
      toast.success("הטיול נמחק");
      if (remaining.length === 0) navigate({ to: "/onboarding" });
      else navigate({ to: "/" });
    },
    onError: (e: Error) => toast.error(e.message || "המחיקה נכשלה"),
  });

  function handleDeleteClick() {
    if (!existingTrip || deleteTrip.isPending) return;
    const ok = window.confirm(`למחוק את הטיול "${existingTrip.title}"? הפעולה בלתי הפיכה.`);
    if (!ok) return;
    deleteTrip.mutate();
  }

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState(15000);
  const [pin, setPin] = useState("1717");
  const [currency, setCurrency] = useState("JPY");

  useEffect(() => {
    if (isEditing && existingTrip) {
      setTitle(existingTrip.title);
      setTitleTouched(true);
      setDestination(existingTrip.destination_country ?? "");
      setStartDate(existingTrip.start_date);
      setEndDate(existingTrip.end_date);
      setTravelers(existingTrip.num_travelers);
      setBudget(Number(existingTrip.total_budget_ils));
      setPin(existingTrip.entry_pin);
      setCurrency(existingTrip.currency_code);
    }
  }, [isEditing, existingTrip]);

  useEffect(() => {
    if (!titleTouched) setTitle(autoTitle(destination, startDate));
  }, [destination, startDate, titleTouched]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("חסר שם טיול");
      if (!destination.trim()) throw new Error("חסר יעד");
      if (!startDate || !endDate) throw new Error("חסרים תאריכים");
      const numDays = daysBetween(startDate, endDate) + 1;
      if (numDays <= 0) throw new Error("תאריכים לא תקינים");

      if (isEditing && existingTrip) {
        // Update trip
        const { error: upErr } = await supabase.from("trips").update({
          title: title.trim(),
          destination_country: destination.trim(),
          start_date: startDate,
          end_date: endDate,
          num_travelers: travelers,
          total_budget_ils: budget,
          currency_code: currency,
          entry_pin: pin || "0000",
        }).eq("id", existingTrip.id);
        if (upErr) throw upErr;

        // Reconcile itinerary_days: keep existing, add missing, delete extra (only if no entries)
        const { data: existingDays, error: dErr } = await supabase
          .from("itinerary_days").select("id, day_number, date").eq("trip_id", existingTrip.id).order("day_number");
        if (dErr) throw dErr;

        const desired: { day_number: number; date: string }[] = Array.from({ length: numDays }).map((_, i) => {
          return { day_number: i + 1, date: addDaysISO(startDate, i) };
        });

        // Update dates of overlapping days
        const overlap = Math.min(existingDays?.length ?? 0, desired.length);
        for (let i = 0; i < overlap; i++) {
          const cur = existingDays![i];
          const want = desired[i];
          if (cur.date !== want.date || cur.day_number !== want.day_number) {
            await supabase.from("itinerary_days")
              .update({ date: want.date, day_number: want.day_number })
              .eq("id", cur.id);
          }
        }

        // Add missing days at the end
        if (desired.length > overlap) {
          const toAdd = desired.slice(overlap).map((d) => ({
            trip_id: existingTrip.id, day_number: d.day_number, date: d.date, city_label: null,
          }));
          const { error: addErr } = await supabase.from("itinerary_days").insert(toAdd);
          if (addErr) throw addErr;
        }

        // Trim from the end, only if no entries exist
        if ((existingDays?.length ?? 0) > desired.length) {
          const extras = existingDays!.slice(desired.length);
          for (const d of extras) {
            const { count } = await supabase.from("day_entries").select("id", { count: "exact", head: true }).eq("day_id", d.id);
            if ((count ?? 0) === 0) {
              await supabase.from("itinerary_days").delete().eq("id", d.id);
            } else {
              toast.message(`יום ${d.day_number} נשמר — יש בו פריטים`);
            }
          }
        }

        return existingTrip.id;
      }

      // Create new trip
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("נדרשת התחברות");
      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .insert({
          owner_id: uid,
          title: title.trim(),
          destination_country: destination.trim(),
          start_date: startDate,
          end_date: endDate,
          num_travelers: travelers,
          total_budget_ils: budget,
          currency_code: currency,
          entry_pin: pin || "0000",
        })
        .select()
        .single();
      if (tripErr) throw tripErr;

      const days = Array.from({ length: numDays }).map((_, i) => {
        return {
          trip_id: trip.id,
          day_number: i + 1,
          date: addDaysISO(startDate, i),
          city_label: null,
        };
      });
      const { error: daysErr } = await supabase.from("itinerary_days").insert(days);
      if (daysErr) throw daysErr;

      await supabase.from("settings").insert({
        trip_id: trip.id,
        base_currency: "ILS",
        foreign_currency: currency,
      });

      return trip.id;
    },
    onSuccess: (tripId) => {
      if (!isEditing) setActiveTripId(tripId);
      toast.success(isEditing ? "עודכן" : "הטיול נוצר");
      window.location.href = "/";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pt-4 pb-8 space-y-5">
      <header>
        <h1 className="text-2xl font-medium">{isEditing ? "עריכת טיול" : "טיול חדש"}</h1>
        <p className="text-sm text-muted-foreground">{isEditing ? "עדכון פרטי הטיול" : "בואו נבנה את הטיול הבא"}</p>
      </header>

      {isEditing && (
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="text-sm font-medium">הגדרות</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">מצב תצוגה</div>
            <ThemeToggle />
          </div>
          {existingTrip?.share_token && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">שיתוף טיול</div>
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}/join/${existingTrip.share_token}`;
                  try { await navigator.clipboard.writeText(url); toast.success("קישור השיתוף הועתק"); }
                  catch { toast.message(url); }
                }}
                className="flex items-center gap-2 h-9 px-3 rounded-full border border-border text-sm text-muted-foreground"
              >
                <Share2 size={14} /> העתק קישור
              </button>
            </div>
          )}
          {isOwner && (
            <div className="pt-2 border-t border-border flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">מחיקת הטיול</div>
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={deleteTrip.isPending}
                className="flex items-center gap-2 h-9 px-3 rounded-full border border-[color:var(--destructive)] text-sm text-[color:var(--destructive)] disabled:opacity-50"
              >
                <Trash2 size={14} /> {deleteTrip.isPending ? "מוחק..." : "מחק טיול זה"}
              </button>
            </div>
          )}
        </section>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
        className="space-y-4"
      >
        <Field label="יעד">
          <input value={destination} onChange={(e) => setDestination(e.target.value)} required
            placeholder="Italy"
            dir="ltr"
            className="w-full rounded-lg bg-background border border-input px-3 h-11" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מתאריך">
            <DateField value={startDate} onChange={setStartDate} placeholder="בחר תאריך" />
          </Field>
          <Field label="עד תאריך">
            <DateField value={endDate} onChange={setEndDate} placeholder="בחר תאריך" min={startDate || undefined} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מספר מטיילים">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setTravelers(Math.max(1, travelers - 1))}
                className="w-11 h-11 rounded-lg border border-input text-lg min-h-0">−</button>
              <div className="flex-1 text-center h-11 leading-[2.75rem] rounded-lg bg-background border border-input tabular-nums">{travelers}</div>
              <button type="button" onClick={() => setTravelers(Math.min(10, travelers + 1))}
                className="w-11 h-11 rounded-lg border border-input text-lg min-h-0">+</button>
            </div>
          </Field>
          <Field label="תקציב (₪)">
            <input type="number" min={0} step={100} value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
        </div>
        <Field label="שם הטיול">
          <input value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} required
            placeholder="למשל: איטליה 2027"
            className="w-full rounded-lg bg-background border border-input px-3 h-11" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מטבע יעד">
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              dir="ltr" placeholder="EUR"
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
          <Field label="קוד כניסה (4 ספרות)">
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric" dir="ltr"
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
        </div>

        <button type="submit" disabled={submit.isPending}
          className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
          {submit.isPending ? (isEditing ? "שומר..." : "יוצר...") : (isEditing ? "שמור שינויים" : "צור את הטיול")}
        </button>

        <button type="button" onClick={() => navigate({ to: "/" })}
          className="w-full h-10 text-sm text-muted-foreground">
          ביטול
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

