/**
 * Resolves which cat sprites to perch in a Hood.
 *
 * Shared by HoodScreen (own Hood) and FriendHoodScreen (a friend's), which
 * previously carried the same logic twice and both missed a cache and a reset
 * when the uid changed.
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
 * broke the core loop: log a cat, open your Hood, and the cat is missing
 * because the list was fetched before it existed.
 */
const cache = new Map<string, CacheEntry>();

const TTL_MS = 5 * 60_000;

/**
 * Bumped on every invalidation so a fetch that was in flight across one can be
 * recognised and discarded.
 *
 * Without this, the sequence "open Hood (fetch starts) → leave → log a cat
 * (invalidate) → fetch resolves" writes the pre-cat list back with a fresh
 * timestamp, resurrecting the exact staleness bug the TTL exists to prevent,
 * and pinning it for a full TTL.
 */
let epoch = 0;

/** Drops cached perches so the next read refetches. */
export function invalidatePerchSprites(uid?: string): void {
  epoch++;
  if (uid) cache.delete(uid);
  else cache.clear();
}

/**
 * Folds a just-created cat into the cached list.
 *
 * Preferred over invalidating when the sprite id is already known: dropping the
 * entry guarantees a cold fetch on the *next* Hood entry, which is the one the
 * user is most likely to make immediately after logging a cat — so plain
 * invalidation reintroduces the empty-perch wait exactly when it is most
 * visible. `at` is deliberately preserved so the entry still revalidates on its
 * original schedule; this is a local fast-path, not a claim of authority.
 */
export function primePerchSprites(uid: string, spriteId: string): void {
  const hit = cache.get(uid);
  // No entry means nothing to prime — the next read fetches, which is correct.
  if (!hit) return;
  cache.set(uid, { ids: [...hit.ids, spriteId], at: hit.at });
}

/** Exported for testing. */
export function isFresh(entry: CacheEntry | undefined, now = Date.now()): boolean {
  return entry !== undefined && now - entry.at < TTL_MS;
}

/**
 * Chooses which cats occupy the perches, newest first.
 *
 * Order is not cosmetic. `expectedCats` is derived from the Hood's spawn rate,
 * and an undecorated Hood yields `round(0.30 * 6) = 2` — so only perches 0 and
 * 1 render. Returning cats oldest-first meant a newly logged cat landed on a
 * perch that does not exist yet, and the whole "log a cat, see it in your Hood"
 * loop silently did nothing for any user past their second cat.
 *
 * Exported for testing.
 */
export function buildPerchSprites(ids: string[], slots = MAX_HOOD_CATS): string[] {
  if (ids.length === 0) return [];
  const recent = ids.slice(-slots).reverse();
  return Array.from({ length: slots }, (_, i) => recent[i % recent.length]!);
}

/**
 * The cache half of the hook, without React, so it can be tested directly.
 *
 * Serves a fresh entry without touching the network; otherwise fetches and
 * caches, unless an invalidation happened while the fetch was in flight.
 */
export async function loadPerchIds(uid: string): Promise<string[]> {
  const hit = cache.get(uid);
  if (isFresh(hit)) return hit!.ids;

  const issuedAt = epoch;
  // Relies on getCats returning oldest-first: mock mode preserves insertion
  // order, and Firestore's default document-id order is chronological given
  // cat ids are `cat_${Date.now()}_${rand}`. buildPerchSprites takes the tail,
  // so if that ever stops holding, the newest cat stops reaching perch 0 —
  // silently. A created_at field would make it explicit.
  const cats = await getCats(uid);
  const next = cats.map((c) => c.sprite_template_id).filter(Boolean);

  // A fetch that crossed an invalidation predates whatever caused it. Showing
  // it is fine; caching it is how the staleness bug comes back.
  if (epoch === issuedAt) cache.set(uid, { ids: next, at: Date.now() });
  return next;
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
    // Serve whatever is cached straight away. Also resets on uid change — a
    // friend's Hood otherwise keeps showing the previous friend's cats.
    setIds(cache.get(uid)?.ids ?? null);

    loadPerchIds(uid)
      .then((next) => {
        if (alive) setIds(next);
      })
      .catch((err) => {
        console.error(`Failed to load cats for ${uid}:`, err);
        // Resolve to empty rather than holding the perches forever. Note the
        // cache is deliberately NOT written on failure, so the next visit
        // retries instead of blinding the Hood for a full TTL.
        if (alive) setIds([]);
      });

    return () => {
      alive = false;
    };
  }, [uid]);

  const perchSprites = useMemo(() => buildPerchSprites(ids ?? []), [ids]);

  return { perchSprites, loading: ids === null };
}
