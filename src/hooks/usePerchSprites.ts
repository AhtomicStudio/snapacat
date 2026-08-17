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
 * Per-uid write generation, plus a separate counter for clear-all.
 *
 * Every mutation bumps its uid's generation, and a fetch records the stamp it
 * was issued under. A fetch whose stamp has moved was issued before whatever
 * moved it, so its result must not be cached — otherwise "open Hood (fetch
 * starts) → log a cat → fetch resolves" writes the pre-cat list back with a
 * fresh timestamp, pinning the stale list for a full TTL.
 *
 * Per-uid rather than a single global counter: a global one meant invalidating
 * a friend's entry also discarded an unrelated in-flight fetch for your own,
 * leaving your cache cold for no reason. clear-all needs its own counter
 * because it must void uids that have no generation entry yet.
 */
const generation = new Map<string, number>();
let clearGeneration = 0;

const stampOf = (uid: string): string => `${clearGeneration}:${generation.get(uid) ?? 0}`;

const bump = (uid: string): void => {
  generation.set(uid, (generation.get(uid) ?? 0) + 1);
};

/** Drops cached perches so the next read refetches. */
export function invalidatePerchSprites(uid?: string): void {
  if (uid) {
    cache.delete(uid);
    bump(uid);
  } else {
    cache.clear();
    clearGeneration++;
  }
}

/**
 * Folds a just-created cat into the cached list.
 *
 * Preferred over invalidating when the sprite id is already known: dropping the
 * entry guarantees a cold fetch on the *next* Hood entry, which is the one the
 * user is most likely to make immediately after logging a cat. `at` is
 * preserved so the entry still revalidates on its original schedule; this is a
 * local fast-path, not a claim of authority.
 */
export function primePerchSprites(uid: string, spriteId: string): void {
  const hit = cache.get(uid);
  // Bump unconditionally, and before the write. Any fetch already in flight was
  // issued before this cat existed, so its result must neither overwrite what
  // we prime nor — when there is nothing to prime — land as though current.
  bump(uid);
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
 * loop silently did nothing for anyone past their second cat.
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
 * caches, unless the uid's generation moved while the fetch was in flight.
 */
export async function loadPerchIds(uid: string): Promise<string[]> {
  const hit = cache.get(uid);
  // Copy so callers — including React state — can never alias the cached array.
  if (isFresh(hit)) return [...hit!.ids];

  const issuedAt = stampOf(uid);
  /**
   * Assumes getCats returns oldest-first: mock mode preserves insertion order,
   * and Firestore's default document-id order is chronological given cat ids
   * are `cat_${Date.now()}_${rand}`.
   *
   * This is load-bearing only on the cold-fetch fallback — process restart, TTL
   * expiry, or a prime that found no entry. Immediately after logging a cat,
   * primePerchSprites appends explicitly, so the newest cat reaching perch 0
   * does not depend on this. A `created_at` field on Cat would make it explicit.
   */
  const cats = await getCats(uid);
  const next = cats.map((c) => c.sprite_template_id).filter(Boolean);

  if (next.length !== cats.length) {
    console.warn(
      `[perches] ${cats.length - next.length} of ${uid}'s cats have no sprite_template_id and were skipped.`,
    );
  }

  if (stampOf(uid) === issuedAt) cache.set(uid, { ids: next, at: Date.now() });
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
        // Resolve to empty rather than holding the perches forever. The cache
        // is deliberately NOT written on failure, so the next visit retries
        // instead of blinding the Hood for a full TTL.
        if (alive) setIds([]);
      });

    return () => {
      alive = false;
    };
  }, [uid]);

  const perchSprites = useMemo(() => buildPerchSprites(ids ?? []), [ids]);

  return { perchSprites, loading: ids === null };
}
