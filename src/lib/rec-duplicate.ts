import { supabase } from "@/integrations/supabase/client";

/** Unique index on (trip_id, provider, provider_place_id): one recommendation per Google place per trip. */
export const REC_PLACE_UNIQUE_INDEX = "recommendations_trip_provider_place_uidx";

export const REC_DUPLICATE_MESSAGE = "המקום כבר שמור בהמלצות";

export type ExistingRecRef = { id: string; name: string };

/**
 * True only for the "this Google place is already saved in this trip" violation.
 * Any other unique violation, or any other error, returns false and keeps its current handling.
 */
export function isRecPlaceDuplicateError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: unknown; message?: unknown; details?: unknown };
  if (err.code !== "23505") return false;
  const text = [err.message, err.details].filter((v) => typeof v === "string").join(" ");
  return text.includes(REC_PLACE_UNIQUE_INDEX);
}

/** Clear Hebrew text for the duplicate case, naming the saved recommendation when it is known. */
export function recDuplicateMessage(existing?: Pick<ExistingRecRef, "name"> | null): string {
  const name = existing?.name?.trim();
  return name ? `${REC_DUPLICATE_MESSAGE} בשם "${name}"` : REC_DUPLICATE_MESSAGE;
}

/** Looks up the already-saved recommendation for a Google place. Never throws — the message works without it. */
export async function findRecByPlaceId(
  tripId: string,
  placeId: string | null | undefined,
): Promise<ExistingRecRef | null> {
  if (!tripId || !placeId) return null;
  try {
    const { data, error } = await supabase
      .from("recommendations")
      .select("id, name")
      .eq("trip_id", tripId)
      .eq("provider_place_id", placeId)
      .limit(1);
    if (error || !data?.length) return null;
    return { id: data[0].id, name: data[0].name };
  } catch {
    return null;
  }
}

/** Thrown in place of the raw database error, so callers can show the message and offer the saved place. */
export class RecDuplicateError extends Error {
  readonly existing: ExistingRecRef | null;
  constructor(existing: ExistingRecRef | null) {
    super(recDuplicateMessage(existing));
    this.name = "RecDuplicateError";
    this.existing = existing;
  }
}

/**
 * Re-throws a duplicate-place violation as RecDuplicateError (with the saved rec when it can be found).
 * Every other error is re-thrown unchanged.
 */
export async function rethrowRecDuplicate(
  e: unknown,
  tripId: string,
  placeId: string | null | undefined,
): Promise<never> {
  if (isRecPlaceDuplicateError(e))
    throw new RecDuplicateError(await findRecByPlaceId(tripId, placeId));
  throw e;
}
