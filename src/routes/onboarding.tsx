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
import { Plane, Share2, Trash2, Pencil, Compass, CalendarDays, Users, Wallet, Tag, Coins, Sparkles, ChevronDown, ArrowLeft } from "lucide-react";
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
  const [destEditing, setDestEditing] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

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
    // Auto-title is for new trips only; in edit the saved/typed title is never overwritten.
    if (isEditing || titleTouched) return;
    setTitle(autoTitle(pickedCountry?.he ?? "", startDate));
  }, [isEditing, pickedCountry, startDate, titleTouched]);

  function pickCountry(c: Country) {
    setPickedCountry(c);
    setDestination(c.he);
    setCountryListOpen(false);
    if (!currencyTouched) setCurrency(c.currency ?? "");
  }

  const countryResults = searchCountries(pickedCountry && destination === pickedCountry.he ? "" : destination).slice(0, 8);
  const suggestCurrency = pickedCountry?.currency && currencyTouched && currency !== pickedCountry.currency ? pickedCountry.currency : null;

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

  const showPassport = !!pickedCountry && !destEditing;
  const chip = (active: boolean) =>
    `rounded-full border text-[13px] font-medium transition-colors ${active ? "bg-[color:var(--ob-green)] text-[color:var(--ob-on-green)] border-transparent" : "bg-[color:var(--ob-card)] border-[color:var(--ob-line)] text-[color:var(--ob-ink)]"}`;

  return (
    <div className="ob-root -mx-4 px-4 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))] space-y-4 min-w-0">
      <style>{OB_CSS}</style>
      <header className="space-y-1">
        <h1 className="text-[28px] font-bold text-[color:var(--ob-ink)]">{isEditing ? "עריכת הטיול" : "לאן נוסעים?"}</h1>
        <p className="text-sm text-[color:var(--ob-muted)]">{isEditing ? "עדכנו את פרטי הטיול" : "כמה פרטים קטנים, והמסע מתחיל"}</p>
      </header>

      {isEditing && (
        <section className="ob-card p-4 space-y-3">
          <div className="text-sm font-semibold">הגדרות</div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-[color:var(--ob-muted)]">מצב תצוגה</div>
            <ThemeToggle />
          </div>
          {existingTrip?.share_token && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-[color:var(--ob-muted)]">שיתוף טיול</div>
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}/join/${existingTrip.share_token}`;
                  try { await navigator.clipboard.writeText(url); toast.success("קישור השיתוף הועתק"); }
                  catch { toast.message(url); }
                }}
                className="flex items-center gap-2 h-11 px-3 rounded-full border border-[color:var(--ob-line)] text-sm"
              >
                <Share2 size={14} /> העתק קישור
              </button>
            </div>
          )}
          {isOwner && (
            <div className="pt-2 border-t border-[color:var(--ob-line)] flex items-center justify-between gap-3">
              <div className="text-sm text-[color:var(--ob-muted)]">מחיקת הטיול</div>
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={deleteTrip.isPending}
                className="flex items-center gap-2 h-11 px-3 rounded-full border border-[color:var(--destructive)] text-sm text-[color:var(--destructive)] disabled:opacity-50"
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
        {/* Destination */}
        <section className={`ob-card p-4 ${showPassport ? "ob-card-selected" : ""}`}>
          {showPassport && pickedCountry ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[color:var(--ob-muted)]">היעד שלכם</div>
                <div className="text-[30px] font-bold leading-tight text-[color:var(--ob-ink)] break-words">{pickedCountry.he}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--ob-muted)]">
                  <span aria-hidden="true" className="text-lg leading-none">{flagEmoji(pickedCountry.code)}</span>
                  <span dir="ltr">{pickedCountry.en}</span>
                  <span className="rounded-full bg-[color:var(--ob-green-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--ob-green)]">נבחר</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDestEditing(true)}
                aria-label="שינוי יעד"
                className="flex h-11 w-11 min-w-11 items-center justify-center rounded-full bg-[color:var(--ob-chip)] text-[color:var(--ob-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil size={18} />
              </button>
              <div aria-hidden="true" className="ob-stamp">
                <Plane size={18} />
                <span>TRAVEL</span>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="ob-country" className="text-sm font-semibold text-[color:var(--ob-ink)]">יעד</label>
              <div className="relative mt-2">
                <Compass size={18} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[color:var(--ob-green)]" />
                <input
                  id="ob-country"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    // Typing is not a selection; any change clears the previous pick.
                    setPickedCountry(null);
                    setCountryListOpen(true);
                  }}
                  onFocus={() => setCountryListOpen(true)}
                  onBlur={() => setTimeout(() => setCountryListOpen(false), 150)}
                  role="combobox"
                  aria-expanded={countryListOpen}
                  aria-controls="country-list"
                  aria-autocomplete="list"
                  placeholder="חפשו מדינה — יפן / Japan"
                  className="ob-input" style={{ paddingInlineStart: 40 }}
                />
                {countryListOpen && countryResults.length > 0 && (
                  <ul id="country-list" role="listbox"
                    className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-[color:var(--ob-line)] bg-popover shadow-md">
                    {countryResults.map((c) => (
                      <li key={c.code} role="option" aria-selected={pickedCountry?.code === c.code}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { pickCountry(c); setDestEditing(false); }}
                          className="w-full flex items-center justify-between gap-2 px-3 h-11 text-sm text-start hover:bg-muted">
                          <span className="truncate">{c.he}</span>
                          <span className="text-xs text-muted-foreground truncate" dir="ltr">{c.en}{c.currency ? ` · ${c.currency}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {!isEditing && destination.trim() && !pickedCountry && (
                <p className="mt-2 text-xs text-[color:var(--ob-muted)]">בחרו מדינה מהרשימה</p>
              )}
              {isEditing && !pickedCountry && destination !== (existingTrip?.destination_country ?? "") && (
                <p className="mt-2 text-xs text-[color:var(--ob-muted)]">היעד השמור יישאר ללא שינוי עד שתבחרו מדינה מהרשימה</p>
              )}
            </div>
          )}
        </section>

        {/* Trip details */}
        <section className="ob-card p-3 space-y-2.5">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="text-base font-semibold text-[color:var(--ob-ink)]">פרטי הטיול</h2>
            <span className="text-xs text-[color:var(--ob-muted)]">אפשר לשנות בהמשך</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="תאריך התחלה" icon={<CalendarDays size={14} />}>
              <DateField value={startDate} onChange={setStartDate} placeholder="בחר תאריך" labelFormat="dd.MM.yyyy" />
            </Tile>
            <Tile label="תאריך סיום" icon={<CalendarDays size={14} />}>
              <DateField value={endDate} onChange={setEndDate} placeholder="בחר תאריך" min={startDate || undefined} labelFormat="dd.MM.yyyy" />
            </Tile>
            <Tile label="מספר מטיילים" icon={<Users size={14} />}>
              <div className="flex items-center justify-between gap-1">
                <button type="button" aria-label="פחות מטיילים" onClick={() => setTravelers(Math.max(1, travelers - 1))}
                  className="w-11 h-11 min-h-0 rounded-lg text-lg text-[color:var(--ob-ink)]">−</button>
                <div className="flex-1 text-center font-semibold tabular-nums" aria-live="polite">{travelers}</div>
                <button type="button" aria-label="יותר מטיילים" onClick={() => setTravelers(Math.min(10, travelers + 1))}
                  className="w-11 h-11 min-h-0 rounded-lg text-lg text-[color:var(--ob-ink)]">+</button>
              </div>
            </Tile>
            <Tile label="תקציב (ILS)" icon={<Wallet size={14} />} htmlFor="ob-budget">
              <input id="ob-budget" type="number" min={0} step={100} value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="ob-input" />
            </Tile>
          </div>
          <Tile label="שם הטיול" icon={<Tag size={14} />} htmlFor="ob-title">
            <input id="ob-title" value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} required
              placeholder="למשל: איטליה 2027"
              className="ob-input" />
          </Tile>
          <div className="ob-tile">
            <div className="flex items-center gap-2">
              <Coins size={16} aria-hidden="true" className="text-[color:var(--ob-green)]" />
              <span className="text-xs font-medium text-[color:var(--ob-muted)]">מטבע יעד</span>
              <span className="flex-1 text-base font-semibold text-[color:var(--ob-ink)]" dir="ltr" style={{ textAlign: "end" }}>{currency || "—"}</span>
              <button type="button" onClick={() => setCurrencyOpen((o) => !o)} aria-expanded={currencyOpen || !currency}
                className="h-11 min-w-11 px-2 text-sm font-semibold text-[color:var(--ob-coral-text)]">
                שינוי
              </button>
            </div>
            {(currencyOpen || !currency) && (
              <select
                aria-label="מטבע יעד"
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); setCurrencyTouched(true); }}
                dir="ltr"
                className="ob-input mt-2"
              >
                <option value="" disabled>בחרו מטבע</option>
                {currency && !CURRENCIES.includes(currency) && <option value={currency}>{currency}</option>}
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {suggestCurrency && (
              <button type="button" onClick={() => setCurrency(suggestCurrency)}
                className="mt-1 min-h-11 text-start text-sm text-[color:var(--ob-coral-text)] underline">
                המטבע של {pickedCountry?.he} הוא {suggestCurrency} — לעבור אליו?
              </button>
            )}
          </div>
        </section>

        {/* AI preferences */}
        <section className="ob-card overflow-hidden">
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            aria-expanded={profileOpen}
            className="w-full flex items-center gap-2 px-4 h-14 text-sm font-semibold text-[color:var(--ob-ink)]"
          >
            <Sparkles size={18} aria-hidden="true" className="text-[color:var(--ob-coral-text)]" />
            <span className="flex-1 text-start">העדפות לתכנון עם AI</span>
            <span className="rounded-full bg-[color:var(--ob-chip)] px-2 py-0.5 text-xs font-medium text-[color:var(--ob-muted)]">אופציונלי</span>
            <ChevronDown size={18} aria-hidden="true" className={`transition-transform ${profileOpen ? "rotate-180" : ""}`} />
          </button>
          {profileOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-[color:var(--ob-line)] pt-4">
              <p className="text-sm text-[color:var(--ob-muted)]">ההעדפות נכללות בייצוא ל-AI כדי לעזור בתכנון המסלול</p>
              <Field label="קצב הטיול">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["relaxed", "🌿 רגוע"],
                    ["balanced", "⚖️ מאוזן"],
                    ["intensive", "⚡ אינטנסיבי"],
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setTravelPace(value)}
                      aria-pressed={travelPace === value}
                      className={`h-11 px-1 ${chip(travelPace === value)}`}>
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
                      <button key={value} type="button" aria-pressed={active}
                        onClick={() =>
                          setTravelInterests((cur) =>
                            cur.includes(value) ? cur.filter((i) => i !== value) : [...cur, value]
                          )
                        }
                        className={`h-11 px-3 ${chip(active)}`}>
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
                    <button key={value} type="button" onClick={() => setFoodBudget(value)}
                      aria-pressed={foodBudget === value}
                      className={`h-11 px-1 ${chip(foodBudget === value)}`}>
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
                  className="ob-input h-auto py-2 text-sm resize-none"
                />
              </Field>
            </div>
          )}
        </section>

        <div className="pt-2 space-y-1">
          <button type="button" onClick={() => navigate({ to: "/" })}
            className="w-full h-11 text-sm font-medium text-[color:var(--ob-muted)]">
            ביטול
          </button>
          <button type="submit" disabled={submit.isPending}
            className="ob-cta w-full h-14 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50">
            {submit.isPending ? (isEditing ? "שומר..." : "יוצר...") : (isEditing ? "שמור שינויים" : "צור את הטיול")}
            {!submit.isPending && <ArrowLeft size={18} aria-hidden="true" />}
          </button>
        </div>
      </form>
      {!isEditing && (submit.isPending || submit.isSuccess) && (
        <CreatingOverlay destination={destination.trim() || title.trim()} />
      )}
    </div>
  );
}

function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function Tile({ label, icon, htmlFor, children }: { label: string; icon: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="ob-tile min-w-0">
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ob-muted)]">
        <span aria-hidden="true" className="text-[color:var(--ob-green)]">{icon}</span>
        {label}
      </label>
      <div className="mt-1 min-w-0">{children}</div>
    </div>
  );
}

const OB_CSS = `
.ob-root{--ob-paper:#F1E8DA;--ob-card:#FFFDF8;--ob-tile:#F8F2E9;--ob-line:#DCCFBE;--ob-ink:#24312D;--ob-muted:#5F5850;--ob-green:#245F55;--ob-green-soft:color-mix(in oklab,#3E8577 16%,transparent);--ob-on-green:#FFFFFF;--ob-chip:#F1E8DA;--ob-coral:#E7614C;--ob-coral-text:#B4422F;background:var(--ob-paper);color:var(--ob-ink);min-height:100%;}
.dark .ob-root{--ob-paper:#1B1E1C;--ob-card:#242826;--ob-tile:#2C302D;--ob-line:#3D433F;--ob-ink:#F3EEE6;--ob-muted:#B7AFA4;--ob-green:#7CC3B3;--ob-green-soft:color-mix(in oklab,#7CC3B3 18%,transparent);--ob-on-green:#132320;--ob-chip:#333834;--ob-coral:#E7614C;--ob-coral-text:#F0907F;}
.ob-card{background:var(--ob-card);border:1px solid var(--ob-line);border-radius:22px;}
.ob-card-selected{border-color:var(--ob-green);border-width:1.5px;}
.ob-tile{background:var(--ob-tile);border:1px solid var(--ob-line);border-radius:14px;padding:8px 6px;}
.ob-input{width:100%;height:44px;border-radius:12px;background:var(--ob-card);border:1px solid var(--ob-line);padding-inline:12px;color:var(--ob-ink);min-width:0;}
.ob-input:focus-visible{outline:2px solid var(--ob-green);outline-offset:1px;}
.ob-cta{background:var(--ob-coral);color:#fff;box-shadow:0 6px 18px -6px color-mix(in oklab,var(--ob-coral) 60%,transparent);}
.ob-stamp{flex:none;width:64px;height:64px;border-radius:9999px;border:2px solid var(--ob-coral);color:var(--ob-coral);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:9px;font-weight:700;letter-spacing:.12em;transform:rotate(-10deg);opacity:.9;}
`;

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

