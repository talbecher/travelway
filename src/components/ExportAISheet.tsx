import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BottomSheet } from "@/components/BottomSheet";
import type { ExportResult } from "@/lib/export-to-ai";

export function ExportAISheet({
  open,
  onOpenChange,
  title = "🤖 ייצא מסלול ל-AI",
  subtitle = "קבל ניתוח מקצועי של המסלול שלך",
  queryKey,
  generate,
  chips,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  subtitle?: string;
  queryKey: unknown[];
  generate: () => Promise<ExportResult>;
  chips?: (stats: ExportResult["stats"]) => string[];
}) {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: generate,
    enabled: open,
    staleTime: 30_000,
  });

  async function copyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      return true;
    } catch {
      toast.error("ההעתקה נכשלה");
      return false;
    }
  }

  const preview = useMemo(() => {
    if (!data) return "";
    return data.prompt.split("\n").slice(0, 30).join("\n");
  }, [data]);

  const chipLabels = data
    ? chips
      ? chips(data.stats)
      : [
          `${data.stats.totalDays} ימים`,
          `${data.stats.entryCount} פעילויות`,
          `${data.stats.hotelCount} מלונות`,
        ]
    : [];

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <div className="pb-2">
        <div className="text-right">
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</div>
        </div>

        {isLoading && (
          <div className="mt-4 text-center text-sm text-muted-foreground">מכין פרומפט…</div>
        )}
        {error && (
          <div className="mt-4 text-center text-sm text-[color:var(--accent-2)]">
            שגיאה בטעינת הנתונים
          </div>
        )}

        {data && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {chipLabels.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-[color:var(--surface-2)] text-[12px] px-2.5 py-1"
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="mt-4">
              <div className="text-[12px] text-muted-foreground mb-1.5">
                תצוגה מקדימה של הפרומפט
              </div>
              <div className="relative">
                <div
                  dir="rtl"
                  className="max-h-[35vh] overflow-auto bg-[color:var(--surface-2)] rounded-xl p-3 font-mono text-[12px] whitespace-pre-wrap leading-relaxed"
                >
                  {preview}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-[color:var(--surface-2)] to-transparent" />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5 text-left" dir="ltr">
                {data.stats.charCount.toLocaleString()} תווים —{" "}
                {Math.round(data.stats.charCount / 4).toLocaleString()} טוקנים בערך
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => copyPrompt(data.prompt)}
                className="h-12 rounded-xl bg-[color:var(--accent)] text-white font-medium text-[14px]"
              >
                {copied ? "✅ הועתק! כעת הדבק בכלי AI" : "📋 העתק פרומפט"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyPrompt(data.prompt);
                  const url =
                    "https://chatgpt.com/?q=" +
                    encodeURIComponent(
                      data.prompt.slice(0, 2000) +
                        "\n\n[המשך מלא הועתק ללוח - הדבק בצ'אט]"
                    );
                  window.open(url, "_blank", "noopener");
                }}
                className="h-11 rounded-xl bg-surface border border-border text-[14px]"
              >
                💬 פתח ב-ChatGPT ↗
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyPrompt(data.prompt);
                  window.open("https://claude.ai/new", "_blank", "noopener");
                }}
                className="h-11 rounded-xl bg-surface border border-border text-[14px]"
              >
                🤖 פתח ב-Claude ↗
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-[color:var(--accent)]/10 border border-[color:var(--accent)]/20 p-3 text-[12px] leading-relaxed">
              💡 טיפ: לתוצאות הטובות ביותר — העתק את הפרומפט המלא והדבק ישירות בשיחה עם Claude
              או ChatGPT. הם יוכלו לנתח את המסלול ולהציע שיפורים מותאמים אישית.
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

export default ExportAISheet;
