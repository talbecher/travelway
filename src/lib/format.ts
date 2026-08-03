export function ils(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `₪${v.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

export function jpy(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `¥${v.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`;
}

export function hebDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

export function hebDateLong(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", weekday: "long" });
}

export function hebWeekday(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("he-IL", { weekday: "long" });
}

export function hebWeekdayShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("he-IL", { weekday: "narrow" });
}

export function daysBetween(a: string | Date, b: string | Date) {
  const da = typeof a === "string" ? new Date(a + "T00:00:00") : a;
  const db = typeof b === "string" ? new Date(b + "T00:00:00") : b;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
