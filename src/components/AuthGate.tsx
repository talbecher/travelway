import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SignInScreen } from "@/components/SignInScreen";
import { TripPicker } from "@/components/TripPicker";
import { ACTIVE_TRIP_KEY, setActiveTripId, clearActiveTripId } from "@/lib/constants";

type Phase = "resolving" | "picking" | "ready";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<Phase>("resolving");
  const claimedForUserRef = useRef<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (claimedForUserRef.current !== null) {
        qc.clear();
        clearActiveTripId();
        claimedForUserRef.current = null;
      }
      setPhase("resolving");
      return;
    }

    if (claimedForUserRef.current === user.id) return;

    const isUserSwitch = claimedForUserRef.current !== null && claimedForUserRef.current !== user.id;
    if (isUserSwitch) {
      qc.clear();
      clearActiveTripId();
    }
    claimedForUserRef.current = user.id;
    setPhase("resolving");

    (async () => {
      try {
        // Load all accessible trips
        const { data: trips } = await supabase
          .from("trips")
          .select("id")
          .order("created_at", { ascending: true });


        const ids = (trips ?? []).map((t) => t.id);
        if (ids.length === 0) {
          clearActiveTripId();
          qc.clear();
          setPhase("ready");
          return;
        }

        const stored = window.localStorage.getItem(ACTIVE_TRIP_KEY);
        const storedValid = stored && ids.includes(stored);

        if (ids.length === 1) {
          if (stored !== ids[0]) {
            setActiveTripId(ids[0]);
            qc.clear();
          }
          setPhase("ready");
          return;
        }

        // Multiple trips
        if (storedValid) {
          setPhase("ready");
        } else {
          clearActiveTripId();
          qc.clear();
          setPhase("picking");
        }
      } catch {
        setPhase("ready");
      }
    })();
  }, [loading, user, qc]);

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <SignInScreen />;
  if (phase === "resolving") return <div className="min-h-screen bg-background" />;
  if (phase === "picking") {
    return (
      <div className="min-h-screen bg-background px-4 pt-10 pb-8 max-w-md mx-auto" dir="rtl">
        <TripPicker
          userId={user.id}
          onPick={() => setPhase("ready")}
          title="לאיזה טיול להיכנס?"
          subtitle="יש לך יותר מטיול אחד. אפשר להחליף בכל רגע מההגדרות."
        />
      </div>
    );
  }
  return <>{children}</>;
}
