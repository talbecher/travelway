import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthGate } from "@/components/AuthGate";
import { BottomNav } from "@/components/BottomNav";
import { GlobalFab } from "@/components/GlobalFab";
import { ConverterPill } from "@/components/ConverterPill";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "@tanstack/react-router";
import { Settings, LogOut, Share2, ArrowLeftRight } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useTrip } from "@/hooks/use-trip";
import { signOut, useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { TripPicker } from "@/components/TripPicker";
import { useTripsList } from "@/hooks/use-trips-list";
import { getActiveTripId } from "@/lib/constants";
import { OfflineBanner } from "@/components/OfflineBanner";
import { registerServiceWorker } from "@/lib/register-sw";
import { startOfflinePersistence } from "@/lib/offline-persist";

const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(!t){localStorage.setItem('theme','light');t='light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;




function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6" dir="rtl">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-5xl font-medium">404</h1>
        <p className="text-muted-foreground">הדף לא נמצא.</p>
        <a href="/" className="inline-block px-4 py-2 rounded-lg bg-[color:var(--terracotta)] text-white text-sm">חזרה הביתה</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "root" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6" dir="rtl">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="text-xl font-medium">משהו השתבש</h1>
        <p className="text-sm text-muted-foreground">נסה שוב או חזור לדף הבית.</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => { router.invalidate(); reset(); }}
            className="px-4 py-2 rounded-lg bg-[color:var(--terracotta)] text-white text-sm">נסה שוב</button>
          <a href="/" className="px-4 py-2 rounded-lg border border-border text-sm">דף הבית</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "TravelWay" },
      { name: "description", content: "TravelWay — your all-in-one travel planner" },
      { name: "theme-color", content: "#0F0F13" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "TravelWay" },
      { property: "og:title", content: "TravelWay" },
      { property: "og:description", content: "TravelWay — your all-in-one travel planner" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "TravelWay" },
      { name: "twitter:description", content: "TravelWay — your all-in-one travel planner" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e40f87d4-81b7-49ec-ae27-f94fd610d900/id-preview-37c53afa--779c2280-6d33-4962-bbc5-72ed8503f7b4.lovable.app-1783622674887.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e40f87d4-81b7-49ec-ae27-f94fd610d900/id-preview-37c53afa--779c2280-6d33-4962-bbc5-72ed8503f7b4.lovable.app-1783622674887.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://rsms.me/" },
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerServiceWorker();
    void startOfflinePersistence(queryClient);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthListener />
      <OfflineBanner />
      <AuthGate>
        <AppShell />
      </AuthGate>
      <Toaster position="top-center" richColors={false} />
    </QueryClientProvider>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnboarding = pathname === "/onboarding";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: "color-mix(in oklab, var(--background) 72%, transparent)" }}>
        <div className="max-w-md mx-auto flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            {!isOnboarding && <SwitchTripButton />}
          </div>
          <div className="flex items-center gap-2">
            {!isOnboarding && <ConverterPill />}
            {!isOnboarding && <TripSettingsLink />}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 pb-[calc(96px+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      {!isOnboarding && <GlobalFab />}
      <BottomNav />
    </div>
  );
}



function HeaderTitle() {
  const { data: trip } = useTrip();
  return <div className="text-xs text-muted-foreground truncate max-w-[60vw]">{trip?.title ?? "מתכנן טיולים"}</div>;
}

function TripSettingsLink() {
  const { data: trip } = useTrip();
  if (!trip) return null;
  return (
    <Link
      to="/onboarding"
      search={{ edit: true }}
      aria-label="עריכת פרטי הטיול"
      className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground"
    >
      <Settings size={15} />
    </Link>
  );
}

function AuthListener() {
  const qc = useQueryClient();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Wipe cache so the next user cannot see previous user's data.
        qc.clear();
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        qc.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);
  return null;
}

function SignOutButton() {
  const qc = useQueryClient();
  async function handleClick() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    window.location.href = "/";
  }
  return (
    <button
      onClick={handleClick}
      aria-label="התנתקות"
      className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground"
    >
      <LogOut size={15} />
    </button>
  );
}

function ShareTripButton() {
  const { data: trip } = useTrip();
  if (!trip?.share_token) return null;
  async function handleClick() {
    const url = `${window.location.origin}/join/${trip!.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("קישור השיתוף הועתק");
    } catch {
      toast.message(url);
    }
  }
  return (
    <button
      onClick={handleClick}
      aria-label="שתף טיול"
      className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground"
    >
      <Share2 size={15} />
    </button>
  );
}

function SwitchTripButton() {
  const { user } = useAuth();
  const { data: trips = [] } = useTripsList(user?.id);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (trips.length < 2) return null;
  const activeId = getActiveTripId();
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="החלפת טיול"
        className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground"
      >
        <ArrowLeftRight size={15} />
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="החלפת טיול">
        <TripPicker
          userId={user?.id}
          activeTripId={activeId}
          onPick={() => setOpen(false)}
          onDeleted={(nextId) => {
            setOpen(false);
            if (!nextId) router.navigate({ to: "/onboarding" });
            else router.navigate({ to: "/" });
          }}
        />
      </BottomSheet>
    </>
  );
}



