import { useQueryClient } from "@tanstack/react-query";
import { Check, Users, User as UserIcon } from "lucide-react";
import { useTripsList, tripRoleLabel, tripParticipantCount, type TripListItem } from "@/hooks/use-trips-list";
import { setActiveTripId } from "@/lib/constants";

function formatRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const fmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });
    return `${fmt.format(s)} – ${fmt.format(e)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export function TripPicker({
  userId,
  activeTripId,
  onPick,
  title = "בחר טיול",
  subtitle,
}: {
  userId: string | undefined;
  activeTripId?: string | null;
  onPick: (tripId: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const { data: trips = [], isLoading } = useTripsList(userId);
  const qc = useQueryClient();

  function handlePick(id: string) {
    if (id !== activeTripId) qc.clear();
    setActiveTripId(id);
    onPick(id);
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse" dir="rtl">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-card border border-border" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-1">
        <h2 className="text-xl font-medium">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <ul className="space-y-2">
        {trips.map((t) => (
          <TripRow
            key={t.id}
            trip={t}
            userId={userId}
            active={t.id === activeTripId}
            onSelect={() => handlePick(t.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function TripRow({
  trip,
  userId,
  active,
  onSelect,
}: {
  trip: TripListItem;
  userId: string | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const count = tripParticipantCount(trip);
  const label = tripRoleLabel(trip, userId);
  const Icon = count > 1 ? Users : UserIcon;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`w-full text-right rounded-2xl border p-4 flex items-center gap-3 transition-colors ${
          active
            ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--card))]"
            : "border-border bg-card"
        }`}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{trip.title}</span>
            {active && <Check size={16} className="text-[color:var(--accent)] shrink-0" />}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {formatRange(trip.start_date, trip.end_date)}
            {trip.destination_country ? ` · ${trip.destination_country}` : ""}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon size={12} />
            <span>{label}</span>
          </div>
        </div>
      </button>
    </li>
  );
}
