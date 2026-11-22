import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  MapPinOff,
  Navigation,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { ClientOnly } from "@/components/ClientOnly";
import { MapSkeleton } from "@/components/MapSkeleton";
import { RecDescription } from "@/components/RecDescription";
import type { MapNearbyRec } from "@/components/DayMap";
import { resolveDayLocation } from "@/lib/day-location";
import { DAY_NEARBY_RECS_KM, stopNearbyRecs, type NearbyRecInput } from "@/lib/day-nearby-recs";
import { fmtDistance } from "@/lib/geo";
import { recTypeIcon } from "@/lib/recommendations";
import { navigationHref } from "@/lib/stop-navigation";
import { stopDescription } from "@/lib/stop-description";

// Leaflet touches window on import — keep it out of server route evaluation.
const DayMap = lazy(() => import("@/components/DayMap"));

export type StopActionsEntry = {
  id: string;
  entry_type: string;
  title: string;
  description?: string | null;
  location_name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
  linked_recommendation_id?: string | null;
};

export type StopActionsRec = NearbyRecInput & {
  latitude?: number | string | null;
  longitude?: number | string | null;
  notes?: string | null;
};

const optionClass =
  "flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-right text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Actions for one of today's stops on the home screen: navigate, map with saved recs around it, open the day. */
export function StopActionsSheet({
  dayId,
  entry,
  stopNumber,
  recs,
  onClose,
}: {
  dayId: string;
  entry: StopActionsEntry | null;
  stopNumber: number;
  recs: StopActionsRec[];
  onClose: () => void;
}) {
  const [view, setView] = useState<"actions" | "map">("actions");
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  // Keep the last stop while the sheet animates closed.
  const [shown, setShown] = useState(entry);
  useEffect(() => {
    if (entry) {
      setShown(entry);
      setView("actions");
      setSelectedRecId(null);
    }
  }, [entry]);

  const linkedRec = useMemo(
    () =>
      shown?.linked_recommendation_id
        ? (recs.find((r) => r.id === shown.linked_recommendation_id) ?? null)
        : null,
    [recs, shown?.linked_recommendation_id],
  );
  const isNote = shown?.entry_type === "note";
  const description = stopDescription(shown, linkedRec);
  const point = useMemo(
    () => (shown && !isNote ? resolveDayLocation(shown, linkedRec) : null),
    [shown, isNote, linkedRec],
  );
  const navHref =
    shown && !isNote
      ? navigationHref({
          title: shown.location_name?.trim() || shown.title,
          latitude: point?.lat ?? null,
          longitude: point?.lng ?? null,
          google_maps_url: shown.google_maps_url ?? linkedRec?.google_maps_url ?? null,
        })
      : null;

  const nearby = useMemo(
    () =>
      view === "map" && shown && point
        ? stopNearbyRecs(recs, {
            stop: { id: shown.id, title: shown.title, lat: point.lat, lng: point.lng },
            excludeRecIds: shown.linked_recommendation_id ? [shown.linked_recommendation_id] : [],
          })
        : [],
    [view, shown, point, recs],
  );
  const pins = useMemo<MapNearbyRec[]>(
    () =>
      nearby.map((i) => ({
        id: i.rec.id,
        lat: i.point.lat,
        lng: i.point.lng,
        type: i.rec.type,
        title: i.rec.name,
        emoji: recTypeIcon(i.rec.type),
      })),
    [nearby],
  );
  const selected = selectedRecId ? (nearby.find((i) => i.rec.id === selectedRecId) ?? null) : null;

  return (
    <BottomSheet
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title={shown?.title ?? ""}
      description="פעולות לתחנה"
    >
      {shown && view === "actions" && (
        <div className="space-y-2 pb-1" data-stop-actions>
          {description && (
            <div className="px-0.5 pb-1" data-stop-description>
              <RecDescription key={shown.id} text={description} />
            </div>
          )}
          {navHref && (
            <a
              href={navHref}
              target="_blank"
              rel="noreferrer"
              className={optionClass}
              onClick={onClose}
            >
              <Navigation
                size={19}
                className="shrink-0 text-[color:var(--accent)]"
                aria-hidden="true"
              />
              <span className="flex-1">נווט ליעד</span>
            </a>
          )}
          {point ? (
            <button type="button" className={optionClass} onClick={() => setView("map")}>
              <MapIcon
                size={19}
                className="shrink-0 text-[color:var(--accent)]"
                aria-hidden="true"
              />
              <span className="flex-1">הצג במפה עם המלצות סביבו</span>
              <ChevronLeft
                size={16}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          ) : (
            <div className={`${optionClass} text-muted-foreground`} data-no-location>
              <MapPinOff size={19} className="shrink-0" aria-hidden="true" />
              <span className="flex-1 text-[14px]">אין מיקום לתחנה</span>
            </div>
          )}
          <Link to="/itinerary/$dayId" params={{ dayId }} className={optionClass} onClick={onClose}>
            <CalendarDays
              size={19}
              className="shrink-0 text-[color:var(--accent)]"
              aria-hidden="true"
            />
            <span className="flex-1">פתח את היום</span>
            <ChevronLeft size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </div>
      )}

      {shown && view === "map" && point && (
        <div className="space-y-2 pb-1" data-stop-map>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setView("actions");
                setSelectedRecId(null);
              }}
              aria-label="חזרה לפעולות"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            >
              <ChevronRight size={18} />
            </button>
            <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
              {nearby.length === 0
                ? `אין המלצות שמורות עד ${DAY_NEARBY_RECS_KM} ק״מ מהתחנה`
                : `${nearby.length === 1 ? "המלצה אחת" : `${nearby.length} המלצות`} עד ${DAY_NEARBY_RECS_KM} ק״מ מהתחנה`}
            </p>
          </div>
          {/* data-vaul-no-drag: panning the map must not drag the sheet closed. */}
          <div
            className="h-[300px] overflow-hidden rounded-xl border border-border"
            data-vaul-no-drag
          >
            <ClientOnly fallback={<MapSkeleton />}>
              <Suspense fallback={<MapSkeleton />}>
                <DayMap
                  stops={[
                    {
                      id: shown.id,
                      lat: point.lat,
                      lng: point.lng,
                      type: shown.entry_type,
                      index: stopNumber,
                      title: shown.title,
                    },
                  ]}
                  bottomPadding={16}
                  nearby={pins}
                  selectedNearbyId={selectedRecId}
                  onNearbyTap={setSelectedRecId}
                />
              </Suspense>
            </ClientOnly>
          </div>
          {selected && (
            <div
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              data-stop-rec-card
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-[19px]"
                aria-hidden="true"
              >
                {recTypeIcon(selected.rec.type)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">
                  <bdi>{selected.rec.name}</bdi>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {fmtDistance(selected.km)} מהתחנה
                </p>
                <RecDescription key={selected.rec.id} text={selected.rec.notes} />
              </div>
              <a
                href={navigationHref({
                  title: selected.rec.name,
                  latitude: selected.point.lat,
                  longitude: selected.point.lng,
                  google_maps_url: selected.rec.google_maps_url,
                })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3.5 text-[13px] font-medium"
              >
                <Navigation size={14} /> נווט
              </a>
              <button
                type="button"
                onClick={() => setSelectedRecId(null)}
                aria-label="סגור כרטיס"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
