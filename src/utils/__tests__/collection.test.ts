import {
  buildCollection,
  collectionProgress,
  filterCollection,
  describeEntry,
} from '../collection';
import { SPRITE_LIBRARY } from '../spriteLibrary';
import type { Cat, ScrapbookEntry } from '../../types';

function note(catId: string): ScrapbookEntry {
  return {
    sighting_id: `s_${Math.random()}`,
    user_id: 'user_alice',
    cat_id: catId,
    timestamp: { seconds: 0, nanoseconds: 0 } as ScrapbookEntry['timestamp'],
    hood_name: 'Back Alley',
    note_text: '',
    extracted_colors: [],
  };
}

function cat(name: string, breedId: string, notes = 0): Cat {
  const id = `cat_${name}`;
  return {
    cat_id: id,
    owner_uid: 'user_alice',
    name,
    gender: 'unknown',
    sprite_template_id: breedId,
    scrapbook: Array.from({ length: notes }, () => note(id)),
  };
}

const BREED_A = SPRITE_LIBRARY[0]!.id;
const BREED_B = SPRITE_LIBRARY[1]!.id;

describe('buildCollection', () => {
  it('returns one entry per breed, always', () => {
    expect(buildCollection([])).toHaveLength(SPRITE_LIBRARY.length);
    expect(buildCollection([cat('Mochi', BREED_A)])).toHaveLength(SPRITE_LIBRARY.length);
  });

  /**
   * The whole point of the reshape: an empty Cat-a-log still has twenty things
   * to show you. The old screen rendered nothing at all.
   */
  it('shows every breed as undiscovered when you have no cats', () => {
    const entries = buildCollection([]);
    expect(entries.every((e) => !e.discovered)).toBe(true);
    expect(entries.every((e) => e.cats.length === 0)).toBe(true);
  });

  it('marks a breed discovered once any cat of it is logged', () => {
    const entries = buildCollection([cat('Mochi', BREED_A)]);
    const a = entries.find((e) => e.breed.id === BREED_A)!;
    const b = entries.find((e) => e.breed.id === BREED_B)!;
    expect(a.discovered).toBe(true);
    expect(b.discovered).toBe(false);
  });

  it('groups several cats of one breed together', () => {
    const entries = buildCollection([cat('Mochi', BREED_A), cat('Socks', BREED_A)]);
    const a = entries.find((e) => e.breed.id === BREED_A)!;
    expect(a.cats.map((c) => c.name).sort()).toEqual(['Mochi', 'Socks']);
  });

  /** Newest first, matching how perches order cats — the cat you just logged. */
  it('puts the most recently logged cat first', () => {
    const entries = buildCollection([cat('Older', BREED_A), cat('Newer', BREED_A)]);
    const a = entries.find((e) => e.breed.id === BREED_A)!;
    expect(a.cats[0]!.name).toBe('Newer');
  });

  it('totals Field Notes across every cat of a breed', () => {
    const entries = buildCollection([cat('Mochi', BREED_A, 2), cat('Socks', BREED_A, 3)]);
    expect(entries.find((e) => e.breed.id === BREED_A)!.noteCount).toBe(5);
  });

  it('ignores a cat whose breed is not in the library', () => {
    const entries = buildCollection([cat('Ghost', 'no_such_breed')]);
    expect(entries.every((e) => !e.discovered)).toBe(true);
  });

  it('keeps library order, so the grid never rearranges itself', () => {
    const ids = buildCollection([cat('Mochi', BREED_B)]).map((e) => e.breed.id);
    expect(ids).toEqual(SPRITE_LIBRARY.map((b) => b.id));
  });
});

describe('collectionProgress', () => {
  it('counts nothing found for an empty Cat-a-log', () => {
    const p = collectionProgress(buildCollection([]));
    expect(p.found).toBe(0);
    expect(p.total).toBe(SPRITE_LIBRARY.length);
    expect(p.ratio).toBe(0);
  });

  it('counts a breed once however many cats of it you have', () => {
    const p = collectionProgress(
      buildCollection([cat('Mochi', BREED_A), cat('Socks', BREED_A)]),
    );
    expect(p.found).toBe(1);
  });

  it('splits totals by rarity, and the parts sum to the whole', () => {
    const p = collectionProgress(buildCollection([]));
    const totals = Object.values(p.byRarity).reduce((n, r) => n + r.total, 0);
    expect(totals).toBe(SPRITE_LIBRARY.length);
  });
});

describe('filterCollection', () => {
  const entries = buildCollection([cat('Mochi', BREED_A, 1)]);

  it('all returns everything', () => {
    expect(filterCollection(entries, 'all')).toHaveLength(SPRITE_LIBRARY.length);
  });

  it('found returns only discovered breeds', () => {
    const found = filterCollection(entries, 'found');
    expect(found).toHaveLength(1);
    expect(found[0]!.breed.id).toBe(BREED_A);
  });

  it('missing returns everything else', () => {
    expect(filterCollection(entries, 'missing')).toHaveLength(SPRITE_LIBRARY.length - 1);
  });

  it('rare returns only rare breeds', () => {
    const rare = filterCollection(entries, 'rare');
    expect(rare.every((e) => e.breed.rarity === 'rare')).toBe(true);
    expect(rare.length).toBeGreaterThan(0);
  });

  it('searches your cats by name', () => {
    expect(filterCollection(entries, 'all', 'mochi')).toHaveLength(1);
    expect(filterCollection(entries, 'all', 'nobody')).toHaveLength(0);
  });

  /**
   * Load-bearing: typing a breed name must not reveal a breed you have not met.
   * The silhouette exists to withhold exactly that.
   */
  it('never surfaces an undiscovered breed by name', () => {
    const undiscovered = SPRITE_LIBRARY.find((b) => b.id !== BREED_A)!;
    const hits = filterCollection(entries, 'all', undiscovered.label);
    expect(hits.every((e) => e.discovered)).toBe(true);
  });

  it('searches breeds you have met', () => {
    const label = SPRITE_LIBRARY[0]!.label;
    expect(filterCollection(entries, 'all', label)).toHaveLength(1);
  });
});

describe('describeEntry', () => {
  it('says nothing revealing about an undiscovered breed', () => {
    const entry = buildCollection([]).find((e) => e.breed.id === BREED_A)!;
    expect(describeEntry(entry)).toBe('Not yet met');
  });

  it('names your cat once met', () => {
    const entry = buildCollection([cat('Mochi', BREED_A)]).find((e) => e.breed.id === BREED_A)!;
    expect(describeEntry(entry)).toBe('Mochi');
  });

  it('counts notes, pluralised', () => {
    const one = buildCollection([cat('Mochi', BREED_A, 1)]).find((e) => e.breed.id === BREED_A)!;
    const two = buildCollection([cat('Mochi', BREED_A, 2)]).find((e) => e.breed.id === BREED_A)!;
    expect(describeEntry(one)).toBe('Mochi · 1 note');
    expect(describeEntry(two)).toBe('Mochi · 2 notes');
  });
});
