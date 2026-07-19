import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "rec-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export function PhotoUploader({
  value,
  onChange,
  folder,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: "recs" | "hotels";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function pick(replace: boolean) {
    if (replace && value) {
      if (!window.confirm("להחליף את התמונה הנוכחית?")) return;
    }
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("קובץ לא תקין — יש להעלות תמונה");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("התמונה גדולה מדי (מקסימום 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, TEN_YEARS);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Failed to sign URL");
      onChange(signed.signedUrl);
      toast.success("✅ התמונה הועלתה");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      {value ? (
        <div className="space-y-2">
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted border border-border">
            <img src={value} alt="" className="w-full h-full object-cover" />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="animate-spin text-white" size={24} />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => pick(true)}
              className="flex-1 h-10 rounded-lg border border-input bg-background text-sm flex items-center justify-center gap-1.5 min-h-0 disabled:opacity-50"
            >
              <RefreshCw size={14} /> החלף תמונה
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                if (window.confirm("להסיר את התמונה?")) onChange(null);
              }}
              className="h-10 px-3 rounded-lg border border-input bg-background text-sm flex items-center justify-center gap-1.5 min-h-0 disabled:opacity-50 text-[color:var(--accent-2)]"
            >
              <Trash2 size={14} /> הסר
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => pick(false)}
          className="w-full h-24 rounded-lg border border-dashed border-input bg-background text-sm flex flex-col items-center justify-center gap-1 text-muted-foreground disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              <Camera size={20} />
              <span>העלה תמונה מהמכשיר</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
