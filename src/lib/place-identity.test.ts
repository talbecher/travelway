// @ts-ignore -- matches the existing dependency-free bun test suite.
import { describe, expect, it } from 'bun:test';
import { matchBusiness, identityOnlyPatch, isGooglePhoto } from './place-identity';
const pin = { latitude: 34.6555406, longitude: 135.4315394 };
const kuma = { id: 'ChIJKuma', name: 'Kuma Cafe', address: 'Osaka', ...pin };
describe('business matching', () => {
  it('matches Kuma Kafe by normalized name and nearby pin, not result order', () => {
    const wrong = { ...kuma, id: 'ChIJOther', name: 'Other Cafe' };
    expect(matchBusiness('Kuma Kafe', pin, [wrong, kuma]).proposed?.id).toBe('ChIJKuma');
  });
  it('requires review for ambiguous nearby branches', () => {
    expect(matchBusiness('Kuma Kafe', pin, [kuma, { ...kuma, id: 'ChIJBranch', latitude: 34.6565406 }]).status).toBe('ambiguous');
  });
  it('preserves a pin-only import without a result', () => {
    const input = Object.freeze({ ...pin, google_maps_url: 'https://www.google.com/maps/search/?api=1&query=34.6555406,135.4315394' });
    expect(matchBusiness('Kuma Kafe', input, []).status).toBe('no_match');
    expect(input.latitude).toBe(34.6555406);
  });
  it('does not choose a far identical name or nearby wrong name', () => {
    expect(matchBusiness('Kuma Kafe', pin, [{ ...kuma, latitude: 35 }]).status).toBe('no_match');
    expect(matchBusiness('Kuma Kafe', pin, [{ ...kuma, name: 'Different' }]).proposed).toBeNull();
  });
  it('does not search without valid explicit coordinates', () => {
    expect(matchBusiness('Kuma Kafe', { latitude: 91, longitude: 135 }, [kuma]).status).toBe('pin_only');
  });
  it('apply patch contains identity only', () => {
    expect(identityOnlyPatch('ChIJKuma')).toEqual({ provider: 'google', provider_place_id: 'ChIJKuma' });
  });
  it('distinguishes Google photos from user uploads', () => {
    expect(isGooglePhoto('https://lh3.googleusercontent.com/photo')).toBe(true);
    expect(isGooglePhoto('https://travelway.lovable.app/user.jpg')).toBe(false);
  });
});