import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { verifyReview } from './place-identity.server';
import { identityOnlyPatch } from './place-identity';

export async function applyReviewedIdentity(receipt: { text: string; signature: string }, context: { userId: string; supabase: SupabaseClient<Database> }, secret?: string, tripId?: string): Promise<{ id: string | null; status: 'applied' | 'skipped' | 'failed'; error?: string }> {
  let id: string | null = null;
  try {
    if (!secret || !await verifyReview(receipt.text, receipt.signature, secret)) throw new Error('אישור לא תקין');
    const payload = z.object({ userId: z.string().uuid(), tripId: z.string().uuid(), placeId: z.string().regex(/^[A-Za-z0-9_-]{5,300}$/), expires: z.number(), row: z.record(z.unknown()) }).parse(JSON.parse(receipt.text));
    if (payload.userId !== context.userId || (tripId && tripId !== payload.tripId) || payload.expires < Date.now() || payload.row.provider_place_id) throw new Error('אישור פג או לא תואם לטיול');
    id = z.string().uuid().parse(payload.row.id);
    const { data: current, error } = await context.supabase.from('recommendations').select('*').eq('trip_id', payload.tripId).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!current || current.provider_place_id || JSON.stringify(current) !== JSON.stringify(payload.row)) return { id, status: 'skipped' };
    let update = context.supabase.from('recommendations').update(identityOnlyPatch(payload.placeId)).eq('trip_id', payload.tripId).eq('id', id).is('provider_place_id', null);
    for (const [column, value] of Object.entries(payload.row)) {
      if (value === undefined) throw new Error('Invalid reviewed row');
      update = value === null ? update.is(column, null) : update.eq(column, value);
    }
    const { data: applied, error: applyError } = await update.select('id').maybeSingle();
    if (applyError) throw applyError;
    return { id, status: applied ? 'applied' : 'skipped' };
  } catch { return { id, status: 'failed', error: 'האישור לא נשמר; אפשר לבדוק מחדש' }; }
}
