import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TripListItem = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  destination_country: string | null;
  owner_id: string | null;
  shared_user_ids: string[] | null;
};

export function useTripsList(userId: string | undefined) {
  return useQuery({
    queryKey: ["trips-list", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id,title,start_date,end_date,destination_country,owner_id,shared_user_ids")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TripListItem[];
    },
  });
}

export function tripParticipantCount(t: TripListItem): number {
  const owner = t.owner_id ? 1 : 0;
  const shared = Array.isArray(t.shared_user_ids) ? t.shared_user_ids.length : 0;
  return owner + shared;
}

export function tripRoleLabel(t: TripListItem, userId: string | undefined): string {
  const count = tripParticipantCount(t);
  if (t.owner_id === userId) {
    return count > 1 ? `שלי · משותף (${count})` : "שלי";
  }
  return count > 1 ? `הצטרפת · משותף (${count})` : "הצטרפת";
}
