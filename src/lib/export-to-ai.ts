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

/** Machine-readable contract so the app can import the AI answer back automatically. */
function formatSection(
  days: Array<{ day_number: number; date: string; city_label: string | null }>
): string[] {
  const lines: string[] = [];
  lines.push(SEP);
  lines.push("🔁 חשוב! פורמט תשובה לייבוא אוטומטי:");
  lines.push(SEP);
  lines.push("");
  lines.push(
    "בסוף התשובה (אחרי ההסבר בעברית), הוסף בלוק JSON אחד בלבד, עטוף ב-```json, בפורמט המדויק הבא:"
  );
  lines.push("");
  lines.push("```json");
  lines.push("{");
  lines.push('  "version": 1,');
  lines.push('  "itinerary": [');
  lines.push("    {");
  lines.push(`      "day_number": ${days[0]?.day_number ?? 1},`);
  lines.push('      "entries": [');
  lines.push("        {");
  lines.push('          "title": "שם הפעילות בעברית",');
  lines.push('          "entry_type": "attraction",');
  lines.push('          "time_of_day": "09:00",');
  lines.push('          "location_name": "Kiyomizu-dera, Kyoto",');
  lines.push('          "description": "למה כדאי / טיפ קצר",');
  lines.push('          "icon_emoji": "⛩"');
  lines.push("        }");
  lines.push("      ]");
  lines.push("    }");
  lines.push("  ],");
  lines.push('  "recommendations": [');
  lines.push("    {");
  lines.push('      "name": "Ichiran Ramen Shibuya",');
  lines.push('      "type": "food",');
  lines.push('      "city": "Tokyo",');
  lines.push('      "notes": "למה מומלץ, מחיר משוער, כמה זמן",');
  lines.push('      "booking_deadline": "2026-10-01",');
  lines.push('      "booking_time": "10:00",');
  lines.push('      "booking_url": "https://...",');
  lines.push('      "booking_note": "כרטיסים נפתחים חודש מראש"');
  lines.push("    }");
  lines.push("  ]");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("כללים מחייבים:");
  lines.push('- "entry_type" חייב להיות אחד מ: attraction | food | transport | note | flight | hotel_checkin');
  lines.push('- "type" בהמלצות חייב להיות אחד מ: food | attraction | hotel');
  lines.push('- "time_of_day" בפורמט HH:MM בלבד, "booking_deadline" בפורמט YYYY-MM-DD');
  lines.push('- "location_name" — שם המקום באנגלית + עיר, כדי שאפשר יהיה לאתר אותו במפות');
  lines.push("- שדות לא רלוונטיים אפשר להשמיט (או null). אין להמציא שדות חדשים.");
  lines.push('- "day_number" חייב להיות אחד מהערכים הבאים בלבד:');
  for (const d of days) {
    lines.push(`  ${d.day_number} = ${d.date}${d.city_label ? ` (${d.city_label})` : ""}`);
  }
  lines.push("- החזר בלוק JSON אחד בלבד בסוף התשובה, בלי טקסט בתוך הבלוק.");
  lines.push("");
  lines.push("🕐 מיזוג עם המסלול הקיים:");
  lines.push("- הפעילויות שכבר קיימות ביום (עם השעות שלהן) מופיעות למעלה. אל תחזיר אותן שוב.");
  lines.push("- תכנן את הפעילויות החדשות מסביב לקיים: בלי חפיפות שעות, עם זמן נסיעה סביר ביניהן.");
  lines.push("- חובה לתת time_of_day לכל פעילות חדשה — המערכת ממזגת לפי שעות עם מה שכבר קיים.");
  lines.push("- שים לב ללינה/צ'ק-אין וצ'ק-אאוט הקיימים: אל תתכנן פעילויות שמתנגשות איתם.");
  lines.push("");
  lines.push("🎟 הזמנות מראש (חשוב!):");
  lines.push(
    "- זהה כל דבר שדורש הזמנה/כרטיס מראש: אטרקציות עם כרטיסים במכסה, מוזיאונים, מסעדות פופולריות, טיולים מודרכים, כרטיסי רכבת מהירה/פאס, העברות שדה תעופה, השכרת רכב."
  );
  lines.push(
    '- לכל פריט כזה: הוסף אותו גם ל-"recommendations" עם "booking_deadline" (התאריך האחרון להזמנה), "booking_time" (אם המכירה נפתחת בשעה מסוימת), "booking_url" (אתר ההזמנה הרשמי) ו-"booking_note" (כמה זמן מראש, מאיפה מזמינים, מחיר משוער, כמה כרטיסים).'
  );
  lines.push(
    "- חישוב הדדליין: תאריך הביקור במסלול פחות זמן ההקדמה הנדרש (למשל כרטיסים שנפתחים חודש מראש ונגמרים תוך ימים → דדליין מוקדם). תמיד תאריך עתידי בפורמט YYYY-MM-DD."
  );
  lines.push(
    '- בנוסף, בפעילות עצמה ב-"itinerary" הוסף ב-"description" תזכורת קצרה: "🎟 להזמין עד <תאריך> ב-<אתר>".'
  );
  lines.push("- אל תמציא תאריכים: אם אינך בטוח, אל תמלא booking_deadline וכתוב את אי-הוודאות ב-booking_note.");
  return lines;
}


async function activeVersionId(tripId: string): Promise<string | null> {
  const { data } = await supabase
    .from("itinerary_versions")
    .select("id, is_active")
    .eq("trip_id", tripId)
    .order("created_at");
  return (data ?? []).find((v) => v.is_active)?.id ?? data?.[0]?.id ?? null;
}

export async function generateAIPrompt(tripId: string): Promise<ExportResult> {
  const versionId = await activeVersionId(tripId);
  const daysBase = supabase
    .from("itinerary_days")
    .select("id, day_number, date, city_label")
    .eq("trip_id", tripId);
  const entriesBase = supabase
    .from("day_entries")
    .select(
      "id, day_id, entry_type, icon_emoji, title, location_name, time_of_day, display_order, description, linked_recommendation_id, itinerary_days!inner(trip_id, version_id)"
    )
    .eq("itinerary_days.trip_id", tripId);

  const [tripRes, daysRes, entriesRes, hotelsRes, expensesRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    (versionId ? daysBase.eq("version_id", versionId) : daysBase).order("day_number"),
    (versionId ? entriesBase.eq("itinerary_days.version_id", versionId) : entriesBase)
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

  let emptyDays = 0;
  let sparseDays = 0;
  let plannedDays = 0;
  for (const d of days) {
    const count = (entriesByDay.get(d.id) ?? []).length;
    if (count === 0) emptyDays += 1;
    else {
      plannedDays += 1;
      if (count === 1) sparseDays += 1;
    }
  }
  const avgEntries = plannedDays
    ? Math.round((entries.length / plannedDays) * 10) / 10
    : 0;

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
  lines.push("📊 מצב התכנון הנוכחי:");
  lines.push(`- ימים עם תוכנית: ${plannedDays} מתוך ${days.length}`);
  lines.push(`- ימים ריקים לחלוטין: ${emptyDays}`);
  lines.push(`- ימים עם פחות מ-2 פעילויות: ${sparseDays}`);
  lines.push(`- ממוצע פעילויות ביום מתוכנן: ${avgEntries}`);
  lines.push("");
  lines.push(SEP);
  lines.push("🗺 המסלול המלא שבניתי:");
  lines.push(SEP);
  lines.push("");

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
  lines.push("🗺 6. תכנון ימים חסרים ויום-דליל");
  lines.push(`- במסלול יש ${emptyDays} ימים ריקים ו-${sparseDays} ימים דלילים.`);
  lines.push("");
  lines.push("לכל יום ריק, אנא הצע 3-4 פעילויות מומלצות לפי העיר שאני אהיה בה:");
  lines.push("- שם המקום");
  lines.push("- מדוע הוא מומלץ (ייחודיות, מיקום, חוויה)");
  lines.push("- מחיר משוער (חינם / ¥ / ¥¥ / ¥¥¥)");
  lines.push("- כמה זמן לתכנן (שעה / חצי יום / יום שלם)");
  lines.push("");
  lines.push("לימים עם פחות מ-2 פעילויות, הצע פעילויות שמשלימות את מה שכבר תוכנן —");
  lines.push("באותו אזור, באותו קצב.");
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
  lines.push("");
  lines.push(
    ...formatSection(
      days.map((d) => ({ day_number: d.day_number, date: d.date, city_label: d.city_label ?? null }))
    )
  );


  const prompt = lines.join("\n");

  return {
    prompt,
    stats: {
      totalDays: days.length,
      entryCount: entries.length,
      emptyDays,
      sparseDays,
      plannedDays,
      avgEntries,
      hotelCount: hotels.length,
      charCount: prompt.length,
    },
  };
}

export async function generateDayAIPrompt(
  tripId: string,
  dayId: string
): Promise<ExportResult> {
  const versionId = await activeVersionId(tripId);
  const daysBase = supabase
    .from("itinerary_days")
    .select("id, day_number, date, city_label")
    .eq("trip_id", tripId);
  const [tripRes, daysRes, entriesRes, hotelsRes] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    (versionId ? daysBase.eq("version_id", versionId) : daysBase).order("day_number"),
    supabase
      .from("day_entries")
      .select(
        "id, entry_type, icon_emoji, title, location_name, time_of_day, display_order, description, linked_recommendation_id"
      )
      .eq("day_id", dayId)
      .order("display_order")
      .order("created_at"),
    supabase
      .from("hotels")
      .select("hotel_name, city, checkin_date, checkout_date, total_cost_ils")
      .eq("trip_id", tripId),
  ]);

  if (tripRes.error) throw tripRes.error;
  if (daysRes.error) throw daysRes.error;
  if (entriesRes.error) throw entriesRes.error;
  if (hotelsRes.error) throw hotelsRes.error;

  const trip = tripRes.data;
  const days = daysRes.data ?? [];
  const day = days.find((d) => d.id === dayId);
  if (!day) throw new Error("היום לא נמצא");

  const entries = (entriesRes.data ?? []) as Array<{
    entry_type: string;
    icon_emoji: string | null;
    title: string;
    location_name: string | null;
    time_of_day: string | null;
    description: string | null;
    linked_recommendation_id: string | null;
  }>;

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

  // Hotel covering this night (checkin <= date < checkout), pure string compare
  const hotels = hotelsRes.data ?? [];
  const nightHotel = hotels.find(
    (h) =>
      h.checkin_date &&
      h.checkout_date &&
      h.checkin_date <= day.date &&
      day.date < h.checkout_date
  );

  const idx = days.findIndex((d) => d.id === dayId);
  const prevDay = idx > 0 ? days[idx - 1] : null;
  const nextDay = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;

  const lines: string[] = [];
  lines.push(
    `שלום! אני מתכנן יום בודד בטיול ל${trip.destination_country ?? "יעד"} ל-${trip.num_travelers} אנשים.`
  );
  lines.push(
    `היום: יום ${day.day_number} מתוך ${days.length} | ${hebDateLong(day.date)} | ${day.city_label ?? "ללא עיר"}`
  );
  if (prevDay) {
    lines.push(`אתמול (יום ${prevDay.day_number}): ${prevDay.city_label ?? "ללא עיר"}`);
  }
  if (nextDay) {
    lines.push(`מחר (יום ${nextDay.day_number}): ${nextDay.city_label ?? "ללא עיר"}`);
  }
  lines.push("");
  lines.push(SEP);
  lines.push("🗺 מה מתוכנן ביום הזה:");
  lines.push(SEP);
  lines.push("");

  if (entries.length === 0) {
    lines.push("(יום ריק — לא תוכנן עדיין)");
  } else {
    for (const e of entries) {
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

  lines.push(SEP);
  lines.push("🏨 לינה בלילה הזה:");
  lines.push(SEP);
  if (nightHotel) {
    const nights = nightsBetween(nightHotel.checkin_date!, nightHotel.checkout_date!);
    lines.push(`- ${nightHotel.hotel_name} | ${nightHotel.city ?? "—"}`);
    lines.push(
      `  ${nightHotel.checkin_date} → ${nightHotel.checkout_date} (${nights} לילות)`
    );
  } else {
    lines.push("(לא הוזן מלון ללילה הזה)");
  }
  lines.push("");

  lines.push(SEP);
  lines.push("🙏 אנא נתח את היום הזה בלבד:");
  lines.push(SEP);
  lines.push("");
  lines.push("📍 1. הגיון גיאוגרפי בתוך היום");
  lines.push("- האם סדר התחנות יעיל או שיש קפיצות מיותרות הלוך-חזור?");
  lines.push("- מה הסדר האופטימלי של התחנות לפי מיקום?");
  lines.push("- כמה זמן נסיעה בין תחנה לתחנה (ובאיזה אמצעי תחבורה)?");
  lines.push("");
  lines.push("⏰ 2. ריאליזם זמנים");
  lines.push("- האם היום עמוס מדי או דליל מדי?");
  lines.push("- כמה זמן ריאלי להקדיש לכל תחנה?");
  lines.push("- באיזו שעה כדאי לצאת ומתי לחזור?");
  lines.push("");
  lines.push("🗓 3. תזמון חכם");
  lines.push("- מה עדיף לעשות מוקדם בבוקר כדי להימנע מתורים והמונים?");
  lines.push("- האם משהו עלול להיות סגור בתאריך/יום הזה?");
  lines.push("- האם יש נקודה שעדיף לראות בשקיעה או בערב?");
  lines.push("");
  lines.push("➕ 4. השלמות לאותו אזור");
  lines.push("- הצע 2-4 מקומות נוספים קרובים שמשתלבים היטב ביום הזה:");
  lines.push("  • שם המקום");
  lines.push("  • מדוע הוא מתאים דווקא כאן");
  lines.push("  • כמה זמן להקדיש לו");
  lines.push("  • מחיר משוער");
  lines.push("- כולל המלצה אחת לאוכל מקומי באזור.");
  lines.push("");
  lines.push(SEP);
  lines.push("✅ סיכום מבוקש:");
  lines.push(SEP);
  lines.push("");
  lines.push("1. לוח זמנים מוצע ליום (שעה → פעילות), מסודר ומעשי.");
  lines.push("2. 3 שיפורים מרכזיים ליום הזה לפי עדיפות.");
  lines.push("3. ציון ליום מ-1 עד 10 עם משפט הסבר אחד.");
  lines.push("");
  lines.push(...formatSection([{ day_number: day.day_number, date: day.date, city_label: day.city_label ?? null }]));


  const prompt = lines.join("\n");

  return {
    prompt,
    stats: {
      totalDays: 1,
      entryCount: entries.length,
      emptyDays: entries.length === 0 ? 1 : 0,
      sparseDays: entries.length === 1 ? 1 : 0,
      plannedDays: entries.length > 0 ? 1 : 0,
      avgEntries: entries.length,
      hotelCount: nightHotel ? 1 : 0,
      charCount: prompt.length,
    },
  };
}
