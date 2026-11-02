import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DOC_TYPE_META, type DocumentType } from "@/hooks/use-documents";
import { copyDocumentUpload, markDocumentUploadStaged } from "@/lib/document-files.functions";

export const Route = createFileRoute("/document-proposals/$id")({
  head: () => ({
    meta: [
      { title: "הצעת מסמך · TravelWay" },
      { name: "description", content: "בדיקה ואישור של מסמך שהציע הצ׳אט" },
      { property: "og:title", content: "הצעת מסמך · TravelWay" },
      { property: "og:description", content: "בדיקה ואישור של מסמך שהציע הצ׳אט" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type DocFields = {
  title?: string; type?: DocumentType; valid_date?: string | null; notes?: string | null;
  external_url?: string | null; linked_recommendation_id?: string | null;
};
type Current = DocFields & { id: string; has_file: boolean; file_mime: string | null };
type Upload = { id: string; status: string; mime: string | null; size: number | null; file_name: string | null };
type View = {
  id: string; trip_id: string;
  state: "pending" | "applied" | "rejected" | "expired" | "token_revoked";
  result: { document_id?: string; mode?: string; file_attached?: boolean } | null;
  note: string | null; fields: DocFields; wants_file: boolean;
  target_document_id: string | null; target_missing: boolean; current: Current | null; conflict: boolean;
  recommendation: { id: string; name: string } | null; recommendation_missing: boolean;
  upload: Upload | null; expires_at: string; created_at: string; seen_hash: string;
};

const STATE: Record<View["state"], string> = {
  pending: "ממתינה לאישור", applied: "הוחלה", rejected: "נדחתה", expired: "פג תוקף", token_revoked: "הטוקן שהגיש בוטל",
};
const fmtDate = (d?: string | null) => (d ? d.split("-").reverse().join(".") : "ללא");
const typeLabel = (t?: string) => (t ? DOC_TYPE_META[t as DocumentType]?.label ?? t : "—");
const fmtSize = (n?: number | null) => (n ? `${(n / 1024 / 1024).toFixed(1)}MB` : "");

const ACCEPTED: Record<string, string> = {
  "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP",
};

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function Page() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const key = ["document-proposal", id];
  const q = useQuery({
    queryKey: key, enabled: !!user, retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_document_proposal_view", { _id: id });
      if (error) throw error;
      return data as unknown as View;
    },
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function attachFile(file: File) {
    const v = q.data;
    if (!v || busy) return;
    if (!ACCEPTED[file.type]) { toast.error("סוג קובץ לא נתמך. אפשר PDF או תמונה."); return; }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) { toast.error("הקובץ גדול מדי (עד 10MB)."); return; }
    setBusy(true);
    try {
      const { data: res, error } = await supabase.rpc("reserve_document_upload", {
        _proposal_id: v.id, _size: file.size, _mime: file.type,
      });
      if (error) throw error;
      const r = res as { status: string; upload_id?: string };
      if (r.status !== "ok" || !r.upload_id) {
        toast.error(r.status === "too_large" ? "הקובץ גדול מדי." : r.status === "quota_exceeded" ? "יש יותר מדי העלאות ממתינות." : "לא ניתן לצרף קובץ כעת.");
        return;
      }
      const path = `staging/${v.trip_id}/${v.id}/${r.upload_id}`;
      const { error: upErr } = await supabase.storage.from("trip-files").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      await markDocumentUploadStaged({ data: { uploadId: r.upload_id, size: file.size, mime: file.type as never, sha256: await sha256Hex(file), name: file.name } });
      toast.success("הקובץ צורף ומוכן לאישור");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "צירוף הקובץ נכשל");
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  async function approve() {
    const v = q.data;
    if (!v || busy) return;
    setBusy(true);
    try {
      const { data: claim, error: cErr } = await supabase.rpc("claim_document_apply", { _id: v.id, _seen_hash: v.seen_hash });
      if (cErr) throw cErr;
      const c = claim as { status: string; has_file?: boolean; upload_id?: string; copied?: boolean };
      if (c.status !== "ok" && c.status !== "already_applied") {
        const msg: Record<string, string> = {
          conflict: "המסמך השתנה מאז ההצעה. בקשו מהצ׳אט הצעה חדשה.",
          stale_view: "ההצעה עודכנה. בדקו שוב.", expired: "תוקף ההצעה פג.",
          token_revoked: "הטוקן שהגיש את ההצעה בוטל.", file_required: "צרף קובץ לפני האישור.",
          file_expired: "תוקף הקובץ שצורף פג. צרפו שוב.",
        };
        toast.error(msg[c.status] ?? "הפעולה לא הושלמה");
        return;
      }
      if (c.has_file && !c.copied && c.upload_id) {
        await copyDocumentUpload({ data: { proposalId: v.id, uploadId: c.upload_id } });
      }
      const { data: fin, error: fErr } = await supabase.rpc("finalize_document_proposal", { _id: v.id, _seen_hash: v.seen_hash });
      if (fErr) throw fErr;
      const st = (fin as { status?: string })?.status ?? "";
      if (st === "done" || st === "already_applied") {
        toast.success("המסמך נשמר");
        await qc.invalidateQueries({ queryKey: ["documents"] });
      } else {
        toast.error(st === "file_not_ready" ? "הקובץ עוד לא מוכן. נסו שוב." : "הפעולה לא הושלמה");
      }
    } catch {
      toast.error("לא התקבלה תשובה. בודק את המצב העדכני…");
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  async function reject() {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("reject_document_proposal", { _id: id });
      if (error) throw error;
      toast.success("ההצעה נדחתה");
    } catch {
      toast.error("הדחייה נכשלה");
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: key });
    }
  }

  if (!user) return <p className="p-6 text-center text-muted-foreground" dir="rtl">{loading ? "טוען…" : "יש להתחבר כדי לראות את ההצעה."}</p>;
  if (q.isLoading) return <p className="p-6 text-center text-muted-foreground" dir="rtl">טוען…</p>;
  if (q.isError || !q.data) return <p className="p-6 text-center text-muted-foreground" dir="rtl">ההצעה לא נמצאה או שאין לכם גישה אליה.</p>;

  const v = q.data;
  const pending = v.state === "pending";
  const isAdd = !v.target_document_id;
  const fileReady = !!v.upload && v.upload.status === "staged";
  const needsFile = v.wants_file && !fileReady;
  const blocked = v.conflict || v.target_missing || v.recommendation_missing;
  const canApply = pending && !blocked && !needsFile;

  const LABEL: Record<string, string> = {
    title: "כותרת", type: "סוג", valid_date: "תאריך", notes: "הערות", external_url: "קישור", linked_recommendation_id: "המלצה מקושרת",
  };
  const showField = (k: string, val: unknown) =>
    k === "type" ? typeLabel(val as string) : k === "valid_date" ? fmtDate(val as string | null)
    : k === "linked_recommendation_id" ? (v.recommendation?.name ?? (val ? "המלצה" : "—")) : (val as string) || "—";
  const changedKeys = Object.keys(v.fields).filter((k) => (v.fields as Record<string, unknown>)[k] !== undefined);

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-48" dir="rtl">
      <header className="space-y-2">
        <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold">{STATE[v.state]}</span>
        <h1 className="text-2xl font-bold">{isAdd ? "הצעה להוספת מסמך" : "הצעה לעדכון מסמך"}</h1>
        <p className="text-sm text-muted-foreground">הצ׳אט הציע {isAdd ? "מסמך חדש" : "עדכון למסמך קיים"}. שום דבר לא משתנה עד שתאשרו.</p>
      </header>

      {v.state === "applied" && (
        <div className="flex items-start gap-3 rounded-2xl bg-cat-booked p-4 text-sm text-cat-booked-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p>המסמך {v.result?.mode === "replaced" ? "עודכן" : "נוסף"}. <Link to="/documents" className="font-semibold underline">למסמכים</Link></p>
        </div>
      )}

      {pending && blocked && (
        <p className="flex items-start gap-2 rounded-2xl border border-destructive bg-card p-4 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          {v.conflict ? "המסמך השתנה מאז שההצעה נשמרה, ולכן אי אפשר להחיל אותה. בקשו מהצ׳אט הצעה חדשה."
            : v.target_missing ? "המסמך שאליו כיוונה ההצעה נמחק. בקשו מהצ׳אט הצעה חדשה."
            : "ההמלצה המקושרת לא נמצאה בטיול. בקשו מהצ׳אט הצעה חדשה."}
        </p>
      )}

      {v.note && <p dir="auto" className="whitespace-pre-wrap rounded-2xl bg-muted p-4 text-start text-sm">{v.note}</p>}

      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {isAdd ? <><Plus className="size-4" />מסמך חדש</> : <><Pencil className="size-4" />עדכון למסמך: {v.current?.title ?? "—"}</>}
        </p>
        {isAdd ? (
          <>
            <p dir="auto" className="text-start font-semibold">{v.fields.title}</p>
            <p className="text-xs text-muted-foreground">{typeLabel(v.fields.type)} · תאריך {fmtDate(v.fields.valid_date)}</p>
            {v.fields.notes && <p dir="auto" className="mt-1 text-start text-xs text-muted-foreground">{v.fields.notes}</p>}
            {v.fields.external_url && <p dir="ltr" className="mt-1 break-all text-start text-xs text-muted-foreground">{v.fields.external_url}</p>}
            {v.recommendation && <p className="mt-1 text-xs text-muted-foreground">מקושר להמלצה: {v.recommendation.name}</p>}
          </>
        ) : (
          <dl className="space-y-0.5 text-xs">
            {changedKeys.map((k) => (
              <div key={k} className="flex flex-wrap gap-1">
                <dt className="text-muted-foreground">{LABEL[k] ?? k}:</dt>
                <dd>
                  <span className="text-muted-foreground line-through">{v.current ? showField(k, (v.current as Record<string, unknown>)[k]) : "—"}</span>
                  {" ← "}<span className="font-semibold">{showField(k, (v.fields as Record<string, unknown>)[k])}</span>
                </dd>
              </div>
            ))}
            {v.wants_file && (
              <div className="flex flex-wrap gap-1">
                <dt className="text-muted-foreground">קובץ:</dt>
                <dd>
                  <span className="text-muted-foreground">{v.current?.has_file ? "קובץ קיים (יישמר כגרסה קודמת)" : "אין קובץ"}</span>
                  {" ← "}<span className="font-semibold">קובץ חדש</span>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {v.wants_file && pending && (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="mb-2 font-semibold">קובץ מצורף</p>
          {fileReady ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-cat-booked-foreground" />
              <span dir="auto">{v.upload!.file_name ?? "קובץ"}</span> · {ACCEPTED[v.upload!.mime ?? ""] ?? v.upload!.mime} · {fmtSize(v.upload!.size)}
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">הצ׳אט לא שולח קבצים. צרפו כאן PDF או תמונה (עד 10MB) לפני האישור.</p>
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ""; }} />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-60">
                <FileUp className="size-4" /> {busy ? "מצרף…" : "צרף קובץ"}
              </button>
            </>
          )}
        </section>
      )}

      {pending && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-xl space-y-1 p-3">
            {needsFile && !blocked && <p className="text-xs text-muted-foreground">צרפו את הקובץ למעלה לפני האישור.</p>}
            <button type="button" disabled={busy || !canApply} onClick={approve}
              className="h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? "שומר…" : isAdd ? "אשר והוסף את המסמך" : "אשר ועדכן את המסמך"}
            </button>
            <button type="button" disabled={busy} onClick={reject}
              className="h-11 w-full text-sm font-medium text-muted-foreground disabled:opacity-60">דחה את ההצעה</button>
          </div>
        </div>
      )}
    </div>
  );
}
