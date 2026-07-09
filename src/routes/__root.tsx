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
import { PinGate } from "@/components/PinGate";
import { BottomNav } from "@/components/BottomNav";
import { GlobalFab } from "@/components/GlobalFab";
import { ConverterPill } from "@/components/ConverterPill";
import { Toaster } from "sonner";

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
      { title: "יפן 2026 — מתכנן הטיול שלנו" },
      { name: "description", content: "מתכנן טיול פרטי — יפן 2026" },
      { name: "theme-color", content: "#F7F5F0" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "יפן 2026" },
      { property: "og:title", content: "יפן 2026" },
      { property: "og:description", content: "מתכנן טיול פרטי — יפן 2026" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://rsms.me/" },
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
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

  return (
    <QueryClientProvider client={queryClient}>
      <PinGate>
        <AppShell />
      </PinGate>
      <Toaster position="top-center" richColors={false} theme="light" />
    </QueryClientProvider>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
          <div className="text-xs text-muted-foreground">יפן 2026</div>
          <ConverterPill />
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 pb-32">
        <Outlet />
      </main>
      <GlobalFab />
      <BottomNav />
    </div>
  );
}
