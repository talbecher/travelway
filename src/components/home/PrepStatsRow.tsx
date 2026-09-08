import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

/** Quiet one-line summary of saved places. Hidden when there are none. */
export function SavedPlacesRow({ saved }: { saved: number }) {
  if (saved <= 0) return null;
  return (
    <Link
      to="/recommendations"
      className="inline-flex min-h-11 items-center gap-1 px-1 text-[13px] text-muted-foreground"
    >
      <span className="tabular-nums">{saved}</span> מקומות שמורים
      <ChevronLeft size={14} className="shrink-0" />
    </Link>
  );
}
