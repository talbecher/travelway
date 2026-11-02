import {
  BedDouble, File, FileText, Landmark, MapPin, Plane, Shield, ShoppingBag, StickyNote, TrainFront, Ticket, Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "food" | "attraction" | "lodging" | "transport" | null;

const MAP: Record<string, { Icon: LucideIcon; tone: Tone }> = {
  food: { Icon: Utensils, tone: "food" },
  attraction: { Icon: Landmark, tone: "attraction" },
  hotel: { Icon: BedDouble, tone: "lodging" },
  hotel_checkin: { Icon: BedDouble, tone: "lodging" },
  accommodation: { Icon: BedDouble, tone: "lodging" },
  transport: { Icon: TrainFront, tone: "transport" },
  flight: { Icon: Plane, tone: null },
  note: { Icon: StickyNote, tone: null },
  shopping: { Icon: ShoppingBag, tone: null },
  insurance: { Icon: Shield, tone: null },
  visa: { Icon: FileText, tone: null },
  ticket: { Icon: Ticket, tone: null },
  other: { Icon: File, tone: null },
};

/** Line icon in a tinted circle, colored by the category tokens (neutral grey when none). Display only. */
export function CategoryIcon({ category, size = 32, className }: { category: string; size?: number; className?: string }) {
  const { Icon, tone } = MAP[category] ?? { Icon: MapPin, tone: null };
  const style = tone
    ? { width: size, height: size, background: `var(--cat-${tone}-bg)`, color: `var(--cat-${tone}-fg)` }
    : { width: size, height: size };
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center justify-center rounded-full shrink-0", !tone && "bg-muted text-muted-foreground", className)}
      style={style}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={1.75} />
    </span>
  );
}

const stripVs = (s: string) => s.replace(/\uFE0F/g, "").trim();

/** True when a stored icon is just the app's default for this category (safe to replace with CategoryIcon). */
export function isDefaultCategoryEmoji(stored: string | null | undefined, defaults: string[]): boolean {
  if (!stored) return true;
  const s = stripVs(stored);
  return defaults.some((d) => stripVs(d) === s);
}
