import { resolveDayLocation, type StoredLocation } from './day-location';
import { haversine } from './geo';

export type BusinessCandidate = { id: string; name: string; address: string; latitude: number; longitude: number };
export type MatchResult = { status: 'confident' | 'ambiguous' | 'no_match' | 'pin_only' | 'api_failure'; candidates: Array<BusinessCandidate & { distance: number }>; proposed: BusinessCandidate | null };
export function businessName(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/\bkafe\b/g, 'cafe').replace(/[^\p{L}\p{N}]+/gu, '').trim();
}
export function matchBusiness(name: string, pin: StoredLocation, candidates: BusinessCandidate[]): MatchResult {
  const origin = resolveDayLocation(pin);
  if (!origin) return { status: 'pin_only', candidates: [], proposed: null };
  const nearby = candidates.flatMap(candidate => {
    const location = resolveDayLocation(candidate);
    if (!location || !candidate.id || !candidate.name) return [];
    const distance = haversine({ lat: origin.lat, lon: origin.lng }, { lat: location.lat, lon: location.lng }) * 1000;
    return distance <= 1000 ? [{ ...candidate, distance: Math.round(distance) }] : [];
  }).sort((a, b) => a.distance - b.distance);
  const exact = nearby.filter(p => businessName(p.name) === businessName(name));
  const unique = [...new Map(exact.map(p => [p.id, p])).values()];
  const winner = unique[0];
  if (winner && unique.length === 1 && winner.distance <= 150) return { status: 'confident', candidates: nearby, proposed: winner };
  return { status: nearby.length ? 'ambiguous' : 'no_match', candidates: nearby, proposed: null };
}
export function businessMapsLink(id: string | null | undefined, name: string) {
  return id && /^[A-Za-z0-9_-]{5,300}$/.test(id) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}` : null;
}
export function isGooglePhoto(url: string | null | undefined) {
  if (!url) return false;
  try { const host = new URL(url).hostname; return host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com') || host === 'gstatic.com' || host.endsWith('.gstatic.com') || host === 'places.googleapis.com'; } catch { return false; }
}
export function identityOnlyPatch(id: string) { return { provider: 'google', provider_place_id: id }; }