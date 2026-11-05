import { z } from 'zod';
import { resolveDayLocation } from './day-location';
import { matchBusiness, type BusinessCandidate, type MatchResult } from './place-identity';

export const identityInput = z.object({ tripId: z.string().uuid(), name: z.string().trim().min(1).max(200), latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional(), google_maps_url: z.string().max(2048).nullable().optional() });
export type PlacesCredentials = { key: string; gatewayKey?: string };
export async function placesRequest(credentials: PlacesCredentials, path: string, mask: string, body?: unknown) {
  const gateway = Boolean(credentials.gatewayKey);
  const url = gateway ? `https://connector-gateway.lovable.dev/google_maps/places/v1/${path}` : `https://places.googleapis.com/v1/${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Goog-FieldMask': mask };
  if (gateway) { headers.Authorization = `Bearer ${credentials.gatewayKey}`; headers['X-Connection-Api-Key'] = credentials.key; }
  else headers['X-Goog-Api-Key'] = credentials.key;
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Places enrichment', response.status, detail);
    if (response.status === 403) {
      if (detail.includes('API_KEY_HTTP_REFERRER_BLOCKED')) throw new Error('Google Maps server key: use None or IP addresses application restrictions.');
      if (detail.includes('API_KEY_SERVICE_BLOCKED')) throw new Error('Enable Places API (New) on the Google Maps server key.');
    }
    throw new Error(`Google Places [${response.status}]: ${detail}`);
  }
  return response.json();
}
export async function searchBusiness(input: z.infer<typeof identityInput>, credentials: PlacesCredentials | null): Promise<MatchResult & { requests: number; error?: string }> {
  const pin = resolveDayLocation(input);
  if (!pin) return { status: 'pin_only', candidates: [], proposed: null, requests: 0 };
  if (!credentials) return { status: 'api_failure', candidates: [], proposed: null, requests: 0, error: 'Google Places אינו מוגדר' };
  try {
    const json = await placesRequest(credentials, 'places:searchText', 'places.id,places.displayName,places.formattedAddress,places.location', {
      textQuery: input.name, pageSize: 5,
      locationBias: { circle: { center: { latitude: pin.lat, longitude: pin.lng }, radius: 1000 } },
    });
    const candidates: BusinessCandidate[] = (json.places ?? []).flatMap((p: { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }) => p.id && p.displayName?.text && p.location ? [{ id: p.id, name: p.displayName.text, address: p.formattedAddress ?? '', ...p.location }] : []);
    return { ...matchBusiness(input.name, input, candidates), requests: 1 };
  } catch (error) {
    return { status: 'api_failure', candidates: [], proposed: null, requests: 1, error: error instanceof Error ? error.message : 'Google Places unavailable' };
  }
}

const encoder = new TextEncoder();
async function key(secret: string) { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function signReview(payload: unknown, secret: string) {
  const text = JSON.stringify(payload);
  const bytes = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(text));
  return { text, signature: Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('') };
}
export async function verifyReview(text: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.subtle.verify('HMAC', await key(secret), Uint8Array.from(signature.match(/../g) ?? [], h => parseInt(h, 16)), encoder.encode(text));
}