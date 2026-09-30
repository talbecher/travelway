// Local country + currency lists for trip onboarding. No network calls.
export type Country = { code: string; he: string; en: string; currency: string };

export const COUNTRIES: Country[] = [
  { code: "JP", he: "יפן", en: "Japan", currency: "JPY" },
  { code: "IT", he: "איטליה", en: "Italy", currency: "EUR" },
  { code: "FR", he: "צרפת", en: "France", currency: "EUR" },
  { code: "ES", he: "ספרד", en: "Spain", currency: "EUR" },
  { code: "PT", he: "פורטוגל", en: "Portugal", currency: "EUR" },
  { code: "DE", he: "גרמניה", en: "Germany", currency: "EUR" },
  { code: "NL", he: "הולנד", en: "Netherlands", currency: "EUR" },
  { code: "BE", he: "בלגיה", en: "Belgium", currency: "EUR" },
  { code: "AT", he: "אוסטריה", en: "Austria", currency: "EUR" },
  { code: "GR", he: "יוון", en: "Greece", currency: "EUR" },
  { code: "CY", he: "קפריסין", en: "Cyprus", currency: "EUR" },
  { code: "IE", he: "אירלנד", en: "Ireland", currency: "EUR" },
  { code: "FI", he: "פינלנד", en: "Finland", currency: "EUR" },
  { code: "HR", he: "קרואטיה", en: "Croatia", currency: "EUR" },
  { code: "SI", he: "סלובניה", en: "Slovenia", currency: "EUR" },
  { code: "SK", he: "סלובקיה", en: "Slovakia", currency: "EUR" },
  { code: "MT", he: "מלטה", en: "Malta", currency: "EUR" },
  { code: "EE", he: "אסטוניה", en: "Estonia", currency: "EUR" },
  { code: "LV", he: "לטביה", en: "Latvia", currency: "EUR" },
  { code: "LT", he: "ליטא", en: "Lithuania", currency: "EUR" },
  { code: "ME", he: "מונטנגרו", en: "Montenegro", currency: "EUR" },
  { code: "GB", he: "בריטניה", en: "United Kingdom", currency: "GBP" },
  { code: "CH", he: "שווייץ", en: "Switzerland", currency: "CHF" },
  { code: "CZ", he: "צ'כיה", en: "Czech Republic", currency: "CZK" },
  { code: "PL", he: "פולין", en: "Poland", currency: "PLN" },
  { code: "HU", he: "הונגריה", en: "Hungary", currency: "HUF" },
  { code: "RO", he: "רומניה", en: "Romania", currency: "RON" },
  { code: "BG", he: "בולגריה", en: "Bulgaria", currency: "BGN" },
  { code: "GE", he: "גאורגיה", en: "Georgia", currency: "GEL" },
  { code: "TR", he: "טורקיה", en: "Turkey", currency: "TRY" },
  { code: "SE", he: "שוודיה", en: "Sweden", currency: "SEK" },
  { code: "NO", he: "נורווגיה", en: "Norway", currency: "NOK" },
  { code: "DK", he: "דנמרק", en: "Denmark", currency: "DKK" },
  { code: "IS", he: "איסלנד", en: "Iceland", currency: "ISK" },
  { code: "IL", he: "ישראל", en: "Israel", currency: "ILS" },
  { code: "AE", he: "איחוד האמירויות", en: "United Arab Emirates", currency: "AED" },
  { code: "EG", he: "מצרים", en: "Egypt", currency: "EGP" },
  { code: "JO", he: "ירדן", en: "Jordan", currency: "JOD" },
  { code: "MA", he: "מרוקו", en: "Morocco", currency: "MAD" },
  { code: "ZA", he: "דרום אפריקה", en: "South Africa", currency: "ZAR" },
  { code: "TZ", he: "טנזניה", en: "Tanzania", currency: "TZS" },
  { code: "KE", he: "קניה", en: "Kenya", currency: "KES" },
  { code: "US", he: "ארצות הברית", en: "United States", currency: "USD" },
  { code: "CA", he: "קנדה", en: "Canada", currency: "CAD" },
  { code: "MX", he: "מקסיקו", en: "Mexico", currency: "MXN" },
  { code: "BR", he: "ברזיל", en: "Brazil", currency: "BRL" },
  { code: "AR", he: "ארגנטינה", en: "Argentina", currency: "ARS" },
  { code: "CL", he: "צ'ילה", en: "Chile", currency: "CLP" },
  { code: "PE", he: "פרו", en: "Peru", currency: "PEN" },
  { code: "CO", he: "קולומביה", en: "Colombia", currency: "COP" },
  { code: "CR", he: "קוסטה ריקה", en: "Costa Rica", currency: "CRC" },
  { code: "TH", he: "תאילנד", en: "Thailand", currency: "THB" },
  { code: "VN", he: "וייטנאם", en: "Vietnam", currency: "VND" },
  { code: "KR", he: "דרום קוריאה", en: "South Korea", currency: "KRW" },
  { code: "CN", he: "סין", en: "China", currency: "CNY" },
  { code: "TW", he: "טייוואן", en: "Taiwan", currency: "TWD" },
  { code: "HK", he: "הונג קונג", en: "Hong Kong", currency: "HKD" },
  { code: "SG", he: "סינגפור", en: "Singapore", currency: "SGD" },
  { code: "MY", he: "מלזיה", en: "Malaysia", currency: "MYR" },
  { code: "ID", he: "אינדונזיה", en: "Indonesia", currency: "IDR" },
  { code: "PH", he: "הפיליפינים", en: "Philippines", currency: "PHP" },
  { code: "IN", he: "הודו", en: "India", currency: "INR" },
  { code: "LK", he: "סרי לנקה", en: "Sri Lanka", currency: "LKR" },
  { code: "NP", he: "נפאל", en: "Nepal", currency: "NPR" },
  { code: "MV", he: "האיים המלדיביים", en: "Maldives", currency: "MVR" },
  { code: "AU", he: "אוסטרליה", en: "Australia", currency: "AUD" },
  { code: "NZ", he: "ניו זילנד", en: "New Zealand", currency: "NZD" },
];

export const CURRENCIES: string[] = Array.from(
  new Set(["ILS", "USD", "EUR", "GBP", ...COUNTRIES.map((c) => c.currency)]),
).sort();

export function isValidCurrency(code: string): boolean {
  return CURRENCIES.includes(code.toUpperCase());
}

export function searchCountries(q: string): Country[] {
  const s = q.trim().toLowerCase();
  if (!s) return COUNTRIES;
  return COUNTRIES.filter((c) => c.he.includes(s) || c.en.toLowerCase().includes(s) || c.code.toLowerCase() === s);
}
