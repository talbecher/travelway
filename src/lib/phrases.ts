export type LangCode = "ja" | "fr" | "it" | "es" | "th" | "el" | "en";

export type Phrase = {
  id: string;
  category: string;
  hebrew: string;
  transliteration: string;
  native: string;
};

export const CATEGORIES = [
  "נימוסים",
  "מסעדה",
  "תחבורה",
  "קניות",
  "מלון",
  "חירום",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const LANGUAGES: Record<
  LangCode,
  { code: LangCode; hebrewName: string; flag: string; bcp47: string }
> = {
  ja: { code: "ja", hebrewName: "יפנית", flag: "🇯🇵", bcp47: "ja-JP" },
  fr: { code: "fr", hebrewName: "צרפתית", flag: "🇫🇷", bcp47: "fr-FR" },
  it: { code: "it", hebrewName: "איטלקית", flag: "🇮🇹", bcp47: "it-IT" },
  es: { code: "es", hebrewName: "ספרדית", flag: "🇪🇸", bcp47: "es-ES" },
  th: { code: "th", hebrewName: "תאית", flag: "🇹🇭", bcp47: "th-TH" },
  el: { code: "el", hebrewName: "יוונית", flag: "🇬🇷", bcp47: "el-GR" },
  en: { code: "en", hebrewName: "אנגלית", flag: "🌍", bcp47: "en-US" },
};

export function detectLanguage(destination: string | null | undefined): LangCode {
  const d = (destination ?? "").toLowerCase();
  if (!d) return "en";
  if (/יפן|japan|tokyo|osaka|kyoto/.test(d)) return "ja";
  if (/צרפת|france|paris/.test(d)) return "fr";
  if (/איטליה|italy|rome|roma|milan/.test(d)) return "it";
  if (/ספרד|spain|barcelona|madrid/.test(d)) return "es";
  if (/תאילנד|thailand|bangkok/.test(d)) return "th";
  if (/יוון|greece|athens/.test(d)) return "el";
  return "en";
}

/* ---------- helpers ---------- */
let _id = 0;
const p = (
  category: Category,
  hebrew: string,
  transliteration: string,
  native: string,
): Phrase => ({ id: `p${++_id}`, category, hebrew, transliteration, native });

/* ---------- Japanese ---------- */
const JA: Phrase[] = [
  // נימוסים
  p("נימוסים", "שלום", "Konnichiwa", "こんにちは"),
  p("נימוסים", "בוקר טוב", "Ohayou gozaimasu", "おはようございます"),
  p("נימוסים", "ערב טוב", "Konbanwa", "こんばんは"),
  p("נימוסים", "תודה רבה", "Arigatou gozaimasu", "ありがとうございます"),
  p("נימוסים", "בבקשה", "Onegaishimasu", "おねがいします"),
  p("נימוסים", "סליחה", "Sumimasen", "すみません"),
  p("נימוסים", "כן", "Hai", "はい"),
  p("נימוסים", "לא", "Iie", "いいえ"),
  p("נימוסים", "אני לא מבין", "Wakarimasen", "わかりません"),
  p("נימוסים", "דבר אנגלית?", "Eigo hanasemasu ka", "英語話せますか"),
  // מסעדה
  p("מסעדה", "שולחן לשניים", "Futari onegaishimasu", "二人おねがいします"),
  p("מסעדה", "התפריט בבקשה", "Menyu onegaishimasu", "メニューおねがいします"),
  p("מסעדה", "זה טעים", "Oishii desu", "おいしいです"),
  p("מסעדה", "החשבון בבקשה", "Okaikei onegaishimasu", "おかいけいおねがいします"),
  p("מסעדה", "ללא בשר", "Niku nashi de", "肉なしで"),
  p("מסעדה", "ללא גלוטן", "Guruten free", "グルテンフリー"),
  p("מסעדה", "אלרגיה ל...", "...arerugi ga arimasu", "...アレルギーがあります"),
  p("מסעדה", "מים בבקשה", "Omizu onegaishimasu", "おみずおねがいします"),
  // תחבורה
  p("תחבורה", "איפה התחנה?", "Eki wa doko desu ka", "駅はどこですか"),
  p("תחבורה", "כרטיס אחד ל...", "...made ichi-mai", "...まで一枚"),
  p("תחבורה", "עצור כאן", "Koko de tomete kudasai", "ここで止めてください"),
  p("תחבורה", "כמה זה עולה?", "Ikura desu ka", "いくらですか"),
  p("תחבורה", "אבד לי...", "...wo nakushimashita", "...をなくしました"),
  p("תחבורה", "מפה בבקשה", "Chizu onegaishimasu", "地図おねがいします"),
  p("תחבורה", "שדה תעופה", "Kuukou", "空港"),
  p("תחבורה", "רכבת מהירה", "Shinkansen", "新幹線"),
  // קניות
  p("קניות", "כמה זה עולה?", "Kore wa ikura desu ka", "これはいくらですか"),
  p("קניות", "יקר מדי", "Takai desu", "高いです"),
  p("קניות", "יש הנחה?", "Waribiki arimasu ka", "割引ありますか"),
  p("קניות", "אקח את זה", "Kore wo kudasai", "これをください"),
  p("קניות", "יש מידה גדולה?", "Motto ookii saizu arimasu ka", "もっと大きいサイズありますか"),
  p("קניות", "כרטיס אשראי", "Kurejitto kaado", "クレジットカード"),
  p("קניות", "שקית בבקשה", "Fukuro onegaishimasu", "袋おねがいします"),
  // מלון
  p("מלון", "יש לי הזמנה", "Yoyaku shite imasu", "予約しています"),
  p("מלון", "צ׳ק אין", "Chekku in", "チェックイン"),
  p("מלון", "צ׳ק אאוט", "Chekku auto", "チェックアウト"),
  p("מלון", "המפתח שלי", "Watashi no kagi", "私の鍵"),
  p("מלון", "סיסמת WiFi", "Waifai passuwaado", "WiFiパスワード"),
  p("מלון", "יש בעיה בחדר", "Heya ni mondai ga arimasu", "部屋に問題があります"),
  p("מלון", "קומה כמה?", "Nan-kai desu ka", "何階ですか"),
  // חירום
  p("חירום", "עזרה!", "Tasukete!", "助けて！"),
  p("חירום", "קראו לאמבולנס", "Kyuukyuusha wo yonde", "救急車を呼んで"),
  p("חירום", "משטרה", "Keisatsu", "警察"),
  p("חירום", "אני צריך רופא", "Isha ga hitsuyou desu", "医者が必要です"),
  p("חירום", "בית חולים", "Byouin", "病院"),
  p("חירום", "אבד לי הדרכון", "Pasupooto wo nakushimashita", "パスポートをなくしました"),
  p("חירום", "חירום", "Kinkyuu", "緊急"),
];

/* ---------- French ---------- */
const FR: Phrase[] = [
  p("נימוסים", "שלום", "Bonjour", "Bonjour"),
  p("נימוסים", "ערב טוב", "Bonsoir", "Bonsoir"),
  p("נימוסים", "תודה", "Merci", "Merci"),
  p("נימוסים", "בבקשה", "S'il vous plaît", "S'il vous plaît"),
  p("נימוסים", "סליחה", "Excusez-moi", "Excusez-moi"),
  p("נימוסים", "אני לא מבין", "Je ne comprends pas", "Je ne comprends pas"),
  p("נימוסים", "דבר אנגלית?", "Parlez-vous anglais?", "Parlez-vous anglais?"),
  p("מסעדה", "שולחן לשניים", "Une table pour deux", "Une table pour deux"),
  p("מסעדה", "התפריט בבקשה", "La carte s'il vous plaît", "La carte s'il vous plaît"),
  p("מסעדה", "החשבון בבקשה", "L'addition s'il vous plaît", "L'addition s'il vous plaît"),
  p("מסעדה", "זה טעים", "C'est délicieux", "C'est délicieux"),
  p("מסעדה", "מים בבקשה", "De l'eau s'il vous plaît", "De l'eau s'il vous plaît"),
  p("תחבורה", "איפה התחנה?", "Où est la gare?", "Où est la gare?"),
  p("תחבורה", "כרטיס אחד ל...", "Un billet pour...", "Un billet pour..."),
  p("תחבורה", "עצור כאן", "Arrêtez-vous ici", "Arrêtez-vous ici"),
  p("תחבורה", "כמה זה עולה?", "Combien ça coûte?", "Combien ça coûte?"),
  p("תחבורה", "שדה תעופה", "Aéroport", "Aéroport"),
  p("קניות", "כמה זה עולה?", "C'est combien?", "C'est combien?"),
  p("קניות", "יקר מדי", "C'est trop cher", "C'est trop cher"),
  p("קניות", "אקח את זה", "Je le prends", "Je le prends"),
  p("קניות", "כרטיס אשראי", "Carte de crédit", "Carte de crédit"),
  p("קניות", "שקית בבקשה", "Un sac s'il vous plaît", "Un sac s'il vous plaît"),
  p("מלון", "יש לי הזמנה", "J'ai une réservation", "J'ai une réservation"),
  p("מלון", "צ׳ק אין", "Enregistrement", "Enregistrement"),
  p("מלון", "צ׳ק אאוט", "Départ", "Départ"),
  p("מלון", "סיסמת WiFi", "Mot de passe WiFi", "Mot de passe WiFi"),
  p("מלון", "יש בעיה בחדר", "Il y a un problème dans la chambre", "Il y a un problème dans la chambre"),
  p("חירום", "עזרה!", "Au secours!", "Au secours!"),
  p("חירום", "קראו לאמבולנס", "Appelez une ambulance", "Appelez une ambulance"),
  p("חירום", "משטרה", "Police", "Police"),
  p("חירום", "אני צריך רופא", "J'ai besoin d'un médecin", "J'ai besoin d'un médecin"),
  p("חירום", "אבד לי הדרכון", "J'ai perdu mon passeport", "J'ai perdu mon passeport"),
];

/* ---------- Italian ---------- */
const IT: Phrase[] = [
  p("נימוסים", "שלום", "Ciao", "Ciao"),
  p("נימוסים", "בוקר טוב", "Buongiorno", "Buongiorno"),
  p("נימוסים", "ערב טוב", "Buonasera", "Buonasera"),
  p("נימוסים", "תודה", "Grazie", "Grazie"),
  p("נימוסים", "בבקשה", "Per favore", "Per favore"),
  p("נימוסים", "סליחה", "Scusi", "Scusi"),
  p("נימוסים", "דבר אנגלית?", "Parla inglese?", "Parla inglese?"),
  p("מסעדה", "שולחן לשניים", "Un tavolo per due", "Un tavolo per due"),
  p("מסעדה", "התפריט בבקשה", "Il menu per favore", "Il menu per favore"),
  p("מסעדה", "החשבון בבקשה", "Il conto per favore", "Il conto per favore"),
  p("מסעדה", "זה טעים", "È delizioso", "È delizioso"),
  p("מסעדה", "מים בבקשה", "Acqua per favore", "Acqua per favore"),
  p("תחבורה", "איפה התחנה?", "Dov'è la stazione?", "Dov'è la stazione?"),
  p("תחבורה", "כרטיס אחד ל...", "Un biglietto per...", "Un biglietto per..."),
  p("תחבורה", "עצור כאן", "Si fermi qui", "Si fermi qui"),
  p("תחבורה", "כמה זה עולה?", "Quanto costa?", "Quanto costa?"),
  p("תחבורה", "שדה תעופה", "Aeroporto", "Aeroporto"),
  p("קניות", "כמה זה עולה?", "Quanto costa?", "Quanto costa?"),
  p("קניות", "יקר מדי", "Troppo caro", "Troppo caro"),
  p("קניות", "אקח את זה", "Lo prendo", "Lo prendo"),
  p("קניות", "כרטיס אשראי", "Carta di credito", "Carta di credito"),
  p("קניות", "שקית בבקשה", "Una busta per favore", "Una busta per favore"),
  p("מלון", "יש לי הזמנה", "Ho una prenotazione", "Ho una prenotazione"),
  p("מלון", "צ׳ק אין", "Check-in", "Check-in"),
  p("מלון", "צ׳ק אאוט", "Check-out", "Check-out"),
  p("מלון", "סיסמת WiFi", "Password WiFi", "Password WiFi"),
  p("מלון", "יש בעיה בחדר", "C'è un problema in camera", "C'è un problema in camera"),
  p("חירום", "עזרה!", "Aiuto!", "Aiuto!"),
  p("חירום", "קראו לאמבולנס", "Chiamate un'ambulanza", "Chiamate un'ambulanza"),
  p("חירום", "משטרה", "Polizia", "Polizia"),
  p("חירום", "אני צריך רופא", "Ho bisogno di un medico", "Ho bisogno di un medico"),
  p("חירום", "אבד לי הדרכון", "Ho perso il passaporto", "Ho perso il passaporto"),
];

/* ---------- Spanish ---------- */
const ES: Phrase[] = [
  p("נימוסים", "שלום", "Hola", "Hola"),
  p("נימוסים", "בוקר טוב", "Buenos días", "Buenos días"),
  p("נימוסים", "ערב טוב", "Buenas noches", "Buenas noches"),
  p("נימוסים", "תודה", "Gracias", "Gracias"),
  p("נימוסים", "בבקשה", "Por favor", "Por favor"),
  p("נימוסים", "סליחה", "Perdón", "Perdón"),
  p("נימוסים", "דבר אנגלית?", "¿Habla inglés?", "¿Habla inglés?"),
  p("מסעדה", "שולחן לשניים", "Una mesa para dos", "Una mesa para dos"),
  p("מסעדה", "התפריט בבקשה", "La carta por favor", "La carta por favor"),
  p("מסעדה", "החשבון בבקשה", "La cuenta por favor", "La cuenta por favor"),
  p("מסעדה", "זה טעים", "Está delicioso", "Está delicioso"),
  p("מסעדה", "מים בבקשה", "Agua por favor", "Agua por favor"),
  p("תחבורה", "איפה התחנה?", "¿Dónde está la estación?", "¿Dónde está la estación?"),
  p("תחבורה", "כרטיס אחד ל...", "Un billete para...", "Un billete para..."),
  p("תחבורה", "עצור כאן", "Pare aquí", "Pare aquí"),
  p("תחבורה", "כמה זה עולה?", "¿Cuánto cuesta?", "¿Cuánto cuesta?"),
  p("תחבורה", "שדה תעופה", "Aeropuerto", "Aeropuerto"),
  p("קניות", "כמה זה עולה?", "¿Cuánto es?", "¿Cuánto es?"),
  p("קניות", "יקר מדי", "Muy caro", "Muy caro"),
  p("קניות", "אקח את זה", "Me lo llevo", "Me lo llevo"),
  p("קניות", "כרטיס אשראי", "Tarjeta de crédito", "Tarjeta de crédito"),
  p("קניות", "שקית בבקשה", "Una bolsa por favor", "Una bolsa por favor"),
  p("מלון", "יש לי הזמנה", "Tengo una reserva", "Tengo una reserva"),
  p("מלון", "צ׳ק אין", "Registro", "Registro"),
  p("מלון", "צ׳ק אאוט", "Salida", "Salida"),
  p("מלון", "סיסמת WiFi", "Contraseña WiFi", "Contraseña WiFi"),
  p("מלון", "יש בעיה בחדר", "Hay un problema en la habitación", "Hay un problema en la habitación"),
  p("חירום", "עזרה!", "¡Ayuda!", "¡Ayuda!"),
  p("חירום", "קראו לאמבולנס", "Llamen a una ambulancia", "Llamen a una ambulancia"),
  p("חירום", "משטרה", "Policía", "Policía"),
  p("חירום", "אני צריך רופא", "Necesito un médico", "Necesito un médico"),
  p("חירום", "אבד לי הדרכון", "Perdí mi pasaporte", "Perdí mi pasaporte"),
];

/* ---------- Thai ---------- */
const TH: Phrase[] = [
  p("נימוסים", "שלום", "Sawasdee", "สวัสดี"),
  p("נימוסים", "תודה", "Khop khun", "ขอบคุณ"),
  p("נימוסים", "בבקשה", "Karuna", "กรุณา"),
  p("נימוסים", "סליחה", "Kho thot", "ขอโทษ"),
  p("נימוסים", "כן", "Chai", "ใช่"),
  p("נימוסים", "לא", "Mai chai", "ไม่ใช่"),
  p("נימוסים", "דבר אנגלית?", "Phut phasa angkrit dai mai", "พูดภาษาอังกฤษได้ไหม"),
  p("מסעדה", "התפריט בבקשה", "Kho menu noi", "ขอเมนูหน่อย"),
  p("מסעדה", "החשבון בבקשה", "Kep tang duai", "เก็บตังค์ด้วย"),
  p("מסעדה", "זה טעים", "Aroi", "อร่อย"),
  p("מסעדה", "מים בבקשה", "Kho nam noi", "ขอน้ำหน่อย"),
  p("מסעדה", "לא חריף", "Mai phet", "ไม่เผ็ด"),
  p("תחבורה", "איפה התחנה?", "Sathani yu thi nai", "สถานีอยู่ที่ไหน"),
  p("תחבורה", "עצור כאן", "Yut thi ni", "หยุดที่นี่"),
  p("תחבורה", "כמה זה עולה?", "Thao rai", "เท่าไหร่"),
  p("תחבורה", "שדה תעופה", "Sanam bin", "สนามบิน"),
  p("תחבורה", "טוק טוק", "Tuk-tuk", "ตุ๊กตุ๊ก"),
  p("קניות", "כמה זה עולה?", "Ni thao rai", "นี่เท่าไหร่"),
  p("קניות", "יקר מדי", "Phaeng pai", "แพงไป"),
  p("קניות", "הנחה?", "Lot dai mai", "ลดได้ไหม"),
  p("קניות", "אקח את זה", "Ao an ni", "เอาอันนี้"),
  p("קניות", "שקית בבקשה", "Kho thung noi", "ขอถุงหน่อย"),
  p("מלון", "יש לי הזמנה", "Chan chong wai laew", "ฉันจองไว้แล้ว"),
  p("מלון", "צ׳ק אין", "Check-in", "เช็คอิน"),
  p("מלון", "צ׳ק אאוט", "Check-out", "เช็คเอาท์"),
  p("מלון", "סיסמת WiFi", "Rahat WiFi", "รหัส WiFi"),
  p("מלון", "יש בעיה בחדר", "Hong mi panha", "ห้องมีปัญหา"),
  p("חירום", "עזרה!", "Chuai duai", "ช่วยด้วย"),
  p("חירום", "קראו לאמבולנס", "Riak rot phayaban", "เรียกรถพยาบาล"),
  p("חירום", "משטרה", "Tamruat", "ตำรวจ"),
  p("חירום", "אני צריך רופא", "Tong kan mo", "ต้องการหมอ"),
  p("חירום", "בית חולים", "Rong phayaban", "โรงพยาบาล"),
];

/* ---------- Greek ---------- */
const EL: Phrase[] = [
  p("נימוסים", "שלום", "Yassas", "Γειά σας"),
  p("נימוסים", "בוקר טוב", "Kaliméra", "Καλημέρα"),
  p("נימוסים", "ערב טוב", "Kalispéra", "Καλησπέρα"),
  p("נימוסים", "תודה", "Efcharistó", "Ευχαριστώ"),
  p("נימוסים", "בבקשה", "Parakaló", "Παρακαλώ"),
  p("נימוסים", "סליחה", "Signómi", "Συγγνώμη"),
  p("נימוסים", "דבר אנגלית?", "Miláte angliká?", "Μιλάτε αγγλικά;"),
  p("מסעדה", "שולחן לשניים", "Éna trapézi gia dýo", "Ένα τραπέζι για δύο"),
  p("מסעדה", "התפריט בבקשה", "To menoú parakaló", "Το μενού παρακαλώ"),
  p("מסעדה", "החשבון בבקשה", "Ton logariasmó parakaló", "Τον λογαριασμό παρακαλώ"),
  p("מסעדה", "זה טעים", "Íne polý nóstimo", "Είναι πολύ νόστιμο"),
  p("מסעדה", "מים בבקשה", "Neró parakaló", "Νερό παρακαλώ"),
  p("תחבורה", "איפה התחנה?", "Pou íne o stathmós?", "Πού είναι ο σταθμός;"),
  p("תחבורה", "עצור כאן", "Stamatíste edó", "Σταματήστε εδώ"),
  p("תחבורה", "כמה זה עולה?", "Póso kostízi?", "Πόσο κοστίζει;"),
  p("תחבורה", "שדה תעופה", "Aerodrómio", "Αεροδρόμιο"),
  p("תחבורה", "מונית", "Taxí", "Ταξί"),
  p("קניות", "כמה זה עולה?", "Póso káni?", "Πόσο κάνει;"),
  p("קניות", "יקר מדי", "Polý akrivó", "Πολύ ακριβό"),
  p("קניות", "אקח את זה", "Tha to páro", "Θα το πάρω"),
  p("קניות", "כרטיס אשראי", "Pistotikí kárta", "Πιστωτική κάρτα"),
  p("קניות", "שקית בבקשה", "Mia sakoúla parakaló", "Μια σακούλα παρακαλώ"),
  p("מלון", "יש לי הזמנה", "Écho krátisi", "Έχω κράτηση"),
  p("מלון", "צ׳ק אין", "Check-in", "Check-in"),
  p("מלון", "צ׳ק אאוט", "Check-out", "Check-out"),
  p("מלון", "סיסמת WiFi", "Kodikós WiFi", "Κωδικός WiFi"),
  p("מלון", "יש בעיה בחדר", "Ypárchi próvlima sto domátio", "Υπάρχει πρόβλημα στο δωμάτιο"),
  p("חירום", "עזרה!", "Voítheia!", "Βοήθεια!"),
  p("חירום", "קראו לאמבולנס", "Kaléste asthenofóro", "Καλέστε ασθενοφόρο"),
  p("חירום", "משטרה", "Astynomía", "Αστυνομία"),
  p("חירום", "אני צריך רופא", "Chreiázomai giatró", "Χρειάζομαι γιατρό"),
  p("חירום", "אבד לי הדרכון", "Échasa to diavatírió mou", "Έχασα το διαβατήριό μου"),
];

/* ---------- English fallback ---------- */
const EN: Phrase[] = [
  p("נימוסים", "שלום", "Hello", "Hello"),
  p("נימוסים", "תודה", "Thank you", "Thank you"),
  p("נימוסים", "בבקשה", "Please", "Please"),
  p("נימוסים", "סליחה", "Excuse me", "Excuse me"),
  p("נימוסים", "אני לא מבין", "I don't understand", "I don't understand"),
  p("מסעדה", "שולחן לשניים", "Table for two", "Table for two"),
  p("מסעדה", "התפריט בבקשה", "Menu please", "Menu please"),
  p("מסעדה", "החשבון בבקשה", "The bill please", "The bill please"),
  p("מסעדה", "זה טעים", "It's delicious", "It's delicious"),
  p("מסעדה", "מים בבקשה", "Water please", "Water please"),
  p("תחבורה", "איפה התחנה?", "Where is the station?", "Where is the station?"),
  p("תחבורה", "עצור כאן", "Stop here", "Stop here"),
  p("תחבורה", "כמה זה עולה?", "How much?", "How much?"),
  p("תחבורה", "שדה תעופה", "Airport", "Airport"),
  p("תחבורה", "מונית בבקשה", "Taxi please", "Taxi please"),
  p("קניות", "כמה זה עולה?", "How much is this?", "How much is this?"),
  p("קניות", "יקר מדי", "Too expensive", "Too expensive"),
  p("קניות", "אקח את זה", "I'll take it", "I'll take it"),
  p("קניות", "כרטיס אשראי", "Credit card", "Credit card"),
  p("קניות", "שקית בבקשה", "Bag please", "Bag please"),
  p("מלון", "יש לי הזמנה", "I have a reservation", "I have a reservation"),
  p("מלון", "צ׳ק אין", "Check in", "Check in"),
  p("מלון", "צ׳ק אאוט", "Check out", "Check out"),
  p("מלון", "סיסמת WiFi", "WiFi password", "WiFi password"),
  p("מלון", "יש בעיה בחדר", "Problem with room", "Problem with room"),
  p("חירום", "עזרה!", "Help!", "Help!"),
  p("חירום", "קראו לאמבולנס", "Call an ambulance", "Call an ambulance"),
  p("חירום", "משטרה", "Police", "Police"),
  p("חירום", "אני צריך רופא", "I need a doctor", "I need a doctor"),
  p("חירום", "אבד לי הדרכון", "I lost my passport", "I lost my passport"),
];

export const PHRASES: Record<LangCode, Phrase[]> = {
  ja: JA,
  fr: FR,
  it: IT,
  es: ES,
  th: TH,
  el: EL,
  en: EN,
};
