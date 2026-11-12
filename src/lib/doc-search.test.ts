// @ts-nocheck -- run with `bun test`; bun:test types are not installed
import { describe, expect, test } from "bun:test";
import { docMatchesQuery, fileBasename, matchesQuery, normalizeText } from "./doc-search";

const doc = (o = {}) => ({ title: null, notes: null, file_path: null, file_url: null, ...o });

describe("normalizeText", () => {
  test("lowercases, trims and collapses whitespace", () => {
    expect(normalizeText("  Hello   World  ")).toBe("hello world");
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
  test("folds final Hebrew letters to their base form", () => {
    expect(normalizeText("מסמך")).toBe(normalizeText("מסמכ"));
    expect(normalizeText("יפן")).toBe(normalizeText("יפנ"));
    expect(normalizeText("ךםןףץ")).toBe("כמנפצ");
  });
  test("drops Hebrew niqqud and Latin accents", () => {
    expect(normalizeText("שָׁלוֹם")).toBe(normalizeText("שלום"));
    expect(normalizeText("Café")).toBe("cafe");
  });
  test("treats both hyphen kinds as word separators, without gluing the words", () => {
    expect(normalizeText("תל־אביב")).toBe("תל אביב");
    expect(normalizeText("תל-אביב")).toBe("תל אביב");
    expect(normalizeText("Hotel-Confirmation")).toBe("hotel confirmation");
  });
});

describe("docMatchesQuery", () => {
  test("Hebrew: every word must match, across different fields, in any order", () => {
    const d = doc({ title: "ביטוח נסיעות", notes: "כיסוי ליפן" });
    expect(docMatchesQuery(d, "יפן ביטוח")).toBe(true);
    expect(docMatchesQuery(d, "ביטוח יפן")).toBe(true);
    expect(docMatchesQuery(d, "ביטוח")).toBe(true);
    expect(docMatchesQuery(d, "יפן תאילנד")).toBe(false);
  });

  test("Hebrew normalization reaches the fields", () => {
    expect(docMatchesQuery(doc({ title: "מסמכים חשובים" }), "מסמך")).toBe(true);
    expect(docMatchesQuery(doc({ notes: "טיסה לְיָפָן" }), "יפן")).toBe(true);
  });

  test("English partial match, case-insensitive", () => {
    const d = doc({ title: "PassportCard" });
    expect(docMatchesQuery(d, "pass")).toBe(true);
    expect(docMatchesQuery(d, "CARD")).toBe(true);
    expect(docMatchesQuery(d, "PASSPORTcard")).toBe(true);
    expect(docMatchesQuery(d, "visa")).toBe(false);
  });

  test("empty and whitespace-only queries match everything", () => {
    const d = doc({ title: "ביטוח" });
    expect(docMatchesQuery(d, "")).toBe(true);
    expect(docMatchesQuery(d, "   ")).toBe(true);
    expect(docMatchesQuery(doc(), "")).toBe(true);
  });

  test("stray whitespace in the query is ignored", () => {
    const d = doc({ title: "ביטוח נסיעות", notes: "יפן" });
    expect(docMatchesQuery(d, "  ביטוח  ")).toBe(true);
    expect(docMatchesQuery(d, "יפן    ביטוח")).toBe(true);
  });

  test("null fields never throw and never match", () => {
    expect(docMatchesQuery(doc(), "null")).toBe(false);
    expect(docMatchesQuery(doc(), "undefined")).toBe(false);
    expect(docMatchesQuery(doc({ title: "ביטוח" }), "ביטוח")).toBe(true);
  });

  test("a hyphen matches a space in both directions", () => {
    const spaced = doc({ title: "מלון תל אביב" });
    const maqaf = doc({ title: "מלון תל־אביב" });
    const hyphen = doc({ title: "מלון תל-אביב" });
    for (const q of ["תל אביב", "תל־אביב", "תל-אביב"]) {
      expect(docMatchesQuery(spaced, q)).toBe(true);
      expect(docMatchesQuery(maqaf, q)).toBe(true);
      expect(docMatchesQuery(hyphen, q)).toBe(true);
    }
    expect(docMatchesQuery(maqaf, "תל ירושלים")).toBe(false);
  });

  test("words do not bleed across field boundaries", () => {
    const d = doc({ title: "ביטוח", notes: "יפן" });
    expect(docMatchesQuery(d, "ביטוחיפן")).toBe(false);
  });

  test("type label and synonyms arrive through extraTerms", () => {
    const d = doc({ title: "AIG" });
    expect(docMatchesQuery(d, "ביטוח", "ביטוח insurance")).toBe(true);
    expect(docMatchesQuery(d, "insurance", "ביטוח insurance")).toBe(true);
    expect(docMatchesQuery(d, "ביטוח")).toBe(false);
    expect(docMatchesQuery(d, "ביטוח AIG", "ביטוח insurance")).toBe(true);
  });

  // The page passes `${DOC_TYPE_META[type].label} ${TYPE_TERMS[type]}` as extraTerms.
  // "רכבת" is deliberately NOT a transport synonym, so the category alone must not match it.
  test("a specific vehicle word matches only documents that actually say it", () => {
    const transportTerms = "תחבורה תחבורה transport";
    const train = doc({ title: "כרטיס רכבת שינקנסן" });
    const trainInNotes = doc({ title: "JR Pass", notes: "כולל נסיעות רכבת" });
    const bus = doc({ title: "כרטיס אוטובוס לשדה התעופה" });
    expect(docMatchesQuery(train, "רכבת", transportTerms)).toBe(true);
    expect(docMatchesQuery(trainInNotes, "רכבת", transportTerms)).toBe(true);
    expect(docMatchesQuery(bus, "רכבת", transportTerms)).toBe(false);
    // The category word itself still finds every transport document.
    expect(docMatchesQuery(bus, "תחבורה", transportTerms)).toBe(true);
  });

  test("the attached file name is searchable, but opaque storage ids are not", () => {
    expect(docMatchesQuery(doc({ file_path: "trips/abc/Hotel-Confirmation.pdf" }), "hotel")).toBe(
      true,
    );
    expect(docMatchesQuery(doc({ file_path: "trips/abc/9f8e7d6c5b4a39281706.pdf" }), "9f8e")).toBe(
      false,
    );
  });
});

describe("matchesQuery", () => {
  test("filters out empty fields before joining", () => {
    expect(matchesQuery([null, "ביטוח", undefined, ""], "ביטוח")).toBe(true);
    expect(matchesQuery([], "ביטוח")).toBe(false);
    expect(matchesQuery([], "")).toBe(true);
  });
});

describe("fileBasename", () => {
  test("returns the readable base name of a path", () => {
    expect(fileBasename("trips/abc/Hotel-Confirmation.pdf", null)).toBe("Hotel-Confirmation.pdf");
  });
  test("strips a query string and decodes percent-encoding", () => {
    expect(fileBasename(null, "https://x.co/storage/My%20Ticket.pdf?token=abc")).toBe(
      "My Ticket.pdf",
    );
  });
  test("prefers file_path over file_url", () => {
    expect(fileBasename("a/Path.pdf", "https://x.co/Url.pdf")).toBe("Path.pdf");
  });
  test("returns null for opaque storage ids and for no file", () => {
    expect(fileBasename("trips/abc/9f8e7d6c5b4a39281706.pdf", null)).toBeNull();
    expect(fileBasename(null, null)).toBeNull();
    expect(fileBasename(undefined, undefined)).toBeNull();
    expect(fileBasename("", "")).toBeNull();
  });
  test("malformed percent-encoding falls back to the raw name", () => {
    expect(fileBasename("trips/abc/bad%zz.pdf", null)).toBe("bad%zz.pdf");
  });
});
