import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2, Users, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

import { useTripsList, tripRoleLabel, tripParticipantCount, type TripListItem } from "@/hooks/use-trips-list";
import { setActiveTripId, clearActiveTripId } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";

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
  onDeleted,
  title = "בחר טיול",
  subtitle,
}: {
  userId: string | undefined;
  activeTripId?: string | null;
  onPick: (tripId: string) => void;
  onDeleted?: (nextTripId: string | null) => void;
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

  const del = useMutation({
    mutationFn: async (tripId: string) => {
      const { error } = await supabase.from("trips").delete().eq("id", tripId);
      if (error) throw error;
      return tripId;
    },
    onSuccess: async (deletedId) => {
      const remaining = trips.filter((t) => t.id !== deletedId);
      let nextId: string | null = null;
      if (deletedId === activeTripId) {
        nextId = remaining[0]?.id ?? null;
        if (nextId) setActiveTripId(nextId);
        else clearActiveTripId();
      }
      qc.clear();
      toast.success("הטיול נמחק");
      onDeleted?.(nextId);
    },
    onError: (e: Error) => toast.error(e.message || "המחיקה נכשלה"),
  });

  function handleDelete(t: TripListItem) {
    if (del.isPending) return;
    const ok = window.confirm(`למחוק את הטיול "${t.title}"? הפעולה בלתי הפיכה.`);
    if (!ok) return;
    del.mutate(t.id);
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
            onDelete={t.owner_id === userId ? () => handleDelete(t) : undefined}
            deleting={del.isPending}
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
  onDelete,
  deleting,
}: {
  trip: TripListItem;
  userId: string | undefined;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const count = tripParticipantCount(trip);
  const label = tripRoleLabel(trip, userId);
  const Icon = count > 1 ? Users : UserIcon;
  return (
    <li>
      <div
        className={`w-full rounded-2xl border p-4 flex items-center gap-3 transition-colors ${
          active
            ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--card))]"
            : "border-border bg-card"
        }`}
      >
        <button type="button" onClick={onSelect} aria-pressed={active} className="flex-1 min-w-0 text-right space-y-1">
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
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`מחק את הטיול ${trip.title}`}
            className="shrink-0 w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-[color:var(--destructive)] hover:border-[color:var(--destructive)] disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

