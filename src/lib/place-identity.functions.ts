import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { identityInput, searchBusiness, placesRequest, signReview, verifyReview } from './place-identity.server';
import { identityOnlyPatch, isGooglePhoto } from './place-identity';
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
  .inputValidator(input => z.object({ tripId: z.string().uuid(), after: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const { data: trip } = await context.supabase.from('trips').select('id').eq('id', data.tripId).maybeSingle();
    if (!trip) throw new Error('אין גישה לטיול');
    let query = context.supabase.from('recommendations').select('*').eq('trip_id', data.tripId).order('id').limit(6);
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
      const review = match.proposed && secret ? await signReview({ userId: context.userId, tripId: data.tripId, row, placeId: match.proposed.id, expires: Date.now() + 30 * 60 * 1000 }, secret) : null;
      results.push({ id: row.id, name: row.name, status: match.status, candidates: match.candidates, proposed: match.proposed, review, missingPhoto, error: match.error });
      // Do not keep spending after a provider/key failure.
      if (match.status === 'api_failure') break;
    }
    const last = results.at(-1);
    return { results, requests, next: last && (rows?.length === 6 || results.length < Math.min(rows?.length ?? 0, 5)) ? last.id : null };
  });

export const applyRecommendationIdentity = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ text: z.string().max(30000), signature: z.string().length(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const secret = process.env['API_CURSOR_SECRET'];
    if (!secret || !await verifyReview(data.text, data.signature, secret)) throw new Error('אישור לא תקין');
    const payload = z.object({ userId: z.string().uuid(), tripId: z.string().uuid(), placeId: z.string().regex(/^[A-Za-z0-9_-]{5,300}$/), expires: z.number(), row: z.record(z.unknown()) }).parse(JSON.parse(data.text));
    if (payload.userId !== context.userId || payload.expires < Date.now() || payload.row.provider_place_id) throw new Error('האישור פג או שהמקום כבר משויך');
    const id = z.string().uuid().parse(payload.row.id);
    const { data: current, error } = await context.supabase.from('recommendations').select('*').eq('trip_id', payload.tripId).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!current || current.provider_place_id || JSON.stringify(current) !== JSON.stringify(payload.row)) throw new Error('ההמלצה השתנתה; יש לבדוק מחדש');
    // Compare every reviewed column at UPDATE time too: no read/update race or identity overwrite.
    let update = context.supabase.from('recommendations').update(identityOnlyPatch(payload.placeId)).eq('trip_id', payload.tripId).eq('id', id).is('provider_place_id', null);
    for (const [column, value] of Object.entries(payload.row)) {
      if (value === undefined) throw new Error('Invalid reviewed row');
      update = value === null ? update.is(column, null) : update.eq(column, value);
    }
    const { data: applied, error: applyError } = await update.select('id').maybeSingle();
    if (applyError) throw applyError;
    if (!applied) throw new Error('ההמלצה השתנתה; לא בוצע שיוך');
    return { applied: true };
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