import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, MoreHorizontal, Trash2, Pencil, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";
import { BottomSheet } from "@/components/BottomSheet";
import { DateField } from "@/components/DateField";
import {
  CHECKLIST_CATEGORIES,
  CHECKLIST_TEMPLATES,
  TEMPLATE_CATEGORIES,
  categoryMeta,
  type ChecklistPriority,
} from "@/lib/checklist-templates";
import {
  celebrate,
  useAddChecklistItem,
  useBulkAddItems,
  useChecklistItems,
  useDeleteChecklistItem,
  useToggleChecklistItem,
  useUpdateChecklistItem,
  type ChecklistItem,
} from "@/hooks/use-checklist";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "צ'קליסט לטיול — TravelWay" },
      { name: "description", content: "ניהול משימות והכנות לפני הטיול: מסמכים, כספים, הזמנות, אריזה ועוד." },
      { property: "og:title", content: "צ'קליסט לטיול — TravelWay" },
      { property: "og:description", content: "ניהול משימות והכנות לפני הטיול, עם צ'קליסט חכם מוכן מראש." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChecklistPage,
});

const PRIORITY_LABEL: Record<ChecklistPriority, string> = {
  high: "גבוהה",
  normal: "רגילה",
  low: "נמוכה",
};

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div className="space-y-1.5">
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: complete ? "#10B981" : "var(--accent)" }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {done} מתוך {total} הושלמו
      </div>
    </div>
  );
}

function Checkbox({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={done ? "בטל סימון" : "סמן כבוצע"}
      className="shrink-0 w-11 h-11 flex items-center justify-center min-h-0"
    >
      <motion.span
        whileTap={{ scale: 0.85 }}
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
        style={{
          borderColor: done ? "var(--accent)" : "var(--border)",
          background: done ? "var(--accent)" : "transparent",
        }}
      >
        {done && <Check size={14} className="text-white" strokeWidth={3} />}
      </motion.span>
    </button>
  );
}

function ItemRow({
  item,
  onToggle,
  onMenu,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="flex items-center gap-1 min-h-[52px] px-1.5 border-b border-border/60 last:border-b-0">
      <Checkbox done={item.is_done} onToggle={onToggle} />
      <div className="flex-1 min-w-0 py-1.5">
        <div
          className={`text-[15px] leading-snug transition-all ${
            item.is_done ? "line-through text-muted-foreground" : ""
          }`}
        >
          {item.priority === "high" && !item.is_done && <span className="ml-1">🔴</span>}
          {item.title}
        </div>
        {(item.due_date || item.notes) && (
          <div className="text-[12px] text-muted-foreground truncate mt-0.5">
            {item.due_date && <span>עד {item.due_date.split("-").reverse().join("/")}</span>}
            {item.due_date && item.notes && " · "}
            {item.notes}
          </div>
        )}
      </div>
      <button
        onClick={onMenu}
        aria-label="אפשרויות"
        className="shrink-0 w-9 h-9 flex items-center justify-center text-muted-foreground min-h-0"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}

function Onboarding({ onSkip }: { onSkip: () => void }) {
  const bulkAdd = useBulkAddItems();
  const [selected, setSelected] = useState<string[]>(TEMPLATE_CATEGORIES.map((c) => c.id));

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function create() {
    if (!assertOnline()) return;
    const items = TEMPLATE_CATEGORIES.filter((c) => selected.includes(c.id)).flatMap((c) =>
      (CHECKLIST_TEMPLATES[c.id] ?? []).map((t, i) => ({
        title: t.title,
        category: c.id,
        priority: t.priority,
        display_order: i,
      })),
    );
    bulkAdd.mutate(items, {
      onSuccess: () => toast.success("הצ'קליסט מוכן ✅"),
      onError: (e: Error) => toast.error(e.message),
    });
  }

  return (
    <div className="pt-6 pb-8 space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-1">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-semibold">צ'קליסט לטיול</h1>
        <p className="text-sm text-muted-foreground">נוסיף לך משימות חכמות לפי היעד שלך</p>
      </div>

      <div className="space-y-2">
        {TEMPLATE_CATEGORIES.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="w-full flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-right min-h-0"
              style={{ borderColor: on ? "var(--accent)" : "var(--border)" }}
            >
              <span
                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--border)",
                  background: on ? "var(--accent)" : "transparent",
                }}
              >
                {on && <Check size={12} className="text-white" strokeWidth={3} />}
              </span>
              <span className="text-lg">{c.emoji}</span>
              <span className="flex-1 text-sm font-medium">{c.label}</span>
              <span className="text-xs text-muted-foreground">
                {(CHECKLIST_TEMPLATES[c.id] ?? []).length} משימות
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={bulkAdd.isPending || selected.length === 0}
          className="flex-1 h-12 rounded-xl bg-[color:var(--accent)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Sparkles size={16} />
          {bulkAdd.isPending ? "מכין..." : "צור צ'קליסט"}
        </button>
        <button
          onClick={onSkip}
          className="h-12 px-4 rounded-xl border border-border text-sm text-muted-foreground"
        >
          התחל מאפס
        </button>
      </div>
    </div>
  );
}

function ChecklistPage() {
  const { data: items = [], isLoading } = useChecklistItems();
  const toggleItem = useToggleChecklistItem();
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const [skippedOnboarding, setSkippedOnboarding] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [menuItem, setMenuItem] = useState<ChecklistItem | null>(null);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("other");

  const doneCount = items.filter((i) => i.is_done).length;

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "open") return items.filter((i) => !i.is_done);
    if (filter === "done") return items.filter((i) => i.is_done);
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const groups = useMemo(() => {
    return CHECKLIST_CATEGORIES.map((c) => ({
      cat: c,
      items: visible.filter((i) => i.category === c.id),
      total: items.filter((i) => i.category === c.id).length,
      done: items.filter((i) => i.category === c.id && i.is_done).length,
    })).filter((g) => g.items.length > 0);
  }, [visible, items]);

  function handleToggle(item: ChecklistItem) {
    const next = !item.is_done;
    toggleItem.mutate(
      { id: item.id, done: next },
      {
        onSuccess: () => {
          if (!next) return;
          const after = items.map((i) => (i.id === item.id ? { ...i, is_done: true } : i));
          const allDone = after.every((i) => i.is_done);
          const catItems = after.filter((i) => i.category === item.category);
          const catDone = catItems.every((i) => i.is_done);
          if (allDone) {
            void celebrate("all");
            toast.success("הכל מוכן לטיול! 🎉✈️");
          } else if (catDone) {
            void celebrate("category");
            toast.success(`${categoryMeta(item.category).label} — קטגוריה הושלמה! 🎉`);
          } else {
            void celebrate("small");
          }
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  function quickAdd() {
    const title = newTitle.trim();
    if (!title) return;
    addItem.mutate(
      { title, category: newCategory, display_order: items.length },
      {
        onSuccess: () => setNewTitle(""),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="pt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0 && !skippedOnboarding) {
    return <Onboarding onSkip={() => setSkippedOnboarding(true)} />;
  }

  return (
    <div className="pt-4 pb-28">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold mb-2">צ'קליסט</h1>
          <Progress done={doneCount} total={items.length} />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {[
            { id: "all", label: "הכל" },
            { id: "open", label: "פתוח" },
            { id: "done", label: "בוצע" },
          ].map((f) => (
            <FilterPill key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </FilterPill>
          ))}
          {CHECKLIST_CATEGORIES.filter((c) => items.some((i) => i.category === c.id)).map((c) => (
            <FilterPill key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.emoji} {c.label}
            </FilterPill>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">אין משימות בתצוגה הזו</div>
        )}

        {groups.map((g) => {
          const open = !collapsed.includes(g.cat.id);
          return (
            <div key={g.cat.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() =>
                  setCollapsed((c) =>
                    c.includes(g.cat.id) ? c.filter((x) => x !== g.cat.id) : [...c, g.cat.id],
                  )
                }
                className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-right min-h-0"
              >
                <span className="text-sm font-semibold">
                  {g.cat.emoji} {g.cat.label}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({g.done}/{g.total})
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className="text-muted-foreground transition-transform"
                  style={{ transform: open ? "rotate(180deg)" : undefined }}
                />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {g.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onToggle={() => handleToggle(item)}
                        onMenu={() => setMenuItem(item)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Quick add bar */}
      <div
        className="fixed bottom-[68px] inset-x-0 z-30 border-t border-border backdrop-blur-xl"
        style={{ background: "color-mix(in oklab, var(--surface) 88%, transparent)" }}
      >
        <div className="max-w-md mx-auto px-4 py-2 flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            placeholder="הוסף משימה..."
            dir="rtl"
            className="flex-1 min-w-0 h-10 rounded-lg bg-background border border-input px-3 text-sm outline-none focus:border-[color:var(--accent)]"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="h-10 rounded-lg bg-background border border-input px-1.5 text-sm shrink-0"
            aria-label="קטגוריה"
          >
            {CHECKLIST_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={quickAdd}
            disabled={!newTitle.trim() || addItem.isPending}
            className="h-10 px-3 rounded-lg bg-[color:var(--accent)] text-white text-sm inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
          >
            <Plus size={16} />
            הוסף
          </button>
        </div>
      </div>

      {/* Item menu */}
      <BottomSheet open={!!menuItem} onOpenChange={(o) => !o && setMenuItem(null)} title={menuItem?.title}>
        <div className="space-y-2 pb-2">
          <button
            onClick={() => {
              setEditItem(menuItem);
              setMenuItem(null);
            }}
            className="w-full flex items-center gap-2 rounded-xl border border-border px-3.5 py-3 text-right text-sm"
          >
            <Pencil size={16} /> ערוך משימה
          </button>
          <button
            onClick={() => {
              const id = menuItem!.id;
              setMenuItem(null);
              deleteItem.mutate(id, {
                onSuccess: () => toast.success("נמחק"),
                onError: (e: Error) => toast.error(e.message),
              });
            }}
            className="w-full flex items-center gap-2 rounded-xl border border-border px-3.5 py-3 text-right text-sm text-[color:var(--destructive)]"
          >
            <Trash2 size={16} /> מחק
          </button>
        </div>
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)} title="עריכת משימה">
        {editItem && (
          <EditForm
            item={editItem}
            saving={updateItem.isPending}
            onSave={(patch) =>
              updateItem.mutate(
                { id: editItem.id, patch },
                {
                  onSuccess: () => {
                    toast.success("עודכן");
                    setEditItem(null);
                  },
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          />
        )}
      </BottomSheet>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full text-xs border transition-colors min-h-0 ${
        active
          ? "bg-[color:var(--accent)] text-white border-transparent"
          : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EditForm({
  item,
  saving,
  onSave,
}: {
  item: ChecklistItem;
  saving: boolean;
  onSave: (patch: {
    title: string;
    category: string;
    priority: ChecklistPriority;
    notes: string | null;
    due_date: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [category, setCategory] = useState(item.category);
  const [priority, setPriority] = useState<ChecklistPriority>(item.priority);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [dueDate, setDueDate] = useState(item.due_date ?? "");

  return (
    <div className="space-y-3 pb-2">
      <label className="block">
        <span className="text-xs text-muted-foreground">כותרת</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          dir="rtl"
          className="mt-1 w-full h-11 rounded-lg bg-background border border-input px-3 text-sm outline-none focus:border-[color:var(--accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground">קטגוריה</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full h-11 rounded-lg bg-background border border-input px-3 text-sm"
        >
          {CHECKLIST_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-xs text-muted-foreground">עדיפות</span>
        <div className="mt-1 flex gap-2">
          {(["high", "normal", "low"] as ChecklistPriority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`flex-1 h-10 rounded-lg text-xs border ${
                priority === p
                  ? "bg-[color:var(--accent)] text-white border-transparent"
                  : "border-border text-muted-foreground"
              }`}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-xs text-muted-foreground">תאריך יעד</span>
        <div className="mt-1">
          <DateField value={dueDate} onChange={setDueDate} />
        </div>
      </div>

      <label className="block">
        <span className="text-xs text-muted-foreground">הערה</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          dir="rtl"
          rows={2}
          className="mt-1 w-full rounded-lg bg-background border border-input px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)]"
        />
      </label>

      <button
        onClick={() =>
          onSave({
            title: title.trim() || item.title,
            category,
            priority,
            notes: notes.trim() || null,
            due_date: dueDate || null,
          })
        }
        disabled={saving}
        className="w-full h-12 rounded-xl bg-[color:var(--accent)] text-white text-sm font-semibold disabled:opacity-60"
      >
        {saving ? "שומר..." : "שמור"}
      </button>
    </div>
  );
}
