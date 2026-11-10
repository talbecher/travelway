import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Home, Calendar, Wallet, Star, MessagesSquare, CheckSquare, Menu, FileText, ChevronLeft } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/recommendations", icon: Star, label: "המלצות" },
  { to: "/", icon: Home, label: "בית" },
  { to: "/budget", icon: Wallet, label: "תקציב" },
  { to: "/itinerary", icon: Calendar, label: "מסלול" },
] as const;

const moreItems = [
  { to: "/phrasebook", icon: MessagesSquare, label: "שיחון" },
  { to: "/checklist", icon: CheckSquare, label: "צ'קליסט" },
  { to: "/documents", icon: FileText, label: "מסמכים" },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreOpen || moreItems.some((item) => pathname.startsWith(item.to));
  return (
    <>
    <nav
      data-bottom-nav
      className="fixed bottom-0 inset-x-0 z-40 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] border-t border-border bg-surface backdrop-blur-xl"
      style={{ background: "color-mix(in oklab, var(--surface) 92%, transparent)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-5" dir="rtl">
        <Button
          variant="ghost"
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`relative h-auto min-h-[56px] min-w-11 flex-col gap-1 rounded-none px-0.5 py-2 text-[12px] [&_svg]:size-5 ${moreActive ? "font-medium text-primary after:absolute after:top-0 after:h-0.5 after:w-5 after:rounded-full after:bg-primary" : "font-normal text-muted-foreground"}`}
        >
          <Menu size={20} strokeWidth={1.6} />
          <span>אחר</span>
        </Button>
        {tabs.map((t) => {
          const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
          const Icon = t.icon;
          if (t.to === "/") {
            return (
              <Link
                key={t.to}
                to={t.to}
                className="relative flex min-h-[56px] min-w-11 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  className={`flex h-[52px] w-[52px] -translate-y-3 items-center justify-center rounded-full shadow-md ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon size={26} strokeWidth={1.8} />
                </span>
                <span className={`-mt-2 ${active ? "font-medium text-primary" : "font-normal text-muted-foreground"}`}>{t.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`relative flex min-h-[56px] min-w-11 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "font-medium text-primary after:absolute after:top-0 after:h-0.5 after:w-5 after:rounded-full after:bg-primary" : "font-normal text-muted-foreground"}`}
            >
              <Icon size={20} strokeWidth={1.6} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
    <BottomSheet open={moreOpen} onOpenChange={setMoreOpen} title="אחר">
      <div dir="rtl" className="mx-auto max-w-md divide-y divide-border">
        {moreItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button key={item.to} asChild variant="ghost" className="h-auto min-h-[56px] w-full justify-start gap-3 rounded-none px-2 text-sm text-foreground [&_svg]:size-5">
              <Link to={item.to} onClick={() => setMoreOpen(false)}>
                <Icon strokeWidth={1.6} />
                <span className="flex-1 text-right">{item.label}</span>
                <ChevronLeft aria-hidden="true" />
              </Link>
            </Button>
          );
        })}
      </div>
    </BottomSheet>
    </>
  );
}
