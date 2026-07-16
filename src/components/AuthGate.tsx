import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SignInScreen } from "@/components/SignInScreen";
import { ACTIVE_TRIP_KEY, setActiveTripId, clearActiveTripId } from "@/lib/constants";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [ready, setReady] = useState(false);
  const claimedForUserRef = useRef<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Signed out — clear cache and active trip so nothing leaks to a new user.
      if (claimedForUserRef.current !== null) {
        qc.clear();
        clearActiveTripId();
        claimedForUserRef.current = null;
      }
      setReady(false);
      return;
    }

    // Already resolved for this user
    if (claimedForUserRef.current === user.id) {
      setReady(true);
      return;
    }

    // A different user (or first sign-in) — wipe the previous user's cache.
    const isUserSwitch = claimedForUserRef.current !== null && claimedForUserRef.current !== user.id;
    if (isUserSwitch) {
      qc.clear();
      clearActiveTripId();
    }
    claimedForUserRef.current = user.id;
    setReady(false);

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
          } else {
            // Signed-in user has no accessible trip yet
            clearActiveTripId();
          }
        }
        // Fresh cache scoped to the current user/trip
        qc.clear();
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
