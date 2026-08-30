import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { celebrate, useChecklistItems, useToggleChecklistItem } from "@/hooks/use-checklist";
import { categoryMeta } from "@/lib/checklist-templates";

export function ChecklistCard() {
  const { data: items = [] } = useChecklistItems();
  const toggle = useToggleChecklistItem();

  if (items.length === 0) return null;

  const done = items.filter((i) => i.is_done).length;
  const pct = Math.round((done / items.length) * 100);
  const open = items
    .filter((i) => !i.is_done)
    .sort((a, b) => {
      const rank = { high: 0, normal: 1, low: 2 } as const;
      if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    })
    .slice(0, 3);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">✅ צ'קליסט לטיול</h2>
        <Link to="/checklist" className="text-xs text-[color:var(--accent)] inline-flex items-center gap-0.5">
          הכל
          <ChevronLeft size={14} />
        </Link>
      </div>

      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: done === items.length ? "#10B981" : "var(--accent)" }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {done}/{items.length} הושלמו
        </div>
      </div>

      {open.length === 0 ? (
        <div className="text-sm text-muted-foreground">הכל מוכן לטיול! 🎉</div>
      ) : (
        <div className="space-y-0.5">
          {open.map((item) => (
            <div key={item.id} className="flex items-center gap-1">
              <button
                aria-label="סמן כבוצע"
                onClick={() =>
                  toggle.mutate(
                    { id: item.id, done: true },
                    {
                      onSuccess: () => void celebrate("small"),
                      onError: (e: Error) => toast.error(e.message),
                    },
                  )
                }
                className="shrink-0 w-10 h-10 flex items-center justify-center min-h-0"
              >
                <motion.span
                  whileTap={{ scale: 0.85 }}
                  className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center"
                >
                  <Check size={12} className="text-transparent" />
                </motion.span>
              </button>
              <Link to="/checklist" className="flex-1 min-w-0 text-sm truncate py-1">
                {item.priority === "high" && <span className="ml-1">🔴</span>}
                {item.title}
                <span className="text-muted-foreground text-xs"> · {categoryMeta(item.category).label}</span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
