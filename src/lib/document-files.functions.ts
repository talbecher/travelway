// Authenticated server functions for private document files (bucket "trip-files").
// Staging uploads are verified against their reservation (real bytes, magic signature, sha256);
// final copies and short-lived view URLs are created only after a live access check.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "trip-files";
const MAX_FILE = 10 * 1024 * 1024;

const MAGIC: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP (checked with bytes 8-11 below)
};

function matchesMagic(bytes: Uint8Array, mime: string): boolean {
  const sigs = MAGIC[mime];
  if (!sigs) return false;
  const head = sigs.some((sig) => sig.every((b, i) => bytes[i] === b));
  if (mime === "image/webp") {
    return head && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP
  }
  return head;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verifies a staged upload against its reservation and marks it staged. Uploader only. */
export const markDocumentUploadStaged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      uploadId: z.string().uuid(),
      size: z.number().int().min(1).max(MAX_FILE),
      mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      name: z.string().trim().min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res } = await supabaseAdmin.rpc("server_upload_for_user", {
      _upload_id: data.uploadId,
      _user: context.userId,
    });
    const r = res as { staged_path?: string; declared_size?: number; declared_mime?: string } | null;
    if (!r?.staged_path) throw new Error("ההעלאה לא נמצאה או שפג תוקפה");

    const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(BUCKET).download(r.staged_path);
    if (dlErr || !blob) throw new Error("הקובץ לא נמצא באחסון");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length < 1 || bytes.length > MAX_FILE) throw new Error("גודל הקובץ חורג מהמגבלה");
    if (bytes.length !== data.size) throw new Error("גודל הקובץ לא תואם את ההצהרה");
    if (!matchesMagic(bytes, data.mime)) throw new Error("תוכן הקובץ לא תואם את סוג הקובץ");
    const sha = await sha256Hex(bytes);
    if (sha !== data.sha256) throw new Error("סיכום הקובץ לא תואם");

    const { data: marked, error: mErr } = await supabaseAdmin.rpc("server_mark_upload_staged", {
      _upload_id: data.uploadId,
      _user: context.userId,
      _size: bytes.length,
      _mime: data.mime,
      _sha: sha,
      _name: data.name,
    });
    if (mErr) throw new Error("סימון ההעלאה נכשל");
    const st = (marked as { status?: string })?.status;
    if (st !== "ok") throw new Error(st === "mismatch" ? "פרטי הקובץ לא תואמים את ההזמנה" : "ההעלאה אינה זמינה");
    return { ok: true };
  });

/** Copies a claimed staged file to its final private path. Trip members only (via proposal RLS). */
export const copyDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ proposalId: z.string().uuid(), uploadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Live access check with the caller's own session (RLS on document_proposals).
    const { data: p } = await context.supabase
      .from("document_proposals")
      .select("id,upload_id")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (!p || p.upload_id !== data.uploadId) throw new Error("ההצעה אינה זמינה");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: paths } = await supabaseAdmin.rpc("server_upload_paths", { _upload_id: data.uploadId });
    const u = paths as { staged_path?: string; final_path?: string; status?: string } | null;
    if (!u?.staged_path || !u.final_path) throw new Error("הקובץ אינו מוכן");
    if (u.status === "copied") return { ok: true, copied: true };
    if (u.status !== "copying") throw new Error("הקובץ אינו מוכן");

    const { error: cErr } = await supabaseAdmin.storage.from(BUCKET).copy(u.staged_path, u.final_path);
    if (cErr) throw new Error("העתקת הקובץ נכשלה");
    const { data: marked } = await supabaseAdmin.rpc("server_mark_upload_copied", { _upload_id: data.uploadId });
    if ((marked as { status?: string })?.status !== "ok") throw new Error("סימון ההעתקה נכשל");
    return { ok: true, copied: true };
  });

/** Short-lived (5 min) signed URL for a private document file, after a live RLS access check. */
export const getDocumentFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase
      .from("documents")
      .select("id,file_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc?.file_path) throw new Error("הקובץ אינו זמין");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 300);
    if (error || !signed?.signedUrl) throw new Error("יצירת הקישור נכשלה");
    return { url: signed.signedUrl };
  });
