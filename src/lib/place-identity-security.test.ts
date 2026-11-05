// @ts-ignore -- uses the project's existing bun test runner.
import { describe, expect, it } from 'bun:test';
import { searchBusiness, signReview, verifyReview } from './place-identity.server';
describe('enrichment safety', () => {
  it('missing API configuration preserves pin-only without spending', async () => {
    const result = await searchBusiness({ tripId: '11111111-1111-4111-8111-111111111111', name: 'Kuma Kafe', latitude: 34.665, longitude: 135.43 }, null);
    expect(result.status).toBe('api_failure');
    expect(result.requests).toBe(0);
    expect(result.proposed).toBeNull();
  });
  it('no pin means no billable lookup', async () => {
    const result = await searchBusiness({ tripId: '11111111-1111-4111-8111-111111111111', name: 'Kuma Kafe' }, null);
    expect(result.status).toBe('pin_only');
    expect(result.requests).toBe(0);
  });
  it('review cannot be altered to select another business or trip', async () => {
    const receipt = await signReview({ tripId: 'trip-a', placeId: 'Kuma', expires: 100 }, 'test-only-secret');
    expect(await verifyReview(receipt.text, receipt.signature, 'test-only-secret')).toBe(true);
    expect(await verifyReview(receipt.text.replace('Kuma', 'Branch'), receipt.signature, 'test-only-secret')).toBe(false);
    expect(await verifyReview(receipt.text.replace('trip-a', 'trip-b'), receipt.signature, 'test-only-secret')).toBe(false);
  });
});