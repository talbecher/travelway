import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripsList } from "@/hooks/use-trips-list";
import { setActiveTripId, clearActiveTripId, getActiveTripId } from "@/lib/constants";
import { daysBetween } from "@/lib/format";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DateField } from "@/components/DateField";
import { Plane, Share2, Trash2 } from "lucide-react";
import { CURRENCIES, isValidCurrency, searchCountries, type Country } from "@/lib/countries";

// Only literal true / "true" means edit mode; edit=false is create mode.
const searchSchema = z.object({
  edit: z.preprocess((v) => v === true || v === "true", z.boolean()).optional(),
});

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
  const isEditing = edit === true && !!existingTrip;
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
  // Text in the country box; typing is NOT a selection.
  const [destination, setDestination] = useState("");
  const [pickedCountry, setPickedCountry] = useState<Country | null>(null);
  const [countryListOpen, setCountryListOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState(15000);
  // PIN is no longer shown; keep stored value on edit, existing default on create.
  const [pin, setPin] = useState("1717");
  const [currency, setCurrency] = useState("");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const initializedFor = useRef<string | null>(null);

  // 👤 פרופיל המטיילים
  const [travelPace, setTravelPace] = useState<"relaxed" | "balanced" | "intensive">("balanced");
  const [travelInterests, setTravelInterests] = useState<string[]>([]);
  const [foodBudget, setFoodBudget] = useState<"budget" | "medium" | "splurge">("medium");
  const [travelNotes, setTravelNotes] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    // Initialize once per trip after it loads; refetches never overwrite the form.
    if (isEditing && existingTrip && initializedFor.current !== existingTrip.id) {
      initializedFor.current = existingTrip.id;
      setTitle(existingTrip.title);
      setTitleTouched(true);
      setDestination(existingTrip.destination_country ?? "");
      setPickedCountry(null);
      setStartDate(existingTrip.start_date);
      setEndDate(existingTrip.end_date);
      setTravelers(existingTrip.num_travelers);
      setBudget(Number(existingTrip.total_budget_ils));
      setPin(existingTrip.entry_pin);
      setCurrency(existingTrip.currency_code);
      setCurrencyTouched(true); // saved currency is a protected choice
      setTravelPace((existingTrip.travel_pace as "relaxed" | "balanced" | "intensive") ?? "balanced");
      setTravelInterests(existingTrip.travel_interests ?? []);
      setFoodBudget((existingTrip.food_budget as "budget" | "medium" | "splurge") ?? "medium");
      setTravelNotes(existingTrip.travel_notes ?? "");
    }
  }, [isEditing, existingTrip]);

  useEffect(() => {
    if (!titleTouched) setTitle(autoTitle(pickedCountry?.he ?? "", startDate));
  }, [pickedCountry, startDate, titleTouched]);

  function pickCountry(c: Country) {
    setPickedCountry(c);
    setDestination(c.he);
    setCountryListOpen(false);
    if (!currencyTouched) setCurrency(c.currency);
  }

  const countryResults = searchCountries(pickedCountry && destination === pickedCountry.he ? "" : destination).slice(0, 8);
  const suggestCurrency = pickedCountry && currencyTouched && currency !== pickedCountry.currency ? pickedCountry.currency : null;

  // Destination actually saved: picked country, else (edit only) the original stored text unchanged.
  const savedDestination = pickedCountry ? pickedCountry.he : (isEditing ? existingTrip?.destination_country ?? "" : "");

  const submit = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("חסר שם טיול");
      if (!isEditing && !pickedCountry) throw new Error("בחרו מדינה מהרשימה");
      if (!savedDestination.trim()) throw new Error("חסר יעד");
      if (!(isEditing && currency === existingTrip?.currency_code) && !isValidCurrency(currency)) throw new Error("בחרו מטבע יעד");
      if (!startDate || !endDate) throw new Error("חסרים תאריכים");
      const numDays = daysBetween(startDate, endDate) + 1;
      if (numDays <= 0) throw new Error("תאריכים לא תקינים");

      if (isEditing && existingTrip) {
        // Update trip
        const { error: upErr } = await supabase.from("trips").update({
          title: title.trim(),
          destination_country: savedDestination.trim(),
          start_date: startDate,
          end_date: endDate,
          num_travelers: travelers,
          total_budget_ils: budget,
          currency_code: currency,
          entry_pin: pin || "0000",
          travel_pace: travelPace,
          travel_interests: travelInterests,
          food_budget: foodBudget,
          travel_notes: travelNotes.trim() || null,
        }).eq("id", existingTrip.id);
        if (upErr) throw upErr;

        // Target currency changed -> the stored manual rate is no longer valid.
        if (existingTrip.currency_code !== currency) {
          await supabase.from("settings")
            .update({ foreign_currency: currency, manual_exchange_rate: null })
            .eq("trip_id", existingTrip.id);
        }

        // Active itinerary version for this trip (create one if missing)
        const { data: versions, error: vErr } = await supabase
          .from("itinerary_versions")
          .select("id, is_active")
          .eq("trip_id", existingTrip.id)
          .order("created_at");
        if (vErr) throw vErr;
        let versionId = (versions ?? []).find((v) => v.is_active)?.id ?? versions?.[0]?.id ?? null;
        if (!versionId) {
          const { data: newV, error: nvErr } = await supabase
            .from("itinerary_versions")
            .insert({ trip_id: existingTrip.id, name: "המסלול שלי", source: "manual", is_active: true })
            .select("id")
            .single();
          if (nvErr) throw nvErr;
          versionId = newV.id;
        }

        // Reconcile itinerary_days: keep existing, add missing, delete extra (only if no entries)
        const { data: existingDays, error: dErr } = await supabase
          .from("itinerary_days").select("id, day_number, date").eq("trip_id", existingTrip.id)
          .eq("version_id", versionId).order("day_number");
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
            trip_id: existingTrip.id, version_id: versionId, day_number: d.day_number, date: d.date, city_label: null,
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
          destination_country: savedDestination.trim(),
          start_date: startDate,
          end_date: endDate,
          num_travelers: travelers,
          total_budget_ils: budget,
          currency_code: currency,
          entry_pin: pin || "0000",
          travel_pace: travelPace,
          travel_interests: travelInterests,
          food_budget: foodBudget,
          travel_notes: travelNotes.trim() || null,
        })
        .select()
        .single();
      if (tripErr) throw tripErr;

      const { data: version, error: verErr } = await supabase
        .from("itinerary_versions")
        .insert({ trip_id: trip.id, name: "המסלול שלי", source: "manual", is_active: true })
        .select("id")
        .single();
      if (verErr) throw verErr;

      const days = Array.from({ length: numDays }).map((_, i) => {
        return {
          trip_id: trip.id,
          version_id: version.id,
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
        onSubmit={(e) => { e.preventDefault(); if (submit.isPending || submit.isSuccess) return; if (!assertOnline()) return; submit.mutate(); }}
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
          <Field label="תקציב (ILS)">
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

        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 h-12 text-sm font-medium"
          >
            <span>👤 פרופיל המטיילים</span>
            <span className="text-muted-foreground text-xs">{profileOpen ? "▲" : "▼"}</span>
          </button>
          {profileOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
              <Field label="קצב הטיול">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["relaxed", "🌿 רגוע"],
                    ["balanced", "⚖️ מאוזן"],
                    ["intensive", "⚡ אינטנסיבי"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTravelPace(value)}
                      className={`h-11 rounded-lg border text-[13px] font-medium transition-colors ${
                        travelPace === value
                          ? "bg-[color:var(--accent)] text-white border-transparent"
                          : "bg-background border-input"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="מה אנחנו אוהבים">
                <div className="flex flex-wrap gap-2">
                  {([
                    ["food", "🍜 אוכל"],
                    ["culture", "⛩ תרבות"],
                    ["nature", "🌿 טבע"],
                    ["shopping", "🛍 קניות"],
                    ["experiences", "🎭 חוויות"],
                    ["history", "🏛 היסטוריה"],
                  ] as const).map(([value, label]) => {
                    const active = travelInterests.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setTravelInterests((cur) =>
                            cur.includes(value)
                              ? cur.filter((i) => i !== value)
                              : [...cur, value]
                          )
                        }
                        className={`h-9 px-3 rounded-full border text-[13px] transition-colors ${
                          active
                            ? "bg-[color:var(--accent)] text-white border-transparent"
                            : "bg-background border-input"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="תקציב אוכל ליום">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["budget", "₪ חסכוני"],
                    ["medium", "₪₪ בינוני"],
                    ["splurge", "₪₪₪ פרמיום"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFoodBudget(value)}
                      className={`h-11 rounded-lg border text-[13px] font-medium transition-colors ${
                        foodBudget === value
                          ? "bg-[color:var(--accent)] text-white border-transparent"
                          : "bg-background border-input"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="הערות למתכנן AI">
                <textarea
                  value={travelNotes}
                  onChange={(e) => setTravelNotes(e.target.value.slice(0, 200))}
                  rows={3}
                  maxLength={200}
                  placeholder="צמחונים, אוהבים לקום מוקדם, לא אוהבים מוזיאונים ארוכים..."
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm resize-none"
                />
              </Field>
            </div>
          )}
        </section>

        <button type="submit" disabled={submit.isPending}
          className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50">
          {submit.isPending ? (isEditing ? "שומר..." : "יוצר...") : (isEditing ? "שמור שינויים" : "צור את הטיול")}
        </button>

        <button type="button" onClick={() => navigate({ to: "/" })}
          className="w-full h-10 text-sm text-muted-foreground">
          ביטול
        </button>
      </form>
      {!isEditing && (submit.isPending || submit.isSuccess) && (
        <CreatingOverlay destination={destination.trim() || title.trim()} />
      )}
    </div>
  );
}

function CreatingOverlay({ destination }: { destination: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-background/90 backdrop-blur-sm px-6"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
        <div className="relative mx-auto mb-5 h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-[color:var(--accent)]/15 motion-safe:animate-ping" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--accent)]/20 text-[color:var(--accent)]">
            <Plane size={34} className="motion-safe:animate-bounce" />
          </div>
        </div>
        <h2 className="text-lg font-medium">
          {destination ? `מכינים את הטיול שלך ל־${destination}…` : "מכינים את הטיול שלך…"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">רק רגע, זה לא ייקח הרבה זמן</p>
      </div>
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

