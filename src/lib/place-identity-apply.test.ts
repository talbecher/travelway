// @ts-ignore -- project bun runner
import { expect, it } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { signReview } from './place-identity.server';
import { applyReviewedIdentity } from './place-identity-apply.server';
const tripId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const row = { id: '33333333-3333-4333-8333-333333333333', trip_id: tripId, name: 'Kuma Kafe', notes: 'Keep', latitude: 34.65, longitude: 135.43, google_maps_url: 'saved-link', provider_place_id: null, photo_url: 'own-photo', rating: 4 };
function fixture(current: unknown = row, race = false) {
  let writes = 0; let patch: unknown; const quals: unknown[] = [];
  const query = { select: () => query, eq: (c: string, v: unknown) => { quals.push([c,v]); return query; }, is: (c: string, v: unknown) => { quals.push([c,v]); return query; }, update: (p: unknown) => { writes++; patch = p; return query; }, maybeSingle: async () => ({ data: writes ? race ? null : { id: row.id } : current, error: null }) };
  return { context: { userId, supabase: { from: () => query } as unknown as SupabaseClient<Database> }, writes: () => writes, patch: () => patch, quals };
}
async function receipt(overrides: Record<string, unknown> = {}) { return signReview({ userId, tripId, row, placeId: 'Kuma_place_id', expires: Date.now() + 60000, ...overrides }, 'fixture-secret'); }
it('valid receipt applies identity only with all reviewed fields in CAS', async () => {
  const f = fixture();
  expect((await applyReviewedIdentity(await receipt(), f.context, 'fixture-secret', tripId)).status).toBe('applied');
  expect(f.patch()).toEqual({ provider: 'google', provider_place_id: 'Kuma_place_id' });
  expect(f.quals).toContainEqual(['notes', 'Keep']);
  expect(f.quals).toContainEqual(['photo_url', 'own-photo']);
  expect(f.quals).toContainEqual(['google_maps_url', 'saved-link']);
});
it('stale and already assigned recommendations skip without update', async () => {
  for (const current of [{ ...row, notes: 'Changed' }, { ...row, provider_place_id: 'existing' }, null]) {
    const f = fixture(current);
    expect((await applyReviewedIdentity(await receipt(), f.context, 'fixture-secret', tripId)).status).toBe('skipped');
    expect(f.writes()).toBe(0);
  }
});
it('tampered, wrong user, wrong trip and expired receipts fail without reads or writes', async () => {
  const cases = [await receipt({ userId: tripId }), await receipt({ tripId: userId }), await receipt({ expires: 0 }), { ...(await receipt()), signature: 'a'.repeat(64) }];
  for (const r of cases) {
    const f = fixture();
    expect((await applyReviewedIdentity(r, f.context, 'fixture-secret', tripId)).status).toBe('failed');
    expect(f.writes()).toBe(0); expect(f.quals.length).toBe(0);
  }
});
it('read/update race skips rather than overwrites', async () => {
  const f = fixture(row, true);
  expect((await applyReviewedIdentity(await receipt(), f.context, 'fixture-secret', tripId)).status).toBe('skipped');
});
