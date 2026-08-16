// buildPerchSprites is pure, but it lives beside the hook that fetches cats —
// so importing it would otherwise pull in dbService and, through it, the
// Firebase SDK, which ships ESM that this suite's transform cannot parse.
jest.mock('../../services/dbService', () => ({ getCats: jest.fn() }));

import { buildPerchSprites } from '../usePerchSprites';

/**
 * The cycling rule decides what a player sees on every Hood entry, and it has
 * to behave sensibly at both ends: an empty Cat-a-log must not put anything on
 * the perches, and a Cat-a-log larger than the perch count must not drop cats
 * silently in a way that looks like a bug.
 */
describe('buildPerchSprites', () => {
  it('returns nothing for an empty Cat-a-log, so perches stay vacant', () => {
    expect(buildPerchSprites([], 6)).toEqual([]);
  });

  it('fills every perch with the only cat when one is logged', () => {
    // No data-side fix exists here — six clones is the only option, which is
    // why CatSprite takes a phase offset so they at least breathe out of sync.
    expect(buildPerchSprites(['calico'], 6)).toEqual(Array(6).fill('calico'));
  });

  it('cycles when there are fewer cats than perches', () => {
    expect(buildPerchSprites(['a', 'b', 'c', 'd', 'e'], 6)).toEqual([
      'a', 'b', 'c', 'd', 'e', 'a',
    ]);
  });

  it('maps one-to-one when counts match', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(buildPerchSprites(ids, 6)).toEqual(ids);
  });

  it('truncates to the perch count when the Cat-a-log is larger', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(buildPerchSprites(ids, 6)).toHaveLength(6);
    expect(buildPerchSprites(ids, 6)).not.toContain('g');
  });

  it('never returns more entries than there are perches', () => {
    for (const count of [0, 1, 3, 6, 20]) {
      const ids = Array.from({ length: count }, (_, i) => `cat_${i}`);
      expect(buildPerchSprites(ids, 6).length).toBeLessThanOrEqual(6);
    }
  });

  it('honours a non-default perch count', () => {
    expect(buildPerchSprites(['a', 'b'], 3)).toEqual(['a', 'b', 'a']);
  });
});
