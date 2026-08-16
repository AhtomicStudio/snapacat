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

/**
 * Sprite ids by uid, at module scope so it survives unmount.
 *
 * HoodScreen is returned from a top-level branch in App.tsx, so it unmounts
 * every time you leave and remounts with empty state every time you enter.
 * Without this, every single visit re-fetched and showed placeholder perches
 * for the length of a Firestore round trip.
 */
const cache = new Map<string, string[]>();

/** Clears cached perches for a uid — call after the Cat-a-log changes. */
export function invalidatePerchSprites(uid?: string): void {
  if (uid) cache.delete(uid);
  else cache.clear();
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
  /** True until the first fetch resolves. Render empty perches, not a fallback. */
  loading: boolean;
}

export function usePerchSprites(uid: string): PerchSprites {
  // null means "not resolved yet" and is distinct from [] ("no cats").
  const [ids, setIds] = useState<string[] | null>(() => cache.get(uid) ?? null);

  useEffect(() => {
    let alive = true;
    // Reset on uid change, or a friend's Hood keeps showing the previous
    // friend's cats until the new fetch resolves.
    setIds(cache.get(uid) ?? null);

    getCats(uid)
      .then((cats) => {
        const next = cats.map((c) => c.sprite_template_id).filter(Boolean);
        cache.set(uid, next);
        if (alive) setIds(next);
      })
      .catch((err) => {
        console.error(`Failed to load cats for ${uid}:`, err);
        // Resolve to empty rather than staying loading forever.
        if (alive) setIds([]);
      });

    return () => {
      alive = false;
    };
  }, [uid]);

  const perchSprites = useMemo(() => buildPerchSprites(ids ?? []), [ids]);

  return { perchSprites, loading: ids === null };
}
