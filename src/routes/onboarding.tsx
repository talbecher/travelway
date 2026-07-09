import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setActiveTripId } from "@/lib/constants";
import { daysBetween } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState(15000);
  const [pin, setPin] = useState("1717");
  const [currency, setCurrency] = useState("JPY");

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("חסר שם טיול");
      if (!destination.trim()) throw new Error("חסר יעד");
      if (!startDate || !endDate) throw new Error("חסרים תאריכים");
      const numDays = daysBetween(startDate, endDate) + 1;
      if (numDays <= 0) throw new Error("תאריכים לא תקינים");

      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .insert({
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

      // Generate days
      const days = Array.from({ length: numDays }).map((_, i) => {
        const d = new Date(startDate + "T00:00:00");
        d.setDate(d.getDate() + i);
        return {
          trip_id: trip.id,
          day_number: i + 1,
          date: d.toISOString().slice(0, 10),
          city_label: destination.trim(),
        };
      });
      const { error: daysErr } = await supabase.from("itinerary_days").insert(days);
      if (daysErr) throw daysErr;

      // Default settings
      await supabase.from("settings").insert({
        trip_id: trip.id,
        base_currency: "ILS",
        foreign_currency: currency,
      });

      return trip.id;
    },
    onSuccess: (tripId) => {
      setActiveTripId(tripId);
      toast.success("הטיול נוצר");
      // Full reload so TRIP_ID module constant picks up new value
      window.location.href = "/";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pt-4 pb-8 space-y-5">
      <header>
        <h1 className="text-2xl font-medium">טיול חדש</h1>
        <p className="text-sm text-muted-foreground">בואו נבנה את הטיול הבא</p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
        className="space-y-4"
      >
        <Field label="שם הטיול">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            placeholder="למשל: איטליה 2027"
            className="w-full rounded-lg bg-background border border-input px-3 h-11" />
        </Field>
        <Field label="יעד">
          <input value={destination} onChange={(e) => setDestination(e.target.value)} required
            placeholder="Italy"
            dir="ltr"
            className="w-full rounded-lg bg-background border border-input px-3 h-11" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מתאריך">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
          <Field label="עד תאריך">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מספר מטיילים">
            <input type="number" min={1} value={travelers}
              onChange={(e) => setTravelers(Number(e.target.value))}
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
          <Field label="תקציב (₪)">
            <input type="number" min={0} step={100} value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full rounded-lg bg-background border border-input px-3 h-11" />
          </Field>
        </div>
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

        <button type="submit" disabled={create.isPending}
          className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium disabled:opacity-50">
          {create.isPending ? "יוצר..." : "צור טיול"}
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
