import type { ChecklistPriority } from "@/lib/checklist-templates";

export type SortableTask = {
  id: string;
  is_done: boolean;
  priority: ChecklistPriority | string;
  due_date: string | null;
  display_order: number;
  created_at: string;
};

export type Urgency = "overdue" | "today" | "open" | "done";

/** `today` is a local YYYY-MM-DD string (todayLocal); compared as strings, no UTC conversion. */
export function taskUrgency(t: SortableTask, today: string): Urgency {
  if (t.is_done) return "done";
  if (t.due_date && t.due_date < today) return "overdue";
  if (t.due_date && t.due_date === today) return "today";
  return "open";
}

const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, today: 1, open: 2, done: 3 };
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Display-only ordering within a category. Returns a new array. */
export function sortChecklistTasks<T extends SortableTask>(items: T[], today: string): T[] {
  return [...items].sort((a, b) => {
    const ua = taskUrgency(a, today);
    const ub = taskUrgency(b, today);
    if (ua !== ub) return URGENCY_RANK[ua] - URGENCY_RANK[ub];
    if (ua !== "done") {
      const pa = PRIORITY_RANK[a.priority] ?? 1;
      const pb = PRIORITY_RANK[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      if (a.due_date !== b.due_date) {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date < b.due_date ? -1 : 1;
      }
    }
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
