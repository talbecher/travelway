import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, QrCode, Paperclip, ExternalLink, Loader2, Upload, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "react-barcode";
import { toast } from "sonner";
import { assertOnline } from "@/hooks/use-online";
import { useActiveTripId } from "@/hooks/use-active-trip";
import {
  useDocuments,
  useAddDocument,
  useUpdateDocument,
  useDeleteDocument,
  DOC_TYPE_META,
  type TripDocument,
  type DocumentType,
  type BarcodeType,
  type DocumentInput,
} from "@/hooks/use-documents";
import { BottomSheet } from "@/components/BottomSheet";
import { DateField } from "@/components/DateField";
import { supabase } from "@/integrations/supabase/client";
import { hebDate, ils } from "@/lib/format";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "מסמכים · TravelWay" },
      { name: "description", content: "כרטיסים, אישורי הזמנה, ברקודים ומסמכי טיסה במקום אחד" },
    ],
  }),
  component: DocumentsPage,
});

const FILTER_TYPES: Array<DocumentType | "all"> = [
  "all",
  "flight",
  "hotel",
  "attraction",
  "insurance",
  "visa",
  "transport",
  "other",
];

function DocumentsPage() {
  const tripId = useActiveTripId();
  const { data: docs = [], isLoading } = useDocuments(tripId);
  const [filter, setFilter] = useState<DocumentType | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TripDocument | null>(null);
  const [barcodeDoc, setBarcodeDoc] = useState<TripDocument | null>(null);
  const deleteDoc = useDeleteDocument(tripId);

  const filtered = useMemo(
    () => (filter === "all" ? docs : docs.filter((d) => d.type === filter)),
    [docs, filter],
  );

  return (
    <div className="pt-4 pb-8 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">מסמכים</h1>
          <p className="text-sm text-muted-foreground mt-0.5">כרטיסים, אישורים והזמנות</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="shrink-0 h-10 px-3 rounded-lg bg-[color:var(--terracotta)] text-white text-sm font-medium inline-flex items-center gap-1.5"
        >
          <Plus size={16} /> הוסף מסמך
        </button>
      </header>

      <div className="-mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {FILTER_TYPES.map((t) => {
            const active = filter === t;
            const label = t === "all" ? "הכל" : `${DOC_TYPE_META[t].emoji} ${DOC_TYPE_META[t].label}`;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-[color:var(--accent)] text-white border-[color:var(--accent)]"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">טוען מסמכים...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <div className="text-5xl">📄</div>
          <div className="text-sm text-muted-foreground">
            {docs.length === 0 ? "אין מסמכים עדיין" : "אין מסמכים בקטגוריה הזו"}
          </div>
          {docs.length === 0 && (
            <button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 text-sm text-[color:var(--accent)]"
            >
              <Plus size={16} /> הוסף מסמך ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
            >
              <DocumentCard
                doc={d}
                onShowBarcode={() => setBarcodeDoc(d)}
                onEdit={() => {
                  setEditing(d);
                  setFormOpen(true);
                }}
                onDelete={() => {
                  if (window.confirm(`למחוק את "${d.title}"?`)) deleteDoc.mutate(d.id);
                }}
              />
            </motion.div>
          ))}
        </div>
      )}

      <DocumentFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        tripId={tripId}
      />
      <BarcodeSheet doc={barcodeDoc} onClose={() => setBarcodeDoc(null)} />
    </div>
  );
}

/* ---------- card ---------- */

function DocumentCard({
  doc,
  onShowBarcode,
  onEdit,
  onDelete,
}: {
  doc: TripDocument;
  onShowBarcode: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const paidBadge = doc.is_paid ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-medium">
      ✓ שולם{doc.amount_ils ? ` · ${ils(Number(doc.amount_ils))}` : ""}
    </span>
  ) : (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-medium">
      ממתין לתשלום{doc.amount_ils ? ` · ${ils(Number(doc.amount_ils))}` : ""}
    </span>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {doc.barcode_value && (
        <button
          onClick={onShowBarcode}
          className="h-10 px-4 rounded-full bg-[color:var(--terracotta)] text-white text-sm font-medium inline-flex items-center gap-1.5"
        >
          <QrCode size={16} /> הצג ברקוד
        </button>
      )}
      {doc.file_url && (
        <a
          href={doc.file_url}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-4 rounded-full border border-border text-sm font-medium inline-flex items-center gap-1.5"
        >
          <Paperclip size={15} /> קובץ
        </a>
      )}
      <button
        onClick={onEdit}
        className="h-9 px-4 ms-auto rounded-full border border-border text-sm font-medium inline-flex items-center"
      >
        ערוך
      </button>
      <button
        onClick={onDelete}
        className="h-9 w-9 rounded-full border border-border text-[color:var(--accent-2)] inline-flex items-center justify-center"
        aria-label="מחק"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  if (doc.type === "flight") {
    const parsed = parseSegments(doc.title);
    const codes = parsed?.codes ?? [];
    const stops = codes.length >= 3 ? codes.length - 2 : 0;
    return (
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-[color:var(--accent)]/10 to-transparent">
          <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
            <span className="text-lg">✈️</span>
            <span className="truncate">{parsed ? parsed.airline || "טיסה" : doc.title}</span>
            {stops > 0 && (
              <span className="ms-auto text-[10px] rounded-full px-2 py-0.5 bg-[color:var(--accent)]/15 text-[color:var(--accent)] font-medium">
                קונקשן · {stops} {stops === 1 ? "עצירה" : "עצירות"}
              </span>
            )}
          </div>
          {codes.length >= 2 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap" dir="ltr">
              {codes.map((code, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-lg font-bold tabular-nums leading-none">{code}</span>
                  {i < codes.length - 1 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <span className="w-3 border-t border-dashed border-border" />
                      <span className="text-sm">✈</span>
                      <span className="w-3 border-t border-dashed border-border" />
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-dashed border-border" />
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            {doc.valid_date ? (
              <span className="text-muted-foreground">📅 {hebDate(doc.valid_date)}</span>
            ) : (
              <span />
            )}
            {paidBadge}
          </div>
          {doc.notes && <div className="text-xs text-muted-foreground line-clamp-2">{doc.notes}</div>}
          {actions}
        </div>
      </section>
    );
  }


  if (doc.type === "hotel") {
    return (
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-[color:var(--terracotta)]/10 to-transparent">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-lg">🏨</span>
            <span className="truncate">{doc.title}</span>
          </div>
          {doc.valid_date && (
            <div className="text-xs text-muted-foreground mt-1">צ'ק-אין: {hebDate(doc.valid_date)}</div>
          )}
        </div>
        <div className="border-t border-dashed border-border" />
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            {doc.notes ? (
              <span className="text-muted-foreground truncate max-w-[60%]">{doc.notes}</span>
            ) : (
              <span />
            )}
            {paidBadge}
          </div>
          {actions}
        </div>
      </section>
    );
  }

  const meta = DOC_TYPE_META[doc.type];
  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-lg">{meta.emoji}</span>
        <span className="truncate">{doc.title}</span>
      </div>
      {doc.notes && <div className="text-xs text-muted-foreground line-clamp-2">{doc.notes}</div>}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        {doc.valid_date ? (
          <span className="text-muted-foreground">📅 {hebDate(doc.valid_date)}</span>
        ) : (
          <span />
        )}
        {paidBadge}
      </div>
      {actions}
    </section>
  );
}

function parseSegments(title: string): { codes: string[]; airline: string } | null {
  const codes = title.match(/\b[A-Z]{3}\b/g) ?? [];
  if (codes.length < 2) return null;
  // Remove all matched codes and common separators to derive airline label
  let airline = title;
  for (const c of codes) airline = airline.replace(c, "");
  airline = airline.replace(/[→\->—·|,]/g, " ").replace(/\s+/g, " ").trim();
  return { codes, airline };
}


/* ---------- barcode sheet ---------- */

function BarcodeSheet({ doc, onClose }: { doc: TripDocument | null; onClose: () => void }) {
  return (
    <BottomSheet open={!!doc} onOpenChange={(o) => !o && onClose()} title={doc?.title}>
      {doc && (
        <div className="flex flex-col items-center gap-4 py-4 bg-white rounded-xl px-4">
          <div className="text-sm font-medium text-neutral-900 text-center">{doc.title}</div>
          <div className="p-4 bg-white rounded-lg">
            {doc.barcode_value ? (
              doc.barcode_type === "barcode128" ? (
                <Barcode value={doc.barcode_value} format="CODE128" height={90} displayValue />
              ) : (
                <QRCodeSVG value={doc.barcode_value} size={260} level="M" />
              )
            ) : (
              <div className="text-sm text-neutral-500">אין ערך ברקוד</div>
            )}
          </div>
          <div className="text-xs text-neutral-500 text-center">💡 הגברת בהירות מסך מלאה לסריקה טובה יותר</div>
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------- form sheet ---------- */

const BUCKET = "rec-photos";
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const MAX_BYTES = 10 * 1024 * 1024;

function DocumentFormSheet({
  open,
  onOpenChange,
  editing,
  tripId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: TripDocument | null;
  tripId: string | undefined;
}) {
  const add = useAddDocument(tripId);
  const update = useUpdateDocument(tripId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [type, setType] = useState<DocumentType>(editing?.type ?? "flight");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [validDate, setValidDate] = useState(editing?.valid_date ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [barcodeValue, setBarcodeValue] = useState(editing?.barcode_value ?? "");
  const [barcodeType, setBarcodeType] = useState<BarcodeType>(editing?.barcode_type ?? "qr");
  const [fileUrl, setFileUrl] = useState<string | null>(editing?.file_url ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>(editing?.amount_ils != null ? String(editing.amount_ils) : "");
  const [isPaid, setIsPaid] = useState(editing?.is_paid ?? false);

  // Reset when editing target changes / sheet reopens
  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? "flight");
    setTitle(editing?.title ?? "");
    setValidDate(editing?.valid_date ?? "");
    setNotes(editing?.notes ?? "");
    setBarcodeValue(editing?.barcode_value ?? "");
    setBarcodeType(editing?.barcode_type ?? "qr");
    setFileUrl(editing?.file_url ?? null);
    setFileName(null);
    setAmount(editing?.amount_ils != null ? String(editing.amount_ils) : "");
    setIsPaid(editing?.is_paid ?? false);
  }, [open, editing?.id]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("קובץ גדול מדי (מקסימום 10MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `documents/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, TEN_YEARS);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Failed to sign URL");
      setFileUrl(signed.signedUrl);
      setFileName(file.name);
      toast.success("✅ הקובץ הועלה");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("יש להזין כותרת");
      return;
    }
    const payload: DocumentInput = {
      title: title.trim(),
      type,
      valid_date: validDate || null,
      notes: notes.trim() || null,
      barcode_value: barcodeValue.trim() || null,
      barcode_type: barcodeValue.trim() ? barcodeType : null,
      file_url: fileUrl,
      amount_ils: amount ? Number(amount) : null,
      is_paid: isPaid,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload, prevIsPaid: editing.is_paid });
      } else {
        await add.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {
      /* toast already shown */
    }
  }

  const busy = add.isPending || update.isPending || uploading;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={editing ? "עריכת מסמך" : "מסמך חדש"}>
      <div className="flex flex-col gap-4 pb-24">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">סוג מסמך</label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DOC_TYPE_META) as DocumentType[]).map((t) => {
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`h-8 px-2.5 rounded-lg text-xs border transition-colors ${
                    active
                      ? "bg-[color:var(--accent)] text-white border-[color:var(--accent)]"
                      : "bg-background text-foreground border-input"
                  }`}
                >
                  {DOC_TYPE_META[t].emoji} {DOC_TYPE_META[t].label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="כותרת">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="טיסה TLV→NRT, Hotel RIO Shinjuku..."
            className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
          />
          {type === "flight" && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              לטיסת קונקשן: כתוב את כל היעדים ברצף, למשל TLV→DXB→NRT
            </div>
          )}
        </Field>


        <Field label="תאריך (אופציונלי)">
          <DateField value={validDate} onChange={setValidDate} />
        </Field>

        <Field label="הערות (מספר טיסה, קוד אישור...)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">ברקוד / QR (אופציונלי)</label>
            <div className="flex bg-muted rounded-md p-0.5">
              <button
                onClick={() => setBarcodeType("qr")}
                className={`px-2 h-6 text-[11px] rounded ${barcodeType === "qr" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                QR
              </button>
              <button
                onClick={() => setBarcodeType("barcode128")}
                className={`px-2 h-6 text-[11px] rounded ${barcodeType === "barcode128" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                ברקוד
              </button>
            </div>
          </div>
          <input
            value={barcodeValue}
            onChange={(e) => setBarcodeValue(e.target.value)}
            placeholder="הכנס ערך לברקוד..."
            dir="ltr"
            className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>

        <Field label="קובץ מצורף (PDF/תמונה, עד 10MB)">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onFile}
          />
          {fileUrl ? (
            <div className="flex items-center gap-2">
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 h-11 rounded-lg border border-input bg-background px-3 text-sm inline-flex items-center gap-1.5 truncate"
              >
                <Paperclip size={14} />
                <span className="truncate">{fileName ?? "קובץ מצורף"}</span>
                <ExternalLink size={12} className="mr-auto shrink-0" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setFileUrl(null);
                  setFileName(null);
                }}
                className="h-11 w-11 rounded-lg border border-input inline-flex items-center justify-center text-[color:var(--accent-2)]"
                aria-label="הסר קובץ"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="w-full h-11 rounded-lg border border-dashed border-input bg-background text-sm inline-flex items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
            >
              {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              העלה קובץ
            </button>
          )}
        </Field>

        <Field label="סכום ששולם ב-₪ (אופציונלי)">
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
          />
        </Field>

        <label className="flex items-center justify-between gap-3 h-11 rounded-lg border border-input bg-background px-3">
          <span className="text-sm">שולם?</span>
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
            className="w-11 h-6 accent-[color:var(--accent)]"
          />
        </label>
      </div>

      <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-4 bg-card border-t border-border">
        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full h-12 rounded-lg bg-[color:var(--terracotta)] text-white font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="animate-spin" size={16} />}
          {editing ? "שמור שינויים" : "הוסף מסמך"}
        </button>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
