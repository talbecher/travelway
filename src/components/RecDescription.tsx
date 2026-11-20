import { useLayoutEffect, useRef, useState } from "react";

/**
 * A recommendation's description (its `notes`) inside a map pin card: clamped to three lines,
 * with "עוד" / "פחות" only when the text overflows. Renders nothing when there is no text.
 * Key it by the recommendation id so a newly selected pin starts collapsed.
 */
export function RecDescription({ text }: { text: string | null | undefined }) {
  const value = text?.trim() ?? "";
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value, expanded]);

  if (!value) return null;

  return (
    <div className="mt-1" data-rec-description>
      <p
        ref={ref}
        dir="auto"
        className={`whitespace-pre-line break-words text-right text-[12px] leading-[1.45] text-foreground/80 ${
          expanded ? "max-h-40 overflow-y-auto overscroll-contain" : "line-clamp-3"
        }`}
        data-vaul-no-drag={expanded ? "" : undefined}
      >
        {value}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="-my-1 min-h-8 text-[12px] font-medium text-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {expanded ? "פחות" : "עוד"}
        </button>
      )}
    </div>
  );
}
