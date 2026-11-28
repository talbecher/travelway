import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { useDayEntriesGeo } from "@/hooks/use-trip";
import { suggestDayForRec, recLatLng, fmtApproxDistance } from "@/lib/day-suggest";
import { hebDate } from "@/lib/format";

/** The recommendation fields the picker reads (proximity hint + "already in this day"). */
export type PickerRec = {
  id: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  google_maps_url?: string | null;
};

export type PickerDay = { id: string; day_number: number; date: string; city_label: string | null };

/** Day list for "add to day" + optional proximity hint. Both the hint and the day rows call the same onPick. */
export function DaySuggestionPicker({ rec, days, disabled, onPick }: {
  rec: PickerRec; days: PickerDay[]; disabled: boolean; onPick: (dayId: string) => void;
}) {
  const geo = useDayEntriesGeo();
  const { suggestion, alreadyInDayIds } = useMemo(() => {
    // Only use complete, successfully loaded data; otherwise show the plain list.
    if (geo.status !== "success" || !geo.data) return { suggestion: null, alreadyInDayIds: new Set<string>() };
    return suggestDayForRec(recLatLng(rec), rec.id, days, geo.data);
  }, [geo.status, geo.data, rec, days]);
  return (
    <div className="space-y-1 pt-2 max-h-[60vh] overflow-y-auto">
      {suggestion && (
        <button type="button" disabled={disabled} onClick={() => onPick(suggestion.dayId)}
          className="w-full text-right flex items-center gap-2 rounded-lg border border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,transparent)] px-3 py-2 mb-2 min-h-11 disabled:opacity-60">
          <MapPin size={16} className="shrink-0 text-[color:var(--accent)]" />
          <span className="text-sm">קרוב לתחנה ביום {suggestion.dayNumber} · {fmtApproxDistance(suggestion.km)}{suggestion.stopTitle ? ` מ${suggestion.stopTitle}` : ""}</span>
        </button>
      )}
      {days.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">אין ימים במסלול</div>}
      {days.map((d) => {
        const hl = suggestion?.dayId === d.id;
        const already = alreadyInDayIds.has(d.id);
        return (
          <button key={d.id} disabled={disabled} onClick={() => onPick(d.id)}
            className={`w-full text-right flex justify-between items-center bg-background border rounded-lg px-3 py-2 min-h-0 disabled:opacity-60 ${hl ? "border-[color:var(--accent)] border-2" : "border-border"}`}>
            <span className="text-sm flex items-center gap-1.5">
              יום {d.day_number} · {hebDate(d.date)}
              {hl && <span className="text-[10px] px-1.5 rounded-full bg-[color:var(--accent)] text-primary-foreground">קרוב</span>}
              {already && <span className="text-[10px] px-1.5 rounded-full bg-muted text-muted-foreground">כבר ביום זה</span>}
            </span>
            <span className="text-xs text-muted-foreground" dir="ltr">{d.city_label}</span>
          </button>
        );
      })}
    </div>
  );
}
