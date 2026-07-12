import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setActiveTripId } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import { SignInScreen } from "@/components/SignInScreen";
import { toast } from "sonner";

export const Route = createFileRoute("/join/$token")({
  component: JoinRoute,
});

function JoinRoute() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (loading || !user || status !== "idle") return;
    setStatus("joining");
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc("claim_share", { _token: token });
      if (rpcErr || !data) {
        setError(rpcErr?.message ?? "קישור לא תקין");
        setStatus("error");
        return;
      }
      setActiveTripId(data as string);
      qc.invalidateQueries();
      toast.success("הצטרפת לטיול");
      navigate({ to: "/" });
    })();
  }, [loading, user, token, status, navigate, qc]);

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!user) return <SignInScreen />;

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="space-y-3 max-w-sm">
          <div className="text-4xl">🔗</div>
          <h1 className="text-xl font-medium">לא הצלחנו להצטרף</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/" className="inline-block px-4 py-2 rounded-lg bg-[color:var(--terracotta)] text-white text-sm">
            חזרה הביתה
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="space-y-2">
        <div className="text-4xl">✨</div>
        <p className="text-sm text-muted-foreground">מצרפים אותך לטיול...</p>
      </div>
    </div>
  );
}
