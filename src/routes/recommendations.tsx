import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Plus, Navigation } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRecs, useHotels, useDays } from "@/hooks/use-trip";
import { CITIES, TRIP_ID } from "@/lib/constants";
import { haversine, fmtDistance } from "@/lib/geo";
import { hebDate, ils, daysBetween, todayISO } from "@/lib/format";
import { BottomSheet } from "@/components/BottomSheet";
import { toast } from "sonner";
import { z } from "zod";

type Tab = "food" | "attractions" | "hotels";

const searchSchema = z.object({ tab: z.enum(["food","attractions","hotels"]).optional() });

export const Route = createFileRoute("/recommendations")({
  validateSearch: searchSchema,
  component: Recs,
});

function Recs() {
  const search = Route.useSearch();
  const initialTab = (search.tab as Tab | undefined) ?? "food";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [city, setCity] = useState<string>("all");

  useEffect(() => { if (search.tab) setTab(search.tab as Tab); }, [search.tab]);

  return (
    <div className="pt-2 space-y-4">
      <h1 className="text-2xl font-medium">המלצות</h1>

      <div className="flex gap-1 bg-muted rounded-lg p-1">
        <TabBtn active={tab === "food"} onClick={() => setTab("food")}>🍜 אוכל</TabBtn>
        <TabBtn active={tab === "attractions"} onClick={() => setTab("attractions")}>⛩ אטרקציות</TabBtn>
        <TabBtn active={tab === "hotels"} onClick={() => setTab("hotels")}>🏨 מלונות</TabBtn>
      </div>

      {tab !== "hotels" && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          <Pill active={city === "all"} onClick={() => setCity("all")}>הכל</Pill>
          {CITIES.map((c) => (
            <Pill key={c} active={city === c} onClick={() => setCity(c)}>{c}</Pill>
          ))}
        </div>
      )}

      {tab === "hotels" ? <HotelsList /> : <PlacesList type={tab === "food" ? "food" : "attraction"} cityFilter={city} />}
    </div>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 h-10 rounded-md text-sm min-h-0 ${active ? "bg-card text-foreground" : "text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function Pill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border min-h-0 h-auto ${active ? "bg-[color:var(--terracotta)] text-white border-[color:var(--terracotta)]" : "border-border text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function PlacesList({ type, cityFilter }: { type: "food" | "attraction"; cityFilter: string }) {
  const { data: recs = [], isLoading } = useRecs();
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (cityFilter !== "all") return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { timeout: 5000, maximumAge: 60_000 },
    );
  }, [cityFilter]);

  const list = useMemo(() => {
    let items = recs.filter((r) => r.type === type);
    if (cityFilter !== "all") items = items.filter((r) => r.city === cityFilter);
    if (pos && cityFilter === "all") {
      items = [...items].sort((a, b) => {
        const da = a.latitude && a.longitude ? haversine(pos, { lat: Number(a.latitude), lon: Number(a.longitude) }) : Infinity;
        const db = b.latitude && b.longitude ? haversine(pos, { lat: Number(b.latitude), lon: Number(b.longitude) }) : Infinity;
        return da - db;
      });
    }
    return items;
  }, [recs, type, cityFilter, pos]);

  if (isLoading) return <ListSkeleton />;
  if (list.length === 0) return <Empty label="אין המלצות עדיין" />;

  return (
    <>
      <div className="space-y-2">
        {list.map((r) => (
          <PlaceCard
            key={r.id}
            rec={r}
            distance={pos && r.latitude && r.longitude ? haversine(pos, { lat: Number(r.latitude), lon: Number(r.longitude) }) : null}
          />
        ))}
      </div>
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-[152px] left-4 z-30 w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center"
        aria-label="הוסף מקום"
      >
        <Plus size={20} />
      </button>
      <BottomSheet open={addOpen} onOpenChange={setAddOpen} title="הוסף מקום">
        <AddPlaceForm defaultType={type} onDone={() => setAddOpen(false)} />
      </BottomSheet>
    </>
  );
}

function PlaceCard({ rec, distance }: { rec: { id: string; name: string; type: string; city: string | null; address: string | null; google_maps_url: string | null; status: string; rating: number | null; review: string | null; notes: string | null }; distance: number | null }) {
  const qc = useQueryClient();
  const { data: days = [] } = useDays();
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [ratingPromptOpen, setRatingPromptOpen] = useState(false);

  const setStatus = useMutation({
    mutationFn: async (status: "wishlist" | "visited" | "skipped") => {
      const { error } = await supabase.from("recommendations").update({ status }).eq("id", rec.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ["recs"] });
      if (status === "visited") setRatingPromptOpen(true);
    },
  });

  const addToDay = useMutation({
    mutationFn: async (dayId: string) => {
      const iconMap: Record<string, string> = { food: "🍜", attraction: "⛩" };
      // Save FK link — enables bidirectional recommendation ↔ day association
      const { error } = await supabase.from("day_entries").insert({
        day_id: dayId,
        entry_type: rec.type as "food" | "attraction",
        title: rec.name,
        location_name: rec.city,
        google_maps_url: rec.google_maps_url,
        icon_emoji: iconMap[rec.type] ?? "•",
        linked_recommendation_id: rec.id,
        display_order: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
      toast.success("נוסף ליום");
      setDayPickerOpen(false);
    },
  });

  const statusBadge = {
    wishlist: { label: "רשימה", cls: "bg-muted text-muted-foreground" },
    visited: { label: "ביקרנו", cls: "bg-[color:var(--terracotta-soft)] text-[color:var(--terracotta)]" },
    skipped: { label: "דילגנו", cls: "bg-muted text-muted-foreground line-through" },
  }[rec.status as "wishlist" | "visited" | "skipped"];

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium" dir="ltr">{rec.name}</div>
          <div className="text-xs text-muted-foreground" dir="ltr">
            {rec.city}{rec.address ? ` · ${rec.address}` : ""}
          </div>
          {distance != null && Number.isFinite(distance) && (
            <div className="text-xs text-muted-foreground mt-0.5">{fmtDistance(distance)}</div>
          )}
        </div>
        <motion.span
          key={rec.status}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge.cls}`}
        >{statusBadge.label}</motion.span>
      </div>
      {rec.rating && (
        <div className="text-xs mt-1">{"★".repeat(rec.rating)}{"☆".repeat(5 - rec.rating)}</div>
      )}
      <div className="flex gap-2 mt-3">
        {rec.google_maps_url && (
          <a href={rec.google_maps_url} target="_blank" rel="noreferrer"
            className="flex-1 h-9 rounded-md border border-border flex items-center justify-center gap-1 text-xs">
            <Navigation size={12} /> ניווט
          </a>
        )}
        <button onClick={() => setDayPickerOpen(true)}
          className="flex-1 h-9 rounded-md bg-[color:var(--terracotta)] text-white text-xs min-h-0">
          + הוסף ליום
        </button>
      </div>
      <div className="flex gap-3 mt-2 text-xs">
        {rec.status !== "visited" && <button onClick={() => setStatus.mutate("visited")} className="text-muted-foreground min-h-0 h-auto p-0">סמן שביקרנו</button>}
        {rec.status !== "skipped" && <button onClick={() => setStatus.mutate("skipped")} className="text-muted-foreground min-h-0 h-auto p-0">דילגנו</button>}
        {rec.status !== "wishlist" && <button onClick={() => setStatus.mutate("wishlist")} className="text-muted-foreground min-h-0 h-auto p-0">חזרה לרשימה</button>}
      </div>

      <BottomSheet open={dayPickerOpen} onOpenChange={setDayPickerOpen} title={`הוסף את ${rec.name} ליום`}>
        <div className="space-y-1 pt-2 max-h-[60vh] overflow-y-auto">
          {days.map((d) => (
            <button key={d.id} onClick={() => addToDay.mutate(d.id)}
              className="w-full text-right flex justify-between items-center bg-background border border-border rounded-lg px-3 py-2 min-h-0">
              <span className="text-sm">יום {d.day_number} · {hebDate(d.date)}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">{d.city_label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={ratingPromptOpen} onOpenChange={setRatingPromptOpen} title="דירוג וסקירה">
        <RatingForm recId={rec.id} onDone={() => setRatingPromptOpen(false)} />
      </BottomSheet>
    </div>
  );
}

function RatingForm({ recId, onDone }: { recId: string; onDone: () => void }) {
  const [rating, setRating] = useState(4);
  const [review, setReview] = useState("");
  const qc = useQueryClient();
  async function save() {
    await supabase.from("recommendations").update({ rating, review }).eq("id", recId);
    qc.invalidateQueries({ queryKey: ["recs"] });
    onDone();
  }
  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-center gap-1 text-3xl">
        {[1,2,3,4,5].map((n) => (
          <button key={n} onClick={() => setRating(n)}
            className={`min-h-0 h-auto ${n <= rating ? "text-[color:var(--terracotta)]" : "text-muted-foreground"}`}>
            ★
          </button>
        ))}
      </div>
      <textarea rows={3} value={review} onChange={(e) => setReview(e.target.value)}
        placeholder="סקירה קצרה..." className="w-full rounded-lg bg-background border border-input px-3 py-2" />
      <button onClick={save} className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium">שמור</button>
    </div>
  );
}

function AddPlaceForm({ defaultType, onDone }: { defaultType: "food" | "attraction"; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"food" | "attraction" | "hotel">(defaultType);
  const [city, setCity] = useState<string>("Tokyo");
  const [address, setAddress] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("recommendations").insert({
      trip_id: TRIP_ID, name, type, city, address: address || null, google_maps_url: url || null, notes: notes || null,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["recs"] });
    toast.success("נוסף");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <Field label="שם"><input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="סוג">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full rounded-lg bg-background border border-input px-3">
          <option value="food">אוכל</option><option value="attraction">אטרקציה</option><option value="hotel">מלון</option>
        </select>
      </Field>
      <Field label="עיר">
        <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3">
          {CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="כתובת"><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="קישור Google Maps"><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." dir="ltr" className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="הערות"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3 py-2 min-h-[60px]" /></Field>
      <button type="submit" className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium">שמור</button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-muted-foreground">{label}</label><div className="mt-1">{children}</div></div>;
}

function HotelsList() {
  const { data: hotels = [], isLoading } = useHotels();
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) return <ListSkeleton />;
  if (hotels.length === 0) return <Empty label="אין מלונות" />;

  return (
    <>
      <div className="space-y-2">
        {hotels.map((h) => <HotelCard key={h.id} h={h} />)}
      </div>
      <button onClick={() => setAddOpen(true)}
        className="fixed bottom-[152px] left-4 z-30 w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center"
        aria-label="הוסף מלון">
        <Plus size={20} />
      </button>
      <BottomSheet open={addOpen} onOpenChange={setAddOpen} title="הוסף מלון">
        <AddHotelForm onDone={() => setAddOpen(false)} />
      </BottomSheet>
    </>
  );
}

function HotelCard({ h }: { h: { id: string; hotel_name: string; type: string; city: string | null; checkin_date: string | null; checkout_date: string | null; total_cost_ils: number | string | null; price_per_night_ils: number | string | null; booking_platform: string | null; confirmation_url: string | null; cancellation_deadline: string | null; post_stay_rating: number | null } }) {
  const today = todayISO();
  const nights = h.checkin_date && h.checkout_date ? daysBetween(h.checkin_date, h.checkout_date) : 0;
  const dd = h.cancellation_deadline ? daysBetween(today, h.cancellation_deadline) : null;
  let statusLabel = "🟢 בטוח", statusCls = "text-[color:var(--success)]", urgent = false;
  if (dd !== null) {
    if (dd < 0) { statusLabel = "עבר"; statusCls = "text-muted-foreground"; }
    else if (dd <= 3) { statusLabel = "🔴 דחוף"; statusCls = "text-[color:var(--danger)]"; urgent = true; }
    else if (dd <= 7) { statusLabel = "🟡 שים לב"; statusCls = "text-[color:var(--warning)]"; }
  }
  const postStay = h.checkout_date && h.checkout_date < today;

  return (
    <div className={`bg-card border rounded-lg p-3 ${urgent ? "border-[color:var(--danger)]" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{h.hotel_name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{h.type === "ryokan" ? "ריוקאן" : "מלון"}</span>
          </div>
          <div className="text-xs text-muted-foreground" dir="ltr">{h.city}</div>
        </div>
        <motion.span
          animate={urgent ? { opacity: [1, 0.6, 1] } : {}}
          transition={urgent ? { duration: 1.5, repeat: 0 } : {}}
          className={`text-xs ${statusCls}`}
        >{statusLabel}</motion.span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">Check-in </span><span dir="ltr">{h.checkin_date && hebDate(h.checkin_date)}</span></div>
        <div><span className="text-muted-foreground">Check-out </span><span dir="ltr">{h.checkout_date && hebDate(h.checkout_date)}</span></div>
        <div><span className="text-muted-foreground">לילות </span>{nights}</div>
        <div><span className="text-muted-foreground">סה״כ </span>{ils(h.total_cost_ils as number)}</div>
      </div>
      {h.cancellation_deadline && (
        <div className="text-xs text-muted-foreground mt-1">ביטול עד {hebDate(h.cancellation_deadline)}</div>
      )}
      {h.booking_platform && (
        <div className="text-xs text-muted-foreground mt-1">{h.booking_platform}
          {h.confirmation_url && <> · <a href={h.confirmation_url} target="_blank" rel="noreferrer" className="text-[color:var(--terracotta)] inline-flex items-center gap-1"><ExternalLink size={10} />אישור</a></>}
        </div>
      )}
      {postStay && !h.post_stay_rating && <PostStayForm hotelId={h.id} />}
      {h.post_stay_rating && <div className="text-xs mt-1">{"★".repeat(h.post_stay_rating)}{"☆".repeat(5 - h.post_stay_rating)}</div>}
    </div>
  );
}

function PostStayForm({ hotelId }: { hotelId: string }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(4);
  const [review, setReview] = useState("");
  async function save() {
    await supabase.from("hotels").update({ post_stay_rating: rating, post_stay_review: review }).eq("id", hotelId);
    qc.invalidateQueries({ queryKey: ["hotels"] });
  }
  return (
    <div className="mt-2 pt-2 border-t border-border">
      <div className="text-xs text-muted-foreground mb-1">דירוג לאחר השהות</div>
      <div className="flex gap-1 text-lg">
        {[1,2,3,4,5].map((n) => (
          <button key={n} onClick={() => setRating(n)}
            className={`min-h-0 h-auto ${n <= rating ? "text-[color:var(--terracotta)]" : "text-muted-foreground"}`}>★</button>
        ))}
      </div>
      <textarea rows={2} value={review} onChange={(e) => setReview(e.target.value)}
        placeholder="סקירה..." className="w-full mt-1 rounded-lg bg-background border border-input px-2 py-1 text-sm min-h-[50px]" />
      <button onClick={save} className="mt-1 text-xs text-[color:var(--terracotta)] min-h-0 h-auto p-0">שמור</button>
    </div>
  );
}

function AddHotelForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [hotel_name, setName] = useState("");
  const [type, setType] = useState<"hotel"|"ryokan"|"other">("hotel");
  const [city, setCity] = useState("Tokyo");
  const [checkin_date, setCi] = useState("");
  const [checkout_date, setCo] = useState("");
  const [total_cost_ils, setTotal] = useState("");
  const [cancellation_deadline, setDeadline] = useState("");
  const [booking_platform, setPlat] = useState("");
  const [confirmation_url, setUrl] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nights = checkin_date && checkout_date ? Math.max(1, daysBetween(checkin_date, checkout_date)) : 1;
    const total = Number(total_cost_ils) || 0;
    const { error } = await supabase.from("hotels").insert({
      trip_id: TRIP_ID, hotel_name, type, city,
      checkin_date: checkin_date || null, checkout_date: checkout_date || null,
      total_cost_ils: total,
      price_per_night_ils: total / nights,
      cancellation_deadline: cancellation_deadline || null,
      booking_platform: booking_platform || null,
      confirmation_url: confirmation_url || null,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["hotels"] });
    toast.success("נוסף");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <Field label="שם המלון"><input required value={hotel_name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="סוג">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full rounded-lg bg-background border border-input px-3">
          <option value="hotel">מלון</option><option value="ryokan">ריוקאן</option><option value="other">אחר</option>
        </select>
      </Field>
      <Field label="עיר">
        <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3">
          {CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Check-in"><input type="date" value={checkin_date} onChange={(e) => setCi(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
        <Field label="Check-out"><input type="date" value={checkout_date} onChange={(e) => setCo(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      </div>
      <Field label="סה״כ (₪)"><input type="number" value={total_cost_ils} onChange={(e) => setTotal(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="ביטול עד"><input type="date" value={cancellation_deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="פלטפורמה"><input value={booking_platform} onChange={(e) => setPlat(e.target.value)} className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <Field label="קישור אישור"><input type="url" value={confirmation_url} onChange={(e) => setUrl(e.target.value)} dir="ltr" className="w-full rounded-lg bg-background border border-input px-3" /></Field>
      <button type="submit" className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium">שמור</button>
    </form>
  );
}

function ListSkeleton() {
  return <div className="space-y-2 animate-pulse">{[0,1,2,3].map(i => <div key={i} className="h-24 bg-card border border-border rounded-lg" />)}</div>;
}
function Empty({ label }: { label: string }) {
  return <div className="text-center py-12 text-muted-foreground text-sm">{label}</div>;
}
