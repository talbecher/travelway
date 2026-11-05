// @ts-ignore -- project bun runner
import { expect, it } from 'bun:test';
import { emptyIdentityProgress, importIdentityProgress, persistIdentityProgress, SCAN_CAP, BATCH_SIZE } from './identity-progress';
it('supports all 1153 missing identities within one capped scan of 231 automatic batches', () => {
  expect(SCAN_CAP).toBeGreaterThanOrEqual(1153);
  expect(BATCH_SIZE).toBe(5);
  expect(Math.ceil(1153 / BATCH_SIZE)).toBe(231);
});
it('import continuation retains only distinct new IDs', () => {
  expect(importIdentityProgress(['new-1', 'new-2', 'new-1']).scope).toEqual(['new-1', 'new-2']);
});
it('reload checkpoint excludes transient Google metadata and signed receipts', () => {
  const progress = { ...emptyIdentityProgress(), pending: ['own-id'], after: 'own-cursor', candidates: [{ name: 'Google business', address: 'Google address' }], review: { text: 'Google ID', signature: 'secret' }, photo: 'https://google/photo', rating: 5 };
  const restored = JSON.parse(persistIdentityProgress(progress));
  expect(restored.pending).toEqual(['own-id']);
  expect(restored.after).toBe('own-cursor');
  expect(restored.candidates).toBeUndefined();
  expect(restored.review).toBeUndefined();
  expect(restored.photo).toBeUndefined();
  expect(restored.rating).toBeUndefined();
});
