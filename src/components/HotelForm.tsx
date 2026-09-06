import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDays, useHotels } from "@/hooks/use-trip";
import { getActiveTripId } from "@/lib/constants";
import { hebDate, daysBetween } from "@/lib/format";
import { BottomSheet } from "@/components/BottomSheet";
import { PlacesSearch, type SelectedPlace } from "@/components/PlacesSearch";
import { PhotoUploader } from "@/components/PhotoUploader";
import { DateField } from "@/components/DateField";
import { assertOnline } from "@/hooks/use-online";
import {
  syncHotelToItinerary,
  hotelHasItineraryEntries,
  hotelHasExpenses,
  findConflictingHotels,
  deleteHotelCascade,
} from "@/lib/hotels";

export type Hotel = {
  id: string;
  hotel_name: string;
  type: string;
  city: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  total_cost_ils: number | string | null;
  price_per_night_ils: number | string | null;
  booking_platform: string | null;
  confirmation_url: string | null;
  cancellation_deadline: string | null;
  post_stay_rating: number | null;
  post_stay_review: string | null;
  notes: string | null;
  address?: string | null;
  google_maps_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photo_url?: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function HotelForm({
  existing,
  onDone,
  onSaved,
}: {
  existing?: Hotel;
  onDone: () => void;
  onSaved?: (hotelId: string) => void;
}) {
  const qc = useQueryClient();
  const [hotel_name, setName] = useState(existing?.hotel_name ?? "");
  const [type, setType] = useState<"hotel" | "ryokan" | "other">(
    (existing?.type as "hotel" | "ryokan" | "other") ?? "hotel",
  );
  const [city, setCity] = useState(existing?.city ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [checkin_date, setCi] = useState(existing?.checkin_date ?? "");
  const [checkout_date, setCo] = useState(existing?.checkout_date ?? "");
  const [price_per_night, setPrice] = useState(
    existing?.price_per_night_ils?.toString() ?? "",
  );
  const [cancellation_deadline, setDeadline] = useState(
    existing?.cancellation_deadline ?? "",
  );
  const [booking_platform, setPlat] = useState(existing?.booking_platform ?? "");
  const [confirmation_url, setUrl] = useState(existing?.confirmation_url ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [google_maps_url, setMapsUrl] = useState(existing?.google_maps_url ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    existing?.latitude != null && existing?.longitude != null
      ? { lat: Number(existing.latitude), lng: Number(existing.longitude) }
      : null,
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const [placeSelected, setPlaceSelected] = useState<{ name: string; address: string } | null>(
    existing ? { name: existing.hotel_name, address: existing.address ?? "" } : null,
  );
  const [manualMode, setManualMode] = useState(!!existing);

  function handlePlace(p: SelectedPlace) {
    setName(p.name);
    setAddress(p.address);
    setMapsUrl(p.google_maps_url);
    setCoords({ lat: p.latitude, lng: p.longitude });
    setPhotoUrl(p.photo_url);
    if (p.city) setCity(p.city);
    setPlaceSelected({ name: p.name, address: p.address });
  }

  function clearPlace() {
    setPlaceSelected(null);
    setName("");
    setAddress("");
    setMapsUrl("");
    setCoords(null);
    setPhotoUrl(null);
  }

  const { data: days = [] } = useDays();
  const { data: allHotels = [] } = useHotels();
  const [conflicts, setConflicts] = useState<Hotel[]>([]);

  const save = useMutation({
    mutationFn: async ({ replace = false }: { replace?: boolean } = {}) => {
      if (!hotel_name.trim()) throw new Error("שם המלון חסר");
      const nights =
        checkin_date && checkout_date
          ? Math.max(1, daysBetween(checkin_date, checkout_date))
          : 1;
      const priceN = Number(price_per_night) || 0;
      const payload = {
        hotel_name: hotel_name.trim(),
        type,
        city: city.trim() || null,
        address: address.trim() || null,
        checkin_date: checkin_date || null,
        checkout_date: checkout_date || null,
        price_per_night_ils: priceN || null,
        total_cost_ils: priceN * nights,
        cancellation_deadline: cancellation_deadline || null,
        booking_platform: booking_platform.trim() || null,
        confirmation_url: confirmation_url.trim() || null,
        notes: notes.trim() || null,
        google_maps_url: google_maps_url.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        photo_url: photoUrl,
      };

      const overlaps = findConflictingHotels(
        payload.checkin_date,
        payload.checkout_date,
        allHotels as Hotel[],
        existing?.id,
      );
      if (overlaps.length > 0 && !replace) {
        return { kind: "conflict" as const, conflicts: [...overlaps] };
      }

      if (overlaps.length > 0 && replace) {
        for (const c of overlaps) {
          await deleteHotelCascade(c.id);
        }
      }

      let hotelId: string;
      let hadEntries = false;
      let hadExpenses = false;
      if (existing) {
        hadEntries = await hotelHasItineraryEntries(existing.id);
        hadExpenses = await hotelHasExpenses(existing.id);
        const { error } = await supabase.from("hotels").update(payload).eq("id", existing.id);
        if (error) throw error;
        hotelId = existing.id;
      } else {
        const { data, error } = await supabase
          .from("hotels")
          .insert({ trip_id: getActiveTripId(), ...payload })
          .select("id")
          .single();
        if (error) throw error;
        hotelId = data.id;
      }

      let resynced = false;
      if (
        payload.checkin_date &&
        payload.checkout_date &&
        (hadEntries || hadExpenses || (replace && overlaps.length > 0))
      ) {
        await syncHotelToItinerary(
          { id: hotelId, ...payload },
          days,
          existing?.hotel_name,
        );
        resynced = true;
      }
      return {
        kind: "saved" as const,
        hotelId,
        resynced,
        replaced: replace && overlaps.length > 0,
      };
    },
    onSuccess: (r) => {
      if (r.kind === "conflict") {
        setConflicts(r.conflicts);
        return;
      }
      qc.invalidateQueries({ queryKey: ["hotels"] });
      if (r.resynced || r.replaced) {
        qc.invalidateQueries({ queryKey: ["day-entries"] });
        qc.invalidateQueries({ queryKey: ["day-entries-summary"] });
        qc.invalidateQueries({ queryKey: ["expenses"] });
        toast.success(r.replaced ? "הוחלף · המסלול וההוצאות עודכנו" : "נשמר · המסלול עודכן");
      } else {
        toast.success(existing ? "נשמר" : "נוסף");
      }
      onSaved?.(r.hotelId);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({});
        }}
        className="flex flex-col pt-1 pb-2"
      >
        <div className="space-y-3 -mx-1 px-1">
          {!manualMode && !placeSelected && (
            <>
              <PlacesSearch onSelect={handlePlace} />
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="text-xs text-muted-foreground underline min-h-0 h-auto p-0"
              >
                הוסף ידנית
              </button>
            </>
          )}

          {placeSelected && (
            <div className="rounded-lg border border-[color:var(--accent-3)]/40 bg-[color:var(--accent-3)]/10 p-2 text-xs flex items-start gap-2">
              {photoUrl && (
                <img src={photoUrl} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[color:var(--accent-3)]">✅ {placeSelected.name}</div>
                {placeSelected.address && (
                  <div className="text-muted-foreground truncate" dir="ltr">
                    {placeSelected.address}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearPlace}
                className="text-[color:var(--accent)] underline min-h-0 h-auto p-0 shrink-0"
              >
                שנה
              </button>
            </div>
          )}

          {(manualMode || placeSelected) && (
            <>
              <Field label="שם המלון">
                <input
                  required
                  value={hotel_name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg bg-background border border-input px-3 h-11"
                />
              </Field>
              <Field label="סוג">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "hotel" | "ryokan" | "other")}
                  className="w-full rounded-lg bg-background border border-input px-3 h-11"
                >
                  <option value="hotel">מלון</option>
                  <option value="ryokan">ריוקאן</option>
                  <option value="other">אחר</option>
                </select>
              </Field>
              <Field label="עיר">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg bg-background border border-input px-3 h-11"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="צ׳ק-אין">
                  <DateField value={checkin_date} onChange={setCi} placeholder="בחר תאריך" />
                </Field>
                <Field label="צ׳ק-אאוט">
                  <DateField
                    value={checkout_date}
                    onChange={setCo}
                    placeholder="בחר תאריך"
                    min={checkin_date || undefined}
                  />
                </Field>
              </div>
              <Field label="מחיר ללילה (₪)">
                <input
                  type="number"
                  value={price_per_night}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg bg-background border border-input px-3 h-11"
                />
              </Field>
              <Field label="תאריך ביטול חינם">
                <DateField
                  value={cancellation_deadline}
                  onChange={setDeadline}
                  placeholder="ללא הגבלה"
                />
              </Field>
              <Field label="פלטפורמת הזמנה">
                <input
                  value={booking_platform}
                  onChange={(e) => setPlat(e.target.value)}
                  placeholder="Booking, Agoda..."
                  className="w-full rounded-lg bg-background border border-input px-3 h-11"
                />
              </Field>
              <Field label="לינק להזמנה">
                <input
                  type="url"
                  value={confirmation_url}
                  onChange={(e) => setUrl(e.target.value)}
                  dir="ltr"
                  placeholder="https://..."
                  className="w-full rounded-lg bg-background border border-input px-3 h-11"
                />
              </Field>
              <Field label="הערות">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 min-h-[60px]"
                />
              </Field>
              <Field label="תמונה ראשית">
                <PhotoUploader value={photoUrl} onChange={setPhotoUrl} folder="hotels" />
              </Field>
            </>
          )}
        </div>

        {(manualMode || placeSelected) && (
          <div className="sticky bottom-0 z-10 -mx-5 mt-3 px-5 pt-3 pb-2 bg-card border-t border-border/60 shrink-0">
            <button
              type="submit"
              disabled={save.isPending}
              className="w-full h-11 rounded-xl bg-[color:var(--accent-3)] text-white font-medium disabled:opacity-50"
            >
              {save.isPending ? "שומר..." : "שמור"}
            </button>
          </div>
        )}
      </form>

      <BottomSheet
        open={conflicts.length > 0}
        onOpenChange={(o) => {
          if (!o) setConflicts([]);
        }}
        title="חפיפת תאריכים"
      >
        <div className="space-y-3 pb-2">
          <div className="text-sm text-muted-foreground">
            התאריכים שבחרת חופפים למלונות קיימים:
          </div>
          <ul className="space-y-1.5">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-2 text-sm">
                <div className="font-medium">{c.hotel_name}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {c.checkin_date && hebDate(c.checkin_date)} →{" "}
                  {c.checkout_date && hebDate(c.checkout_date)}
                </div>
              </li>
            ))}
          </ul>
          <div className="text-xs text-[color:var(--accent-2)]">
            החלפה תמחק את המלונות הללו, את כניסות המסלול וההוצאות שלהם, ותכניס את המלון החדש
            במקומם.
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConflicts([])}
              className="flex-1 h-11 rounded-xl border border-border font-medium"
            >
              בטל
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                setConflicts([]);
                save.mutate({ replace: true });
              }}
              className="flex-1 h-11 rounded-xl bg-[color:var(--accent-2)] text-white font-medium disabled:opacity-50"
            >
              {save.isPending ? "מחליף..." : "החלף"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
