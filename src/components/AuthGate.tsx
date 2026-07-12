import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SignInScreen } from "@/components/SignInScreen";
import { ACTIVE_TRIP_KEY, setActiveTripId } from "@/lib/constants";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(false);
  const claimedRef = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (loading || !user) {
      setReady(false);
      return;
    }
    if (claimedRef.current) {
      setReady(true);
      return;
    }
    claimedRef.current = true;

    (async () => {
      try {
        // Claim any unowned trips (idempotent — RLS lets authenticated users update owner_id IS NULL rows to themselves)
        await supabase
          .from("trips")
          .update({ owner_id: user.id })
          .is("owner_id", null);

        // Ensure active trip id points to a trip we can access
        const stored = window.localStorage.getItem(ACTIVE_TRIP_KEY);
        let active: string | null = null;
        if (stored) {
          const { data } = await supabase.from("trips").select("id").eq("id", stored).maybeSingle();
          if (data?.id) active = data.id;
        }
        if (!active) {
          const { data } = await supabase.from("trips").select("id").order("created_at").limit(1).maybeSingle();
          if (data?.id) {
            active = data.id;
            setActiveTripId(data.id);
          }
        }
        // Invalidate so hooks re-read with the correct active trip
        qc.invalidateQueries();
      } finally {
        setReady(true);
      }
    })();
  }, [loading, user, qc]);

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <SignInScreen />;
  if (!ready) return <div className="min-h-screen bg-background" />;
  return <>{children}</>;
}
