import {
  ANCHOR_COUNT,
  buildAnchors,
  hashSeed,
  layoutScene,
  paintOrder,
  planeScale,
  planeX,
  planeY,
  ZONE_DEPTH,
  ZONE_U,
} from '../scene';
import { MAX_HOOD_CATS } from '../../utils/spawnCalculator';

describe('plane projection', () => {
  it('puts far things higher on screen than near things', () => {
    expect(planeY(0)).toBeLessThan(planeY(1));
  });

  it('keeps everything inside the frame', () => {
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      expect(planeY(d)).toBeGreaterThan(0);
      expect(planeY(d)).toBeLessThan(1);
      expect(planeX(0, d)).toBeGreaterThan(0);
      expect(planeX(1, d)).toBeLessThan(1);
    }
  });

  it('scales far things smaller', () => {
    expect(planeScale(0)).toBeLessThan(planeScale(1));
  });

  /**
   * The three depth cues have to agree. If scale rose while y fell, a "distant"
   * cat would be drawn large and high — which reads as a bug, not as distance.
   */
  it('moves scale and vertical position together', () => {
    let lastY = -Infinity;
    let lastScale = -Infinity;
    for (let d = 0; d <= 1; d += 0.1) {
      expect(planeY(d)).toBeGreaterThan(lastY);
      expect(planeScale(d)).toBeGreaterThan(lastScale);
      lastY = planeY(d);
      lastScale = planeScale(d);
    }
  });

  it('narrows the plane toward the horizon', () => {
    const nearWidth = planeX(1, 1) - planeX(0, 1);
    const farWidth = planeX(1, 0) - planeX(0, 0);
    expect(farWidth).toBeLessThan(nearWidth);
  });
});

describe('anchors', () => {
  it('is deterministic for a given Hood', () => {
    const a = buildAnchors(hashSeed('hood_alpha'));
    const b = buildAnchors(hashSeed('hood_alpha'));
    expect(a).toEqual(b);
  });

  it('lays out different Hoods differently', () => {
    const a = buildAnchors(hashSeed('hood_alpha'));
    const b = buildAnchors(hashSeed('hood_beta'));
    expect(a).not.toEqual(b);
  });

  it('always has room for the full cat cap', () => {
    expect(ANCHOR_COUNT).toBeGreaterThanOrEqual(MAX_HOOD_CATS);
  });
});

describe('layoutScene', () => {
  const base = { hoodId: 'hood_alpha', placedItems: [] as string[], catCount: 0 };

  it('is stable across calls, so returning to a Hood is not a reshuffle', () => {
    const input = { ...base, placedItems: ['item_kibble_bowl', 'item_toy_mouse'], catCount: 3 };
    expect(layoutScene(input)).toEqual(layoutScene(input));
  });

  it('never puts two things at the same spot', () => {
    const layout = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl', 'item_toy_mouse', 'item_flower_pot'],
      catCount: MAX_HOOD_CATS,
    });
    const spots = [...layout.items, ...layout.cats].map((p) => `${p.x.toFixed(4)}:${p.y.toFixed(4)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  /**
   * The core loop made visible: you put a bowl out, a cat turns up at the bowl.
   * If cats stopped attaching to items, placing something would have no visible
   * consequence and the whole decorating system would go quiet.
   */
  it('seats cats at items before using bare ground', () => {
    const layout = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl', 'item_toy_mouse'],
      catCount: 2,
    });
    expect(layout.cats.every((c) => c.atItemId !== null)).toBe(true);
    expect(new Set(layout.cats.map((c) => c.atItemId))).toEqual(
      new Set(['item_kibble_bowl', 'item_toy_mouse']),
    );
  });

  /**
   * The other half of the same loop, for the things the player did NOT put
   * there. A Hood with two items and six cats spends most of its life with
   * four cats standing on open asphalt, which is what made the scenery read
   * as painted on the backdrop: nothing ever went near it.
   */
  it('seats spare cats at the scenery before using bare ground', () => {
    const scenery = [
      { id: 'scenery_crates', u: 0.6, depth: 0.14 },
      { id: 'scenery_bin', u: 0.2, depth: 0.2 },
    ];
    const layout = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl'],
      catCount: 3,
      scenery,
    });

    const atScenery = layout.cats.filter((c) => c.atSceneryId !== null);
    expect(atScenery).toHaveLength(2);
    // Nearest prop first, as items are: an occupied look is worth most at
    // the visible end of the plane.
    expect(atScenery[0]!.atSceneryId).toBe('scenery_bin');
    // And in front of the prop, or the cat is hidden behind the thing it
    // came for.
    expect(atScenery[0]!.z).toBeGreaterThan(0.2);
  });

  const HOODS = ['hood_alpha', 'hood_beta', 'hood_gamma', 'hood_delta', 'hood_eps'];

  /**
   * Scenery sits at fixed coordinates while anchors are seeded, so the two
   * lattices eventually collide — caught on the alley, where a cat at the
   * right-hand bin drew on top of a cat at the item beside it and the pair
   * read as one two-headed sprite.
   */
  it('skips a prop that would stack a cat on something already there', () => {
    const scenery = [
      { id: 'scenery_bin', u: 0.5, depth: 0.2 },
      { id: 'scenery_crates', u: 0.5, depth: 0.2 },
    ];
    for (const hoodId of HOODS) {
      const layout = layoutScene({ hoodId, placedItems: [], catCount: 4, scenery });
      const cats = layout.cats.filter((c) => c.atSceneryId !== null);
      // Two props in the same place can only seat one cat between them.
      expect(cats.length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every cat at the scenery clear of everything else', () => {
    // The real alley coordinates, which is where the overlap turned up.
    const scenery = [
      { id: 'scenery_bin', u: 0.12, depth: 0.2 },
      { id: 'scenery_crates', u: 0.56, depth: 0.14 },
      { id: 'scenery_bin', u: 0.86, depth: 0.26 },
    ];
    for (const hoodId of HOODS) {
      for (let catCount = 1; catCount <= 6; catCount++) {
        const layout = layoutScene({
          hoodId,
          placedItems: ['item_kibble_bowl', 'item_toy_mouse'],
          catCount,
          scenery,
        });
        const others = [...layout.items, ...layout.cats];
        for (const cat of layout.cats) {
          if (cat.atSceneryId === null) continue;
          for (const other of others) {
            if (other === cat) continue;
            const clash =
              Math.abs(other.x - cat.x) < 0.06 && Math.abs(other.y - cat.y) < 0.035;
            expect(clash).toBe(false);
          }
        }
      }
    }
  });

  it('does not let two cats drift into each other', () => {
    /**
     * The clearance above is about where cats STAND, and that was never the
     * whole story: a cat then wanders up to its zone in every direction, and
     * on the Back Alley at six cats the drift was as big as the gap. Two of
     * the fifteen pairs could close to inside the clearance box without
     * either cat doing anything unusual, which on screen is one cat drawn
     * over another.
     *
     * This asserts the guarantee the clearance was assumed to give: take the
     * worst case, both cats of a pair spending their whole budget straight at
     * one another, and require that at least one axis still holds them apart.
     */
    const scenery = [
      { id: 'scenery_bin', u: 0.12, depth: 0.2 },
      { id: 'scenery_crates', u: 0.56, depth: 0.14 },
      { id: 'scenery_bin', u: 0.86, depth: 0.26 },
    ];
    const reach = (depth: number) => ({
      x: Math.abs(planeX(0.5 + ZONE_U, depth) - planeX(0.5, depth)),
      y: Math.abs(planeY(Math.min(1, depth + ZONE_DEPTH)) - planeY(depth)),
    });

    for (const hoodId of HOODS) {
      for (let catCount = 1; catCount <= 6; catCount++) {
        const { cats } = layoutScene({
          hoodId,
          placedItems: ['item_kibble_bowl', 'item_toy_mouse'],
          catCount,
          scenery,
        });
        for (let i = 0; i < cats.length; i++) {
          for (let j = i + 1; j < cats.length; j++) {
            const a = cats[i]!;
            const b = cats[j]!;
            // A pair the placement loop had to stack has nothing to protect;
            // a smaller zone cannot unstack it.
            const stacked =
              Math.abs(a.x - b.x) < 0.06 && Math.abs(a.y - b.y) < 0.035;
            if (stacked) continue;

            const ra = reach(a.z);
            const rb = reach(b.z);
            const closestX =
              Math.abs(a.x - b.x) - ra.x * a.zone - rb.x * b.zone;
            const closestY =
              Math.abs(a.y - b.y) - ra.y * a.zone - rb.y * b.zone;
            const canMeet = closestX < 0.06 && closestY < 0.035;
            expect({ hoodId, catCount, pair: [a.key, b.key], canMeet }).toEqual({
              hoodId,
              catCount,
              pair: [a.key, b.key],
              canMeet: false,
            });
          }
        }
      }
    }
  });

  it('only shrinks the zone of a cat that needs it', () => {
    // A lone cat has nobody to avoid, so nothing should be taken off it —
    // the fix must not quietly make every Hood calmer than it was.
    const { cats } = layoutScene({
      hoodId: 'hood_parking_lot',
      placedItems: ['item_kibble_bowl'],
      catCount: 1,
    });
    expect(cats[0]!.zone).toBe(1);
  });

  /**
   * The wander budget only separates cats that stay in their own zones. A cat
   * that leaves walks the whole width of the plane at a fixed depth, and the
   * budget says nothing at all about the middle of that journey — so the
   * clearance has to be checked along the path instead, before the cat is
   * given one.
   *
   * Checked as a vertical gap rather than by sampling the path, because the
   * walk passes through every x between the cat and the edge: at some point
   * its x IS the other cat's x, so nothing but the gap in depth can keep the
   * pair legible.
   */
  it('never sends a cat out across another cat', () => {
    const scenery = [
      { id: 'scenery_bin', u: 0.12, depth: 0.2 },
      { id: 'scenery_crates', u: 0.56, depth: 0.14 },
      { id: 'scenery_bin', u: 0.86, depth: 0.26 },
    ];
    const reach = (depth: number) =>
      Math.abs(planeY(Math.min(1, depth + ZONE_DEPTH)) - planeY(depth));

    for (const hoodId of HOODS) {
      for (let catCount = 1; catCount <= 6; catCount++) {
        const { cats } = layoutScene({
          hoodId,
          placedItems: ['item_kibble_bowl', 'item_toy_mouse'],
          catCount,
          scenery,
        });
        for (const cat of cats) {
          if (cat.exitSpan === null) continue;
          const towardLeft = cat.exitSpan < 0;
          for (const other of cats) {
            if (other === cat) continue;
            if (towardLeft ? other.x > cat.x : other.x < cat.x) continue;
            const gap =
              Math.abs(cat.y - other.y) -
              reach(cat.z) * cat.zone -
              reach(other.z) * other.zone;
            expect({
              hoodId,
              catCount,
              walker: cat.key,
              passing: other.key,
              clear: gap >= 0.035,
            }).toEqual({
              hoodId,
              catCount,
              walker: cat.key,
              passing: other.key,
              clear: true,
            });
          }
        }
      }
    }
  });

  it('leaves by the nearer edge, and walks past it rather than to it', () => {
    // A cat alone has nobody to get past, so it should take the short way
    // out — and it has to end up offstage, or it would stop in full view and
    // dissolve where the player can watch it happen.
    for (const hoodId of HOODS) {
      const { cats } = layoutScene({
        hoodId,
        placedItems: ['item_kibble_bowl'],
        catCount: 1,
      });
      const cat = cats[0]!;
      expect(cat.exitSpan).not.toBeNull();
      expect(cat.exitSpan! < 0).toBe(cat.x < 0.5);
      const arrivesAt = cat.x + cat.exitSpan!;
      expect(arrivesAt < 0 || arrivesAt > 1).toBe(true);
    }
  });

  it('leaves the layout alone when the environment has no scenery', () => {
    const bare = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl'],
      catCount: 3,
    });
    const empty = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl'],
      catCount: 3,
      scenery: [],
    });
    expect(empty.cats).toEqual(bare.cats);
  });

  it('spreads surplus cats onto bare ground', () => {
    const layout = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl'],
      catCount: 3,
    });
    expect(layout.cats).toHaveLength(3);
    expect(layout.cats.filter((c) => c.atItemId !== null)).toHaveLength(1);
    expect(layout.cats.filter((c) => c.atItemId === null)).toHaveLength(2);
  });

  /**
   * A cat behind the bowl it came for looks like a rendering mistake. Being one
   * step nearer the camera is what puts it in front in paint order.
   */
  it('paints a cat in front of the item it came for', () => {
    const layout = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl'],
      catCount: 1,
    });
    const cat = layout.cats[0]!;
    const item = layout.items[0]!;
    expect(cat.z).toBeGreaterThan(item.z);
  });

  it('reports items it had no room to draw', () => {
    const tooMany = Array.from({ length: ANCHOR_COUNT + 4 }, () => 'item_flower_pot');
    const layout = layoutScene({ hoodId: 'hood_alpha', placedItems: tooMany, catCount: 0 });
    expect(layout.items).toHaveLength(ANCHOR_COUNT);
    expect(layout.hiddenItemCount).toBe(4);
  });

  it('draws every item when there is room', () => {
    const layout = layoutScene({
      hoodId: 'hood_alpha',
      placedItems: ['item_kibble_bowl', 'item_toy_mouse'],
      catCount: 0,
    });
    expect(layout.hiddenItemCount).toBe(0);
  });

  it('handles an empty Hood', () => {
    const layout = layoutScene(base);
    expect(layout.items).toEqual([]);
    expect(layout.cats).toEqual([]);
  });
});

describe('paintOrder', () => {
  it('returns everything, back to front', () => {
    const layout = layoutScene({
      hoodId: 'hood_beta',
      placedItems: ['item_kibble_bowl', 'item_toy_mouse', 'item_cat_bed'],
      catCount: 4,
    });
    const ordered = paintOrder(layout);

    expect(ordered).toHaveLength(layout.items.length + layout.cats.length);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.placement.z).toBeGreaterThanOrEqual(ordered[i - 1]!.placement.z);
    }
  });
});
