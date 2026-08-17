// buildPerchSprites is pure, but it lives beside the hook that fetches cats —
// importing it would otherwise pull in dbService and, through it, the Firebase
// SDK, which ships ESM this suite's transform cannot parse.
jest.mock('../../services/dbService', () => ({ getCats: jest.fn() }));

import {
  buildPerchSprites,
  isFresh,
  invalidatePerchSprites,
  primePerchSprites,
  loadPerchIds,
} from '../usePerchSprites';
import { getCats } from '../../services/dbService';

const mockGetCats = getCats as jest.MockedFunction<typeof getCats>;
const cat = (id: string) => ({ sprite_template_id: id }) as never;

beforeEach(() => {
  invalidatePerchSprites();
  mockGetCats.mockReset();
  jest.useRealTimers();
});

/**
 * Perch ORDER is the whole feature, not a cosmetic detail.
 *
 * expectedCats comes from the Hood's spawn rate, and an undecorated Hood yields
 * round(0.30 * 6) = 2 — so only perches 0 and 1 render. An oldest-first order
 * put a newly logged cat on a perch that does not exist yet, which meant "log a
 * cat, see it in your Hood" silently did nothing for anyone past their second
 * cat, while every test passed.
 */
describe('buildPerchSprites', () => {
  it('returns nothing for an empty Cat-a-log, so perches stay vacant', () => {
    expect(buildPerchSprites([], 6)).toEqual([]);
  });

  it.each([1, 2, 5, 6, 7, 20])(
    'puts the newest cat on perch 0 with %i cats logged',
    (count) => {
      const ids = Array.from({ length: count - 1 }, (_, i) => `old_${i}`);
      ids.push('newest');
      expect(buildPerchSprites(ids, 6)[0]).toBe('newest');
    },
  );

  it('orders the most recent cats newest-first', () => {
    expect(buildPerchSprites(['a', 'b', 'c'], 6)).toEqual([
      'c', 'b', 'a', 'c', 'b', 'a',
    ]);
  });

  it('keeps the newest six when the Cat-a-log is larger', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    // 'a' is the oldest and is the one that falls off, not 'g'.
    expect(buildPerchSprites(ids, 6)).toEqual(['g', 'f', 'e', 'd', 'c', 'b']);
  });

  it('fills every perch with the only cat when one is logged', () => {
    // No data-side fix exists here — six clones is the only option, which is
    // why CatSprite takes a phase offset so they at least breathe out of sync.
    expect(buildPerchSprites(['calico'], 6)).toEqual(Array(6).fill('calico'));
  });

  it('never returns more entries than there are perches', () => {
    for (const count of [0, 1, 3, 6, 20]) {
      const ids = Array.from({ length: count }, (_, i) => `cat_${i}`);
      expect(buildPerchSprites(ids, 6).length).toBeLessThanOrEqual(6);
    }
  });

  it('honours a non-default perch count', () => {
    expect(buildPerchSprites(['a', 'b'], 3)).toEqual(['b', 'a', 'b']);
  });
});

describe('isFresh', () => {
  const now = 1_000_000;

  it('treats a missing entry as stale, so a cold uid always fetches', () => {
    expect(isFresh(undefined, now)).toBe(false);
  });

  it('expires an entry past the five-minute TTL', () => {
    expect(isFresh({ ids: ['a'], at: now - 5 * 60_000 - 1 }, now)).toBe(false);
  });

  it('still serves an entry a second before the TTL', () => {
    expect(isFresh({ ids: ['a'], at: now - (5 * 60_000 - 1_000) }, now)).toBe(true);
  });

  it('treats an empty Cat-a-log as a real cached answer, not a miss', () => {
    // [] means "this user has no cats" and must not trigger a refetch loop.
    expect(isFresh({ ids: [], at: now }, now)).toBe(true);
  });
});

/**
 * These are the assertions that would have caught the two shipped bugs. Before
 * them, deleting the entire cache-invalidation line left every test green.
 */
describe('loadPerchIds', () => {
  it('fetches once, then serves the cache on a second read', async () => {
    mockGetCats.mockResolvedValue([cat('calico')]);
    await loadPerchIds('u1');
    await loadPerchIds('u1');
    expect(mockGetCats).toHaveBeenCalledTimes(1);
  });

  it('refetches after the uid is invalidated', async () => {
    // The core-loop regression: without this, logging a cat never reaches the Hood.
    mockGetCats.mockResolvedValue([cat('calico')]);
    await loadPerchIds('u1');
    invalidatePerchSprites('u1');
    await loadPerchIds('u1');
    expect(mockGetCats).toHaveBeenCalledTimes(2);
  });

  it('invalidating one uid leaves another cached', async () => {
    mockGetCats.mockResolvedValue([cat('calico')]);
    await loadPerchIds('u1');
    await loadPerchIds('u2');
    invalidatePerchSprites('u1');
    await loadPerchIds('u2');
    expect(mockGetCats).toHaveBeenCalledTimes(2); // u2's second read was cached
  });

  it('does not cache a rejected fetch, so the next read retries', async () => {
    // Caching a failure would blind a Hood for a full TTL after one flaky request.
    mockGetCats.mockRejectedValueOnce(new Error('offline'));
    await expect(loadPerchIds('u1')).rejects.toThrow('offline');
    mockGetCats.mockResolvedValue([cat('calico')]);
    expect(await loadPerchIds('u1')).toEqual(['calico']);
    expect(mockGetCats).toHaveBeenCalledTimes(2);
  });

  it('discards a fetch that was in flight across an invalidation', async () => {
    // Otherwise the pre-invalidation snapshot is written back with a fresh
    // timestamp, pinning the stale list for a full TTL.
    let release!: (v: unknown) => void;
    mockGetCats.mockReturnValueOnce(
      new Promise((res) => {
        release = res;
      }) as never,
    );

    const inFlight = loadPerchIds('u1');
    invalidatePerchSprites('u1');
    release([cat('stale')]);
    await inFlight;

    mockGetCats.mockResolvedValue([cat('fresh')]);
    expect(await loadPerchIds('u1')).toEqual(['fresh']);
    expect(mockGetCats).toHaveBeenCalledTimes(2);
  });

  it('revalidates once the TTL has expired', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    mockGetCats.mockResolvedValue([cat('old')]);
    await loadPerchIds('u1');

    jest.setSystemTime(5 * 60_000 + 1);
    mockGetCats.mockResolvedValue([cat('new')]);
    expect(await loadPerchIds('u1')).toEqual(['new']);
    expect(mockGetCats).toHaveBeenCalledTimes(2);
  });
});

describe('primePerchSprites', () => {
  it('appends to a cached list without triggering a refetch', async () => {
    mockGetCats.mockResolvedValue([cat('calico')]);
    await loadPerchIds('u1');

    primePerchSprites('u1', 'seal_point');

    expect(await loadPerchIds('u1')).toEqual(['calico', 'seal_point']);
    expect(mockGetCats).toHaveBeenCalledTimes(1);
  });

  it('puts the primed cat on perch 0, which is the point of priming', async () => {
    mockGetCats.mockResolvedValue([cat('calico'), cat('black_tuxedo')]);
    await loadPerchIds('u1');
    primePerchSprites('u1', 'seal_point');

    expect(buildPerchSprites(await loadPerchIds('u1'), 6)[0]).toBe('seal_point');
  });

  it('is a no-op with no cached entry, leaving the next read to fetch', async () => {
    primePerchSprites('u1', 'seal_point');
    mockGetCats.mockResolvedValue([cat('calico')]);
    expect(await loadPerchIds('u1')).toEqual(['calico']);
  });

  it('does not extend the entry\'s lifetime', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    mockGetCats.mockResolvedValue([cat('calico')]);
    await loadPerchIds('u1');

    jest.setSystemTime(4 * 60_000);
    primePerchSprites('u1', 'seal_point');

    // Priming preserves `at`, so the entry still expires on its original clock.
    jest.setSystemTime(5 * 60_000 + 1);
    mockGetCats.mockResolvedValue([cat('refetched')]);
    expect(await loadPerchIds('u1')).toEqual(['refetched']);
  });
});
