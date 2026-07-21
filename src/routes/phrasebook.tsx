import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Volume2, Search } from "lucide-react";
import { useTrip } from "@/hooks/use-trip";
import {
  CATEGORIES,
  LANGUAGES,
  PHRASES,
  detectLanguage,
  type Category,
  type Phrase,
} from "@/lib/phrases";

export const Route = createFileRoute("/phrasebook")({
  head: () => ({
    meta: [
      { title: "שיחון" },
      { name: "description", content: "ביטויים שימושיים לטיול בשפת היעד" },
    ],
  }),
  component: PhrasebookPage,
});

function PhrasebookPage() {
  const { data: trip } = useTrip();
  const lang = detectLanguage(trip?.destination_country);
  const langMeta = LANGUAGES[lang];
  const phrases = PHRASES[lang] ?? [];

  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [query, setQuery] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsSupported, setTtsSupported] = useState(false);

  useEffect(() => {
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return phrases.filter(
        (p) =>
          p.hebrew.toLowerCase().includes(q) ||
          p.transliteration.toLowerCase().includes(q) ||
          p.native.toLowerCase().includes(q),
      );
    }
    return phrases.filter((p) => p.category === category);
  }, [phrases, category, query]);

  function speak(phrase: Phrase) {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(phrase.native);
    u.lang = langMeta.bcp47;
    u.onstart = () => setSpeakingId(phrase.id);
    u.onend = () => setSpeakingId((cur) => (cur === phrase.id ? null : cur));
    u.onerror = () => setSpeakingId((cur) => (cur === phrase.id ? null : cur));
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="pt-4 pb-[96px] flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center gap-3">
        <div className="text-3xl">{langMeta.flag}</div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight">שיחון</h1>
          <div className="text-sm text-muted-foreground">{langMeta.hebrewName}</div>
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש ביטוי..."
          className="w-full h-11 rounded-lg bg-background border border-input pr-9 pl-3 text-sm"
        />
      </div>

      {/* Category strip */}
      <div className="-mx-4 px-4 border-b border-border bg-[color:var(--surface)]">
        <div className="flex gap-2 overflow-x-auto py-2 no-scrollbar">
          {CATEGORIES.map((c) => {
            const active = !query && c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setQuery("");
                }}
                className={`shrink-0 h-8 px-3 rounded-full text-sm border transition-colors ${
                  active
                    ? "bg-[color:var(--accent)] text-white border-transparent shadow-sm"
                    : "bg-card border-border text-foreground"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground pt-10">
          לא נמצאו ביטויים
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="relative bg-card border border-border rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-4"
            >
              {ttsSupported && (
                <button
                  type="button"
                  onClick={() => speak(p)}
                  aria-label="השמע"
                  className={`absolute top-2 left-2 w-9 h-9 rounded-full flex items-center justify-center text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10 transition-colors ${
                    speakingId === p.id ? "animate-pulse bg-[color:var(--accent)]/10" : ""
                  }`}
                >
                  <Volume2 size={18} />
                </button>
              )}
              <div className="pl-10 pr-1">
                <div className="text-base font-semibold text-right leading-tight">
                  {p.hebrew}
                </div>
                <div
                  className="text-[15px] mt-1.5 text-right"
                  style={{ color: "var(--accent)" }}
                  lang={langMeta.bcp47}
                  dir="auto"
                >
                  {p.native}
                </div>
                <div className="text-[13px] italic text-muted-foreground mt-0.5" dir="ltr">
                  {p.transliteration}
                </div>
                <div className="flex gap-1.5 mt-3 pt-2 border-t border-border">
                  <Badge>עברית</Badge>
                  <Badge>תעתיק</Badge>
                  <Badge>מקור</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--surface)] text-muted-foreground border border-border">
      {children}
    </span>
  );
}
