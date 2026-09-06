import { useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import {
  useActiveVersion,
  useCreateVersion,
  useSetActiveVersion,
  type ItineraryVersion,
} from "@/hooks/use-versions";

const AI_TOOLS = ["Claude", "Gemini", "ChatGPT"];

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pillLabel(v: ItineraryVersion) {
  if (v.source === "ai") {
    const tool = v.ai_tool ? ` ${v.ai_tool}` : "";
    return `🤖 ${v.name}${tool} · ${shortDate(v.created_at)}`;
  }
  return `📋 ${v.name}`;
}

export function VersionSelector({ tripId }: { tripId: string }) {
  const { version: active, versions } = useActiveVersion(tripId);
  const setActive = useSetActiveVersion();
  const createVersion = useCreateVersion();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("גרסה חדשה");
  const [source, setSource] = useState<"manual" | "ai">("manual");
  const [aiTool, setAiTool] = useState(AI_TOOLS[0]);

  if (versions.length === 0) return null;

  async function create() {
    if (!name.trim()) return toast.error("חסר שם לגרסה");
    try {
      const v = await createVersion.mutateAsync({
        tripId,
        name: name.trim(),
        source,
        aiTool: source === "ai" ? aiTool : null,
        cloneDaysFromVersionId: active?.id ?? null,
      });
      await setActive.mutateAsync({ tripId, versionId: v.id });
      setOpen(false);
      setName("גרסה חדשה");
      setSource("manual");
      toast.success(`עברת ל: ${v.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
        <div className="flex w-max gap-1.5" dir="rtl">
          {versions.length > 1 &&
            versions.map((v) => {
              const isActive = active?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    if (isActive) return;
                    setActive.mutate(
                      { tripId, versionId: v.id },
                      { onSuccess: () => toast.success(`עברת ל: ${v.name}`) }
                    );
                  }}
                  className={`flex h-11 items-center rounded-full px-1 text-[12px] whitespace-nowrap transition-colors ${
                    isActive
                      ? "text-accent-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`flex h-[30px] items-center gap-1 rounded-full px-3 ${
                      isActive
                        ? "bg-accent"
                        : "border border-border bg-surface"
                    }`}
                  >
                    {pillLabel(v)}
                    {isActive && <span>✓</span>}
                  </span>
                </button>
              );
            })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 items-center rounded-full px-1 text-[12px] whitespace-nowrap text-muted-foreground"
          >
            <span className="flex h-[30px] items-center rounded-full border border-dashed border-border-strong bg-surface px-3">
              + גרסה חדשה
            </span>
          </button>
        </div>
      </div>

      <BottomSheet open={open} onOpenChange={setOpen} title="גרסה חדשה למסלול">
        <div className="space-y-4 pb-2">
          <div>
            <label className="text-xs text-muted-foreground">שם הגרסה</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg bg-background border border-input px-3 h-11"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מקור</label>
            <div className="mt-1 flex gap-2">
              {(["manual", "ai"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`flex-1 h-10 rounded-lg text-sm border ${
                    source === s
                      ? "bg-accent text-white border-transparent"
                      : "bg-surface-2 border-border text-muted-foreground"
                  }`}
                >
                  {s === "manual" ? "📋 ידני" : "🤖 AI"}
                </button>
              ))}
            </div>
          </div>
          {source === "ai" && (
            <div>
              <label className="text-xs text-muted-foreground">כלי</label>
              <div className="mt-1 flex gap-2">
                {AI_TOOLS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAiTool(t)}
                    className={`flex-1 h-10 rounded-lg text-sm border ${
                      aiTool === t
                        ? "bg-accent text-white border-transparent"
                        : "bg-surface-2 border-border text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={create}
            disabled={createVersion.isPending || setActive.isPending}
            className="w-full h-12 rounded-lg bg-[color:var(--accent)] text-white font-medium disabled:opacity-50"
          >
            {createVersion.isPending ? "יוצר..." : "צור גרסה ריקה"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full h-10 text-sm text-muted-foreground"
          >
            ביטול
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
