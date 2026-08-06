import { daysBetween } from "@/lib/format";

export type DeadlineUrgency = "overdue" | "critical" | "warning" | "normal";

export type DeadlineItem = {
  id: string;
  name: string;
  type: "hotel" | "recommendation";
  recType?: string | null;
  deadline: string;
  daysLeft: number;
  urgency: DeadlineUrgency;
  booking_url?: string | null;
  booking_time?: string | null;
  status?: string | null;
  sourceId: string;
};

type HotelLike = {
  id: string;
  hotel_name: string;
  cancellation_deadline?: string | null;
  checkout_date?: string | null;
  confirmation_url?: string | null;
};

type RecLike = {
  id: string;
  name: string;
  type?: string | null;
  booking_deadline?: string | null;
  booking_status?: string | null;
  booking_url?: string | null;
  booking_time?: string | null;
};

function urgencyFor(daysLeft: number): DeadlineUrgency {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 2) return "critical";
  if (daysLeft <= 7) return "warning";
  return "normal";
}

export function buildDeadlines(
  hotels: HotelLike[] | undefined,
  recs: RecLike[] | undefined,
  today: string,
): DeadlineItem[] {
  const items: DeadlineItem[] = [];

  for (const h of hotels ?? []) {
    if (!h.cancellation_deadline) continue;
    // Only hotels whose stay hasn't ended yet
    if (h.checkout_date && h.checkout_date < today) continue;
    const daysLeft = daysBetween(today, h.cancellation_deadline);
    items.push({
      id: `hotel-${h.id}`,
      name: h.hotel_name,
      type: "hotel",
      deadline: h.cancellation_deadline,
      daysLeft,
      urgency: urgencyFor(daysLeft),
      booking_url: h.confirmation_url ?? null,
      sourceId: h.id,
    });
  }

  for (const r of recs ?? []) {
    if (!r.booking_deadline) continue;
    if (r.booking_status === "booked") continue;
    const daysLeft = daysBetween(today, r.booking_deadline);
    items.push({
      id: `rec-${r.id}`,
      name: r.name,
      type: "recommendation",
      recType: r.type ?? null,
      deadline: r.booking_deadline,
      daysLeft,
      urgency: urgencyFor(daysLeft),
      booking_url: r.booking_url ?? null,
      booking_time: r.booking_time ?? null,
      status: r.booking_status ?? "none",
      sourceId: r.id,
    });
  }

  return items.filter((i) => i.daysLeft >= -30).sort((a, b) => a.daysLeft - b.daysLeft);
}

export const URGENCY_COLOR: Record<DeadlineUrgency, string> = {
  overdue: "#EF4444",
  critical: "#EF4444",
  warning: "#F59E0B",
  normal: "var(--border)",
};

/** Chip label + tone for a booking deadline on a recommendation card. */
export function bookingChip(
  deadline: string | null | undefined,
  status: string | null | undefined,
  today: string,
): { label: string; tone: "booked" | "red" | "orange" | "muted"; pulse?: boolean } | null {
  if (!deadline) return null;
  if (status === "booked") return { label: "✅ הוזמן", tone: "booked" };
  const d = daysBetween(today, deadline);
  if (d < 0) return { label: `🔴 פספסת! היה ב-${deadline.slice(8, 10)}/${deadline.slice(5, 7)}`, tone: "red" };
  if (d === 0) return { label: "🔴 היום!", tone: "red", pulse: true };
  if (d <= 2) return { label: `🔴 בעוד ${d} ימים`, tone: "red" };
  if (d <= 7) return { label: `🟠 בעוד ${d} ימים`, tone: "orange" };
  return { label: `🎟 הזמנה בעוד ${d} ימים`, tone: "muted" };
}

function shortDate(iso: string) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** "ביטול חינם עד 26.11" / "להזמין עד 26.11 בשעה 09:00" */
export function deadlineLabel(item: DeadlineItem): string {
  const base =
    item.type === "hotel"
      ? `ביטול חינם עד ${shortDate(item.deadline)}`
      : `להזמין עד ${shortDate(item.deadline)}`;
  return item.booking_time ? `${base} בשעה ${item.booking_time}` : base;
}

/** "עוד 112 ימים" / "🔴 היום!" / "⚠️ פספסת לפני 3 ימים" */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `⚠️ פספסת לפני ${Math.abs(daysLeft)} ימים`;
  if (daysLeft === 0) return "🔴 היום!";
  if (daysLeft === 1) return "🔴 מחר";
  return `עוד ${daysLeft} ימים`;
}
