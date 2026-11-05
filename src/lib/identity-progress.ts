// Only first-party IDs, statuses and counters persist; Google candidates/receipts never do.
export type IdentityProgress = { after: string | null; done: boolean; scope: string[] | null; pending: string[]; deferred: string[]; scanned: number; requests: number; applied: number; skipped: number; failed: number };
export const emptyIdentityProgress = (): IdentityProgress => ({ after: null, done: false, scope: null, pending: [], deferred: [], scanned: 0, requests: 0, applied: 0, skipped: 0, failed: 0 });
export const SCAN_CAP = 1200;
export const BATCH_SIZE = 5;
export function persistIdentityProgress(progress: IdentityProgress): string {
  const { after, done, scope, pending, deferred, scanned, requests, applied, skipped, failed } = progress;
  return JSON.stringify({ after, done, scope, pending, deferred, scanned, requests, applied, skipped, failed });
}
export function importIdentityProgress(ids: string[]): IdentityProgress { return { ...emptyIdentityProgress(), scope: [...new Set(ids)] }; }
