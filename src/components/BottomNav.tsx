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
      data-bottom-nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface backdrop-blur-xl"
      style={{ background: "color-mix(in oklab, var(--surface) 92%, transparent)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-6">
        {tabs.map((t) => {
          const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`relative flex min-h-[56px] min-w-11 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "font-medium text-primary after:absolute after:top-0 after:h-0.5 after:w-5 after:rounded-full after:bg-primary" : "font-normal text-muted-foreground"}`}
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
