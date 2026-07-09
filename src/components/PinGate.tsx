import { useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { useTrip } from "@/hooks/use-trip";

const KEY = "trip-unlocked-v1";

export function isUnlocked() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}

export function PinGate({ children }: { children: React.ReactNode }) {
  const { data: trip, isLoading } = useTrip();
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked());

  if (unlocked) return <>{children}</>;
  if (isLoading) return <Skeleton />;
  return <Landing trip={trip} onUnlock={() => { sessionStorage.setItem(KEY, "1"); setUnlocked(true); }} />;
}

function Skeleton() {
  return <div className="min-h-screen bg-background" />;
}

function Landing({
  trip,
  onUnlock,
}: {
  trip: { title: string; start_date: string; end_date: string; entry_pin: string } | null | undefined;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const controls = useAnimationControls();

  async function submit(next: string) {
    setPin(next);
    if (next.length < 4) return;
    if (trip && next === trip.entry_pin) {
      onUnlock();
    } else {
      await controls.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.5 } });
      setPin("");
    }
  }

  function tap(d: string) {
    if (pin.length >= 4) return;
    submit(pin + d);
  }
  function back() { setPin(pin.slice(0, -1)); }

  const dates = trip ? `${fmt(trip.start_date)} – ${fmt(trip.end_date)}` : "";

  return (
    <motion.div
      animate={controls}
      className="min-h-screen bg-background text-foreground flex flex-col items-center justify-between px-6 py-12"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <ToriiSvg className="w-40 h-32 text-[color:var(--terracotta)]" />
        <div className="space-y-2">
          <h1 className="text-4xl font-medium tracking-tight">{trip?.title ?? "יפן 2026"}</h1>
          <p className="text-muted-foreground text-sm">{dates}</p>
        </div>
        <p className="italic text-muted-foreground text-sm max-w-xs leading-relaxed" dir="ltr">
          Ancient gates stand still<br />
          Two travelers pass through<br />
          The map opens wide
        </p>
      </div>

      <div className="w-full max-w-xs space-y-6">
        <div className="flex gap-3 justify-center">
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full border ${pin.length > i ? "bg-[color:var(--terracotta)] border-[color:var(--terracotta)]" : "border-border"}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9"].map((d) => (
            <PadBtn key={d} onClick={() => tap(d)}>{d}</PadBtn>
          ))}
          <div />
          <PadBtn onClick={() => tap("0")}>0</PadBtn>
          <PadBtn onClick={back} aria-label="מחק">←</PadBtn>
        </div>
      </div>
    </motion.div>
  );
}

function PadBtn({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className="h-16 rounded-lg bg-card border border-border text-2xl font-medium active:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

function fmt(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`;
}

function ToriiSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      {/* Top beam (kasagi) with slight upturn */}
      <path d="M8 20 Q60 8 112 20 L110 26 Q60 16 10 26 Z" />
      {/* Second beam (shimaki) */}
      <rect x="16" y="30" width="88" height="6" />
      {/* Tie board (nuki) */}
      <rect x="20" y="46" width="80" height="4" />
      {/* Pillars */}
      <rect x="26" y="26" width="8" height="72" />
      <rect x="86" y="26" width="8" height="72" />
    </svg>
  );
}
