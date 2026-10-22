import {
  ANCHOR_COUNT,
  buildAnchors,
  hashSeed,
  layoutScene,
  paintOrder,
  planeScale,
  planeX,
  planeY,
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
