import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, FileText } from "lucide-react";
import { useActiveTripId } from "@/hooks/use-active-trip";
import { useDocuments, type TripDocument } from "@/hooks/use-documents";
import { CategoryIcon } from "@/components/CategoryIcon";
import { documentsOnDate } from "@/lib/documents-by-date";

function useDocumentsOn(dateKey: string | null | undefined): TripDocument[] {
  const tripId = useActiveTripId();
  const { data: docs = [] } = useDocuments(tripId);
  return useMemo(() => (dateKey ? documentsOnDate(docs as TripDocument[], dateKey) : []), [docs, dateKey]);
}

/**
 * Home (active trip): "today's tickets". `todayKey` is the trip-clock date (Asia/Tokyo).
 * Renders nothing when no document is dated today. A tap opens the document on the documents page.
 */
export function TodayDocumentsCard({ todayKey }: { todayKey: string }) {
  const navigate = useNavigate();
  const docs = useDocumentsOn(todayKey);
  if (docs.length === 0) return null;
  return (
    <section className="rounded-xl bg-card p-3.5 shadow-sm" aria-label="הכרטיסים של היום">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
          <FileText size={16} className="text-action-documents" aria-hidden="true" /> הכרטיסים של היום
        </h2>
        <button
          type="button"
          onClick={() => navigate({ to: "/documents", search: { when: "today" } })}
          className="min-h-11 shrink-0 px-1 text-[12px] font-medium text-[color:var(--accent)]"
        >
          לכל המסמכים
        </button>
      </div>
      <ul className="mt-1 space-y-1.5">
        {docs.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => navigate({ to: "/documents", search: { when: "today", doc: d.id } })}
              className="flex min-h-12 w-full items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CategoryIcon category={d.type} size={24} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium"><bdi>{d.title}</bdi></span>
              {d.barcode_value && <span className="shrink-0 text-[11px] text-muted-foreground">ברקוד</span>}
              <ChevronLeft size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Day screen: one small line with the documents dated on this day; nothing when there are none. */
export function DayDocumentsRow({ date, className = "" }: { date: string | null | undefined; className?: string }) {
  const navigate = useNavigate();
  const docs = useDocumentsOn(date);
  if (docs.length === 0) return null;
  return (
    <div dir="rtl" className={`flex flex-wrap items-center gap-1.5 text-[12px] ${className}`} aria-label="מסמכים ליום הזה">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <FileText size={14} aria-hidden="true" /> מסמכים:
      </span>
      {docs.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => navigate({ to: "/documents", search: { doc: d.id } })}
          className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border border-border bg-card px-2.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CategoryIcon category={d.type} size={16} />
          <span className="truncate max-w-[180px]"><bdi>{d.title}</bdi></span>
        </button>
      ))}
    </div>
  );
}
