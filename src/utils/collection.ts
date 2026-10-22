/**
 * The Cat-a-log as a COLLECTION rather than a list.
 *
 * WHY THE RESHAPE
 *
 * The screen used to render one card per cat you had logged. That is a
 * database view: it can only ever show you what you already have, so it has
 * nothing to say the moment you open it. A collection game runs on the empty
 * slots — the silhouette of a breed you have not met is the thing that makes
 * the next cat worth chasing, and the old screen had no way to show one.
 *
 * So the index is now the twenty breeds in SPRITE_LIBRARY, with your named cats
 * living inside whichever breed they belong to.
 *
 * NO SCHEMA CHANGE
 *
 * Worth being explicit, because it looks like there should be one: this is
 * derived entirely from data that already exists. Breeds come from the local
 * sprite library; cats come from Firestore already carrying
 * `sprite_template_id`. The grouping is client-side and the `cats` collection
 * is untouched.
 */

import type { Cat } from '../types';
import { SPRITE_LIBRARY, type SpriteDefinition, type SpriteRarity } from './spriteLibrary';

export interface CollectionEntry {
  breed: SpriteDefinition;
  /** True once at least one cat of this breed is in your Cat-a-log. */
  discovered: boolean;
  /** Your cats of this breed, most recently logged first. */
  cats: Cat[];
  /** Field Notes across every cat of this breed. */
  noteCount: number;
}

export interface CollectionProgress {
  found: number;
  total: number;
  /** 0–1, for the progress bar. */
  ratio: number;
  byRarity: Record<SpriteRarity, { found: number; total: number }>;
}

/**
 * Groups a Cat-a-log into breed entries, in the library's own order.
 *
 * Library order is the genetic taxonomy (tier 1 wild-types through tier 6
 * recessives), which is both stable and meaningful — sorting by discovery would
 * make the grid rearrange itself every time you logged a cat, and a collection
 * book whose pages move is not a book.
 */
export function buildCollection(cats: Cat[]): CollectionEntry[] {
  const byBreed = new Map<string, Cat[]>();
  for (const cat of cats) {
    const list = byBreed.get(cat.sprite_template_id);
    if (list) list.push(cat);
    else byBreed.set(cat.sprite_template_id, [cat]);
  }

  return SPRITE_LIBRARY.map((breed) => {
    // getCats returns oldest-first, so reversing puts the newest cat — the one
    // the player is most likely to be looking for — at the front.
    const mine = (byBreed.get(breed.id) ?? []).slice().reverse();
    return {
      breed,
      discovered: mine.length > 0,
      cats: mine,
      noteCount: mine.reduce((n, c) => n + c.scrapbook.length, 0),
    };
  });
}

/** Completion, overall and per rarity. */
export function collectionProgress(entries: CollectionEntry[]): CollectionProgress {
  const byRarity: Record<SpriteRarity, { found: number; total: number }> = {
    common: { found: 0, total: 0 },
    uncommon: { found: 0, total: 0 },
    rare: { found: 0, total: 0 },
  };

  let found = 0;
  for (const e of entries) {
    const bucket = byRarity[e.breed.rarity];
    bucket.total++;
    if (e.discovered) {
      bucket.found++;
      found++;
    }
  }

  const total = entries.length;
  return { found, total, ratio: total === 0 ? 0 : found / total, byRarity };
}

export type CollectionFilter = 'all' | 'found' | 'missing' | 'rare';

/** Applies a filter and a free-text query. Both are optional. */
export function filterCollection(
  entries: CollectionEntry[],
  filter: CollectionFilter,
  query = '',
): CollectionEntry[] {
  const q = query.trim().toLowerCase();

  return entries.filter((e) => {
    if (filter === 'found' && !e.discovered) return false;
    if (filter === 'missing' && e.discovered) return false;
    if (filter === 'rare' && e.breed.rarity !== 'rare') return false;

    if (!q) return true;

    // An undiscovered breed must NOT be searchable by its own name — being able
    // to type "calico" and have the mystery slot light up would give away the
    // thing the silhouette exists to withhold. Only your own cats' names and
    // breeds you have actually met are searchable.
    if (!e.discovered) return false;
    if (e.breed.label.toLowerCase().includes(q)) return true;
    return e.cats.some((c) => c.name.toLowerCase().includes(q));
  });
}

/**
 * What a card says underneath the name.
 *
 * Undiscovered entries deliberately carry NO behavioural hint. The design
 * mockup had one ("Likes shelter"), and it would have been a lie: spawn
 * chances are computed from item bonuses alone (see spawnCalculator) with no
 * per-breed affinity anywhere in the game. Rarity is a classification, not a
 * rate, so it cannot honestly be phrased as "rarely seen" either.
 *
 * The moment breed affinity actually exists, this is the one place that needs
 * to change.
 */
export function describeEntry(entry: CollectionEntry): string {
  if (!entry.discovered) return 'Not yet met';
  const lead = entry.cats[0];
  if (!lead) return 'Met';
  if (entry.noteCount === 0) return lead.name;
  return `${lead.name} · ${entry.noteCount} note${entry.noteCount === 1 ? '' : 's'}`;
}
