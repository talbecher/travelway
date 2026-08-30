import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Calendar, Wallet, Star, MessagesSquare, CheckSquare } from "lucide-react";

const tabs = [
  { to: "/phrasebook", icon: MessagesSquare, label: "שיחון" },
  { to: "/checklist", icon: CheckSquare, label: "צ'קליסט" },
  { to: "/recommendations", icon: Star, label: "המלצות" },
  { to: "/", icon: Home, label: "בית" },
  { to: "/budget", icon: Wallet, label: "תקציב" },
  { to: "/itinerary", icon: Calendar, label: "מסלול" },
] as const;


export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border backdrop-blur-xl"
      style={{ background: "color-mix(in oklab, var(--surface) 72%, transparent)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-6">
        {tabs.map((t) => {
          const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] text-[10px] transition-colors ${active ? "text-[color:var(--accent)]" : "text-muted-foreground"}`}
            >
              <Icon size={20} strokeWidth={1.6} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
