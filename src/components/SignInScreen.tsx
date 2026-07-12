import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export function SignInScreen() {
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("ההתחברות נכשלה");
        setLoading(false);
        return;
      }
      // On redirect: browser navigates away.
      // On popup success: session set by lovable wrapper — onAuthStateChange takes over.
    } catch (e) {
      toast.error("שגיאה בהתחברות");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-between px-6 py-12">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <ToriiSvg className="w-40 h-32 text-[color:var(--terracotta)]" />
        <div className="space-y-2">
          <h1 className="text-4xl font-medium tracking-tight">TripNote</h1>
          <p className="text-muted-foreground text-sm">מתכנן הטיולים שלך</p>
        </div>
        <p className="italic text-muted-foreground text-sm max-w-xs leading-relaxed" dir="ltr">
          Ancient gates stand still
          <br />
          Two travelers pass through
          <br />
          The map opens wide
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full h-12 rounded-lg bg-card border border-border flex items-center justify-center gap-3 font-medium disabled:opacity-50"
        >
          <GoogleG />
          <span>{loading ? "מתחבר..." : "המשך עם Google"}</span>
        </button>
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          התחברות מאפשרת לך לגשת לטיולים שלך ולשתף אותם.
        </p>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.4 13.3l7.9 6.1C12.2 13.4 17.6 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.4 5.7c4.3-4 6.9-9.9 6.9-17.4z"/>
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6L2.4 13.3C.9 16.5 0 20.1 0 24s.9 7.5 2.4 10.7l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.7c-2 1.4-4.7 2.2-7.8 2.2-6.4 0-11.8-3.9-13.7-9.4l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
    </svg>
  );
}

function ToriiSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 20 Q60 8 112 20 L110 26 Q60 16 10 26 Z" />
      <rect x="16" y="30" width="88" height="6" />
      <rect x="20" y="46" width="80" height="4" />
      <rect x="26" y="26" width="8" height="72" />
      <rect x="86" y="26" width="8" height="72" />
    </svg>
  );
}
