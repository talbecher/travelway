import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { identityInput, searchBusiness, placesRequest, signReview } from './place-identity.server';
import { isGooglePhoto } from './place-identity';
import { applyReviewedIdentity } from './place-identity-apply.server';
import { setResponseHeader } from '@tanstack/react-start/server';

const scope = z.object({ tripId: z.string().uuid(), id: z.string().uuid() });
export const matchNewRecommendation = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => identityInput.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const { data: trip } = await context.supabase.from('trips').select('id').eq('id', data.tripId).maybeSingle();
    if (!trip) throw new Error('אין גישה לטיול');
    const key = process.env['GOOGLE_MAPS_API_KEY'] ?? process.env['GOOGLE_PLACES_KEY'];
    return searchBusiness(data, key ? { key, gatewayKey: process.env['GOOGLE_MAPS_API_KEY'] ? process.env['LOVABLE_API_KEY'] : undefined } : null);
  });

export const reviewRecommendationIdentities = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ tripId: z.string().uuid(), after: z.string().uuid().nullable().optional(), ids: z.array(z.string().uuid()).min(1).max(5).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const { data: trip } = await context.supabase.from('trips').select('id').eq('id', data.tripId).maybeSingle();
    if (!trip) throw new Error('אין גישה לטיול');
    let query = context.supabase.from('recommendations').select('*').eq('trip_id', data.tripId).is('provider_place_id', null).order('id').limit(6);
    if (data.ids) query = query.in('id', data.ids);
    if (data.after) query = query.gt('id', data.after);
    const { data: rows, error } = await query;
    if (error) throw error;
    const key = process.env['GOOGLE_MAPS_API_KEY'] ?? process.env['GOOGLE_PLACES_KEY'];
    const credentials = key ? { key, gatewayKey: process.env['GOOGLE_MAPS_API_KEY'] ? process.env['LOVABLE_API_KEY'] : undefined } : null;
    const secret = process.env['API_CURSOR_SECRET'];
    const results = [];
    let requests = 0;
    for (const row of (rows ?? []).slice(0, 5)) {
      const missingPhoto = !row.photo_url || isGooglePhoto(row.photo_url);
      if (row.provider_place_id) {
        results.push({ id: row.id, name: row.name, status: 'existing' as const, candidates: [], proposed: null, review: null, missingPhoto });
        continue;
      }
      const match = await searchBusiness({ tripId: data.tripId, ...row }, credentials);
      requests += match.requests;
      if (match.status === 'api_failure') {
        return { results, requests, next: results.at(-1)?.id ?? data.after ?? null, stopped: true, deferred: row.id };
      }
      const review = match.proposed && secret ? await signReview({ userId: context.userId, tripId: data.tripId, row, placeId: match.proposed.id, expires: Date.now() + 30 * 60 * 1000 }, secret) : null;
      results.push({ id: row.id, name: row.name, status: match.status, candidates: match.candidates, proposed: match.proposed, review, missingPhoto, error: match.error });
      // Do not keep spending after a provider/key failure.
      if (match.status === 'api_failure') break;
    }
    const last = results.at(-1);
    return { results, requests, next: !data.ids && last && rows?.length === 6 ? last.id : null, stopped: false, deferred: null };
  });

export const applyRecommendationIdentity = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ text: z.string().max(30000), signature: z.string().length(64) }).parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const result = await applyReviewedIdentity(data, context, process.env['API_CURSOR_SECRET']);
    if (result.status !== 'applied') throw new Error(result.error ?? 'ההמלצה השתנתה; יש לבדוק מחדש');
    return { applied: true };
  });

export const applyRecommendationIdentities = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ tripId: z.string().uuid(), receipts: z.array(z.object({ text: z.string().max(30000), signature: z.string().length(64) })).min(1).max(5) }).parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const { data: trip } = await context.supabase.from('trips').select('id').eq('id', data.tripId).maybeSingle();
    if (!trip) throw new Error('אין גישה לטיול');
    const results = [];
    for (const receipt of data.receipts) results.push(await applyReviewedIdentity(receipt, context, process.env['API_CURSOR_SECRET'], data.tripId));
    return { results };
  });

export const recommendationBusinessMedia = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => scope.parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const { data: row } = await context.supabase.from('recommendations').select('provider_place_id,photo_url').eq('id', data.id).eq('trip_id', data.tripId).maybeSingle();
    if (!row?.provider_place_id || !/^[A-Za-z0-9_-]{5,300}$/.test(row.provider_place_id)) return { photo: null, rating: null, count: null, authors: [], error: null };
    const key = process.env['GOOGLE_MAPS_API_KEY'] ?? process.env['GOOGLE_PLACES_KEY'];
    if (!key) return { photo: null, rating: null, count: null, authors: [], error: 'Google Places אינו מוגדר' };
    const credentials = { key, gatewayKey: process.env['GOOGLE_MAPS_API_KEY'] ? process.env['LOVABLE_API_KEY'] : undefined };
    try {
      const ownPhoto = row.photo_url && !isGooglePhoto(row.photo_url);
      const place = await placesRequest(credentials, `places/${encodeURIComponent(row.provider_place_id)}`, ownPhoto ? 'rating,userRatingCount' : 'photos,rating,userRatingCount');
      const first = place.photos?.[0];
      let photo: string | null = null;
      if (first?.name && new RegExp(`^places/${row.provider_place_id}/photos/[A-Za-z0-9_-]+$`).test(first.name)) {
        const media = await placesRequest(credentials, `${first.name}/media?maxWidthPx=400&skipHttpRedirect=true`, '');
        photo = media.photoUri ?? null;
      }
      return { photo, rating: place.rating ?? null, count: place.userRatingCount ?? null, authors: (first?.authorAttributions ?? []).map((a: { displayName?: string; uri?: string }) => ({ name: a.displayName ?? '', uri: a.uri ?? null })), error: null };
    } catch { return { photo: null, rating: null, count: null, authors: [], error: 'פרטי Google לא זמינים כרגע' }; }
  });