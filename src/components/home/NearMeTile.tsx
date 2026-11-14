import { Link } from "@tanstack/react-router";
import { ChevronLeft, LocateFixed } from "lucide-react";

/** Marks that near mode was opened from home, so its back button returns there (see recommendations.tsx). */
export const NEAR_FROM_HOME_KEY = "near-from-home";

function markFromHome() {
  try {
    sessionStorage.setItem(NEAR_FROM_HOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Large home shortcut straight into the "near me" map (/recommendations?near=1). */
export function NearMeTile() {
  return (
    <Link
      to="/recommendations"
      search={{ near: 1 }}
      onClick={markFromHome}
      className="flex min-h-[76px] w-full min-w-0 items-center gap-3 rounded-2xl border border-[color:var(--accent)]/30 bg-accent-soft px-4 py-3 text-right shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-white"
        aria-hidden="true"
      >
        <LocateFixed size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[17px] font-semibold leading-tight text-accent-text">
          מה קרוב אליי
        </span>
        <span className="mt-0.5 block break-words text-[13px] text-muted-foreground">
          מקומות שמורים לידך
        </span>
      </span>
      <ChevronLeft size={20} className="shrink-0 text-accent-text" aria-hidden="true" />
    </Link>
  );
}
