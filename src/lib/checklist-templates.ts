export type ChecklistPriority = "high" | "normal" | "low";

export type ChecklistCategory = {
  id: string;
  label: string;
  emoji: string;
};

export const CHECKLIST_CATEGORIES: ChecklistCategory[] = [
  { id: "documents", label: "מסמכים", emoji: "📄" },
  { id: "money", label: "כספים", emoji: "💳" },
  { id: "bookings", label: "הזמנות", emoji: "🎫" },
  { id: "health", label: "בריאות", emoji: "💊" },
  { id: "tech", label: "טכנולוגיה", emoji: "🔌" },
  { id: "packing", label: "אריזה", emoji: "🧳" },
  { id: "departure", label: "לפני היציאה", emoji: "✈️" },
  { id: "other", label: "אחר", emoji: "📝" },
];

export const CATEGORY_BY_ID: Record<string, ChecklistCategory> = Object.fromEntries(
  CHECKLIST_CATEGORIES.map((c) => [c.id, c]),
);

export function categoryMeta(id: string): ChecklistCategory {
  return CATEGORY_BY_ID[id] ?? { id, label: "אחר", emoji: "📝" };
}

export type TemplateItem = { title: string; priority: ChecklistPriority };

export const CHECKLIST_TEMPLATES: Record<string, TemplateItem[]> = {
  documents: [
    { title: "דרכון בתוקף לפחות 6 חודשים", priority: "high" },
    { title: "ויזה / אישור כניסה", priority: "high" },
    { title: "ביטוח נסיעות", priority: "high" },
    { title: "צילום מסמכים שמור בענן", priority: "normal" },
    { title: "רישיון נהיגה בינלאומי", priority: "normal" },
  ],
  money: [
    { title: "עדכון הבנק/אשראי על נסיעה לחו״ל", priority: "high" },
    { title: "המרת מטבע מקומי", priority: "normal" },
    { title: "כרטיס אשראי ללא עמלת המרה", priority: "normal" },
    { title: "מזומן לחירום", priority: "normal" },
  ],
  bookings: [
    { title: "כרטיסי טיסה מודפסים/שמורים", priority: "high" },
    { title: "אישורי מלון", priority: "high" },
    { title: "כרטיסים לאטרקציות שהוזמנו מראש", priority: "normal" },
    { title: "JR Pass (אם רלוונטי)", priority: "normal" },
    { title: "הסעה לשדה התעופה", priority: "normal" },
  ],
  health: [
    { title: "תרופות אישיות לכל תקופת הטיול", priority: "high" },
    { title: "מרשמים מהרופא (אנגלית)", priority: "normal" },
    { title: "ערכת עזרה ראשונה בסיסית", priority: "normal" },
    { title: "תרופה למחלת תנועה", priority: "low" },
  ],
  tech: [
    { title: "eSIM / כרטיס סים לחו״ל", priority: "high" },
    { title: "מתאם חשמל ליעד", priority: "high" },
    { title: "מטען נייד (פאוורבנק)", priority: "normal" },
    { title: "כבלי טעינה", priority: "normal" },
    { title: "מצלמה + כרטיס זיכרון", priority: "normal" },
  ],
  packing: [
    { title: "בגדים לפי מזג האוויר הצפוי", priority: "normal" },
    { title: "נעלי הליכה נוחות", priority: "high" },
    { title: "מטרייה קומפקטית", priority: "normal" },
    { title: "בגד שכבות לעונת ביניים", priority: "normal" },
    { title: "תיק יום קטן", priority: "normal" },
  ],
  departure: [
    { title: "צ׳ק-אין אונליין (24-48 שעות לפני)", priority: "high" },
    { title: "השקיה/טיפול בצמחים/חיות", priority: "normal" },
    { title: "נעילת הדירה", priority: "normal" },
    { title: "הסעה/חניה לשדה התעופה", priority: "high" },
  ],
};

/** Categories that have ready-made templates, in display order. */
export const TEMPLATE_CATEGORIES = CHECKLIST_CATEGORIES.filter(
  (c) => (CHECKLIST_TEMPLATES[c.id]?.length ?? 0) > 0,
);
