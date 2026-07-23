import { supabase } from "@/integrations/supabase/client";
import { hebDateLong } from "@/lib/format";

export type ExportStats = {
  totalDays: number;
  entryCount: number;
  emptyDays: number;
  sparseDays: number;
  plannedDays: number;
  avgEntries: number;
  hotelCount: number;
  charCount: number;
};

export type ExportResult = { prompt: string; stats: ExportStats };

function truncate(s: string, n: number) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function pad5(s: string | null | undefined) {
  if (!s) return "     ";
  return (s + "     ").slice(0, 5);
}

function nightsBetween(a: string, b: string) {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.max(0, Math.round((db - da) / 86400000));
}

const SEP = "━━━━━━━━━━━━━━━━━━━━━━━━━";

export async function generateAIPrompt(tripId: string): Promise<ExportResult> {
  const [tripRes, daysRes, entriesRes, hotelsRes, expensesRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase
      .from("itinerary_days")
      .select("id, day_number, date, city_label")
      .eq("trip_id", tripId)
      .order("day_number"),
    supabase
      .from("day_entries")
      .select(
        "id, day_id, entry_type, icon_emoji, title, location_name, time_of_day, display_order, description, linked_recommendation_id, itinerary_days!inner(trip_id)"
      )
      .eq("itinerary_days.trip_id", tripId)
      .order("display_order")
      .order("created_at"),
    supabase
      .from("hotels")
      .select("hotel_name, city, checkin_date, checkout_date, total_cost_ils")
      .eq("trip_id", tripId),
    supabase.from("expenses").select("amount_ils").eq("trip_id", tripId),
  ]);

  if (tripRes.error) throw tripRes.error;
  if (daysRes.error) throw daysRes.error;
  if (entriesRes.error) throw entriesRes.error;
  if (hotelsRes.error) throw hotelsRes.error;
  if (expensesRes.error) throw expensesRes.error;

  const trip = tripRes.data;
  const days = daysRes.data ?? [];
  const entries = (entriesRes.data ?? []) as Array<{
    day_id: string;
    entry_type: string;
    icon_emoji: string | null;
    title: string;
    location_name: string | null;
    time_of_day: string | null;
    display_order: number;
    description: string | null;
    linked_recommendation_id: string | null;
  }>;
  const hotels = hotelsRes.data ?? [];
  const expenses = expensesRes.data ?? [];

  // Fetch recommendation notes for entries missing description
  const recIds = Array.from(
    new Set(
      entries
        .filter((e) => !e.description && e.linked_recommendation_id)
        .map((e) => e.linked_recommendation_id as string)
    )
  );
  const recNotesMap = new Map<string, string>();
  if (recIds.length) {
    const { data: recs } = await supabase
      .from("recommendations")
      .select("id, notes")
      .in("id", recIds);
    for (const r of recs ?? []) {
      if (r.notes) recNotesMap.set(r.id, r.notes);
    }
  }

  const entriesByDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = entriesByDay.get(e.day_id) ?? [];
    arr.push(e);
    entriesByDay.set(e.day_id, arr);
  }

  const spent = expenses.reduce((s, e) => s + Number(e.amount_ils ?? 0), 0);
  const totalBudget = Number(trip.total_budget_ils ?? 0);
  const remaining = totalBudget - spent;

  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

  const lines: string[] = [];
  lines.push(
    `שלום! אני מתכנן טיול ל${trip.destination_country ?? "יעד"} ל-${trip.num_travelers} אנשים.`
  );
  lines.push(`${days.length} ימים | ${trip.start_date} עד ${trip.end_date}`);
  lines.push(`💰 תקציב כולל: ₪${fmt(totalBudget)}`);
  lines.push(`💸 הוצאנו עד כה: ₪${fmt(spent)}`);
  lines.push(`📊 נשאר: ₪${fmt(remaining)}`);
  lines.push("");
  lines.push(SEP);
  lines.push("🗺 המסלול המלא שבניתי:");
  lines.push(SEP);
  lines.push("");

  let emptyDays = 0;
  for (const d of days) {
    const dayEntries = entriesByDay.get(d.id) ?? [];
    lines.push(
      `── יום ${d.day_number} | ${hebDateLong(d.date)} | ${d.city_label ?? "ללא עיר"} ──`
    );
    if (dayEntries.length === 0) {
      lines.push("         (יום ריק — לא תוכנן עדיין)");
      emptyDays += 1;
    } else {
      for (const e of dayEntries) {
        const icon = e.icon_emoji || "•";
        lines.push(`${pad5(e.time_of_day)} ${icon} ${e.title}`);
        if (e.location_name) lines.push(`         📍 ${e.location_name}`);
        const notes =
          e.description ||
          (e.linked_recommendation_id
            ? recNotesMap.get(e.linked_recommendation_id) ?? ""
            : "");
        if (notes) lines.push(`         💬 ${truncate(notes, 80)}`);
      }
    }
    lines.push("");
  }

  lines.push(SEP);
  lines.push("🏨 לינה מתוכננת:");
  lines.push(SEP);
  if (hotels.length === 0) {
    lines.push("(לא הוזנו מלונות)");
  } else {
    for (const h of hotels) {
      const nights =
        h.checkin_date && h.checkout_date
          ? nightsBetween(h.checkin_date, h.checkout_date)
          : 0;
      const cost = h.total_cost_ils != null ? `₪${fmt(Number(h.total_cost_ils))}` : "לא הוזן";
      lines.push(`- ${h.hotel_name} | ${h.city ?? "—"}`);
      lines.push(
        `  ${h.checkin_date ?? "—"} → ${h.checkout_date ?? "—"} (${nights} לילות) | ${cost}`
      );
    }
  }
  lines.push("");

  lines.push(SEP);
  lines.push("🙏 אנא נתח את המסלול לפי הקטגוריות הבאות:");
  lines.push(SEP);
  lines.push("");
  lines.push("📍 1. הגיון גיאוגרפי");
  lines.push("- האם יש ימים שקופצים בין אזורים רחוקים שניתן לקבץ יחד?");
  lines.push("- האם סדר הערים הגיוני (ללא \"נסיעות כפולות\")?");
  lines.push("- אילו אטרקציות שנמצאות קרוב זו לזו מפוזרות בין ימים שונים?");
  lines.push("");
  lines.push("⏰ 2. ריאליזם זמנים");
  lines.push("- אילו ימים עמוסים מדי (לא ריאלי לבצע הכל)?");
  lines.push("- אילו ימים דלילים מדי ואפשר להוסיף?");
  lines.push("- האם ימי מעבר בין ערים מחושבים נכון (זמן נסיעה + הגעה למלון + עייפות)?");
  lines.push("");
  lines.push("💴 3. חיסכון בכסף ובזמן");
  lines.push("- איפה אוטובוס לילה עדיף על רכבת יקרה?");
  lines.push("- האם יש אטרקציות שניתן לשלב בכרטיס אחד?");
  lines.push("- לפי המסלול — האם JR Pass משתלם? (רכבת יפן: בדוק לפי הנסיעות שתוכננו)");
  lines.push("- ימי הגעה/עזיבה — האם מנוצלים טוב או שיש שעות \"מתות\"?");
  lines.push("");
  lines.push("😮‍💨 4. איזון אנרגיה");
  lines.push("- האם יש איזון בין ימים אינטנסיביים לרגועים?");
  lines.push("- האם יש מספיק זמן חופשי לאוכל, קניות, הפתעות, ותחושת ספונטניות?");
  lines.push("- האם יש ימים שדורשים קימה מוקדמת מאוד אחרי יום עמוס שלפניהם?");
  lines.push("");
  lines.push("🗓 5. תזמון חכם");
  lines.push("- האם יש אטרקציות שעדיף לבקר בהן בבוקר מוקדם לפני הצטופפות תיירים?");
  lines.push("- האם יש אטרקציות שסגורות ביום מסוים בשבוע שחשוב לבדוק?");
  lines.push(
    "- לפי תאריכי הטיול הספציפיים — האם יש פסטיבלים, חגים מקומיים, או עונות מיוחדות שכדאי לנצל או להיערך אליהן?"
  );
  lines.push("");
  lines.push(SEP);
  lines.push("✅ סיכום מבוקש:");
  lines.push(SEP);
  lines.push("");
  lines.push("1. רשום 3-5 שינויים מרכזיים לפי עדיפות:");
  lines.push("   • מה לשנות");
  lines.push("   • למה (גיאוגרפיה / חיסכון / עייפות / זמן)");
  lines.push("   • כמה זה חוסך בערך (זמן / כסף / אנרגיה)");
  lines.push("");
  lines.push("2. תן ציון כללי למסלול מ-1 עד 10 עם משפט הסבר אחד.");
  lines.push("");
  lines.push("3. אם יש שינוי אחד קריטי שהייתה ממליץ בחום — סמן אותו ב-⭐");

  const prompt = lines.join("\n");

  return {
    prompt,
    stats: {
      totalDays: days.length,
      entryCount: entries.length,
      emptyDays,
      hotelCount: hotels.length,
      charCount: prompt.length,
    },
  };
}
