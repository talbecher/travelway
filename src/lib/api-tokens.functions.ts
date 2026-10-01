import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ApiTokenInfo = {
  id: string;
  label: string;
  trip_id: string | null;
  trip_title: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export const createApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      label: z.string().trim().min(1).max(60),
      tripId: z.string().uuid().nullable(),
      days: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.tripId) {
      // Verify live access with the user's own session (RLS).
      const { data: t } = await context.supabase.from("trips").select("id").eq("id", data.tripId).maybeSingle();
      if (!t) throw new Error("הטיול אינו זמין");
    }
    const { randomBytes } = await import("crypto");
    const { hashToken } = await import("./trip-context.server");
    const raw = `twpat_${randomBytes(32).toString("base64url")}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("api_tokens").insert({
      user_id: context.userId,
      token_hash: hashToken(raw),
      label: data.label,
      trip_id: data.tripId,
      expires_at: new Date(Date.now() + data.days * 86400000).toISOString(),
    });
    if (error) throw new Error("יצירת הטוקן נכשלה");
    return { token: raw };
  });

export const listApiTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiTokenInfo[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("api_tokens")
      .select("id,label,trip_id,created_at,expires_at,revoked_at,last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("טעינת הטוקנים נכשלה");
    const ids = [...new Set((data ?? []).map((t) => t.trip_id).filter(Boolean))] as string[];
    const titles: Record<string, string> = {};
    if (ids.length) {
      const { data: trips } = await context.supabase.from("trips").select("id,title").in("id", ids);
      for (const t of trips ?? []) titles[t.id] = t.title;
    }
    return (data ?? []).map((t) => ({ ...t, trip_title: t.trip_id ? titles[t.trip_id] ?? null : null }));
  });

export const revokeApiToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (error) throw new Error("הביטול נכשל");
    return { ok: true };
  });
