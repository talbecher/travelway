// @ts-ignore -- matches the existing dependency-free bun test suite.
import { describe, expect, it } from 'bun:test';
import { computeOptimalOrder, type RouteOrderEntry } from './day-route-order';

let seq = 0;
function entry(partial: Partial<RouteOrderEntry> & { entry_type?: string }): RouteOrderEntry & { id: string } {
  seq += 1;
  return {
    id: `e${seq}`,
    entry_type: 'attraction',
    time_of_day: null,
    latitude: null,
    longitude: null,
    google_maps_url: null,
    ...partial,
  } as RouteOrderEntry & { id: string };
}

// Tokyo-area pins: A and C are ~250m apart, B is ~11km away.
const A = { latitude: 35.7100, longitude: 139.8100 };
const B = { latitude: 35.6580, longitude: 139.7000 };
const C = { latitude: 35.7110, longitude: 139.8120 };

describe('computeOptimalOrder', () => {
  it('keeps entries without coordinates at their original slots instead of pushing them to the end', () => {
    const note = entry({ entry_type: 'note', title: 'briefing' } as Partial<RouteOrderEntry>);
    const a = entry(A);
    const b = entry(B);
    const c = entry(C);
    // Current order is deliberately bad (A, B, C) with a note in the middle.
    const result = computeOptimalOrder([a, note, b, c]);
    const ids = result.optimalOrder.map((e) => (e as { id: string }).id);
    // Note stays at index 1; movable stops reorder around it (A, C, B).
    expect(ids[1]).toBe(note.id);
    expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(b.id));
    expect(result.optimalOrder).toHaveLength(4);
  });

  it('keeps timed entries (flight, reservation) at their original slots', () => {
    const flight = entry({ entry_type: 'flight', time_of_day: '09:00', ...B });
    const a = entry(A);
    const c = entry(C);
    const d = entry({ latitude: 35.7095, longitude: 139.8110 });
    const result = computeOptimalOrder([flight, a, d, c]);
    expect((result.optimalOrder[0] as { id: string }).id).toBe(flight.id);
  });

  it('still reorders free-floating located stops by distance', () => {
    const a = entry(A);
    const b = entry(B);
    const c = entry(C);
    const result = computeOptimalOrder([a, b, c]);
    const ids = result.optimalOrder.map((e) => (e as { id: string }).id);
    expect(ids).toEqual([a.id, c.id, b.id]);
    expect(result.isSuboptimal).toBe(true);
  });

  it('does not suggest changes when fewer than three movable stops exist', () => {
    const a = entry(A);
    const note = entry({ entry_type: 'note' } as Partial<RouteOrderEntry>);
    const result = computeOptimalOrder([a, note]);
    expect(result.isSuboptimal).toBe(false);
    expect(result.optimalOrder.map((e) => (e as { id: string }).id)).toEqual([a.id, note.id]);
  });
});
