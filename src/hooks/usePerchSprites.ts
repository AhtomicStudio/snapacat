/**
 * Resolves which cat sprites to perch in a Hood.
 *
 * Shared by HoodScreen (own Hood) and FriendHoodScreen (a friend's), which
 * previously carried the same 25 lines twice and both missed the same two
 * things: a cache, and a reset when the uid changes.
 */
import { useEffect, useMemo, useState } from 'react';
import { getCats } from '../services/dbService';
import { MAX_HOOD_CATS } from '../utils/spawnCalculator';

interface CacheEntry {
  ids: string[];
  at: number;
}

/**
 * Sprite ids by uid, at module scope so it survives unmount.
 *
 * HoodScreen is returned from a top-level branch in App.tsx, so it unmounts
 * every time you leave and remounts with empty state every time you enter.
 * Without this, every visit re-fetched and held empty perches for the length of
 * a Firestore round trip.
 *
 * Entries are stale-while-revalidate rather than permanent. A permanent cache
 * broke the game's core loop: log a cat, open your Hood, and the cat is missing
 * because the list was fetched before it existed. Serving the cached list
 * immediately and revalidating past the TTL keeps entry instant while bounding
 * how long a Hood can lie — including a friend's Hood, where this side has no
 * invalidation point at all.
 */
const cache = new Map<string, CacheEntry>();

const TTL_MS = 5 * 60_000;

/**
 * Drops cached perches so the next read refetches.
 *
 * Call after the Cat-a-log changes. The TTL alone would surface a new cat
 * within five minutes; this makes the user's own cat appear immediately.
 */
export function invalidatePerchSprites(uid?: string): void {
  if (uid) cache.delete(uid);
  else cache.clear();
}

/** Exported for testing. */
export function isFresh(entry: CacheEntry | undefined, now = Date.now()): boolean {
  return entry !== undefined && now - entry.at < TTL_MS;
}

/**
 * Spreads the available cats across the perches.
 *
 * Exported for testing. Cycles when the Cat-a-log holds fewer cats than there
 * are perches — with a single logged cat there is no data-side fix and every
 * perch shows the same breed, which is why CatSprite takes a phase offset.
 */
export function buildPerchSprites(ids: string[], slots = MAX_HOOD_CATS): string[] {
  if (ids.length === 0) return [];
  return Array.from({ length: slots }, (_, i) => ids[i % ids.length]!);
}

export interface PerchSprites {
  /** One sprite id per perch, or [] when the Cat-a-log is empty. */
  perchSprites: string[];
  /** True until ids are known. Render empty perches, not a fallback. */
  loading: boolean;
}

export function usePerchSprites(uid: string): PerchSprites {
  // null means "not resolved yet" and is distinct from [] ("no cats").
  const [ids, setIds] = useState<string[] | null>(() => cache.get(uid)?.ids ?? null);

  useEffect(() => {
    let alive = true;
    const hit = cache.get(uid);

    // Serve whatever is cached straight away. Also resets on uid change — a
    // friend's Hood otherwise keeps showing the previous friend's cats.
    setIds(hit?.ids ?? null);

    if (!isFresh(hit)) {
      getCats(uid)
        .then((cats) => {
          const next = cats.map((c) => c.sprite_template_id).filter(Boolean);
          cache.set(uid, { ids: next, at: Date.now() });
          if (alive) setIds(next);
        })
        .catch((err) => {
          console.error(`Failed to load cats for ${uid}:`, err);
          // Resolve to empty rather than holding the perches forever.
          if (alive) setIds([]);
        });
    }

    return () => {
      alive = false;
    };
  }, [uid]);

  const perchSprites = useMemo(() => buildPerchSprites(ids ?? []), [ids]);

  return { perchSprites, loading: ids === null };
}
