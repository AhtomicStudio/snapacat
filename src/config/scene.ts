/**
 * Ground-plane layout for The Hood scene.
 *
 * Everything in this module is pure and expressed as fractions of the scene
 * box, so it is testable without a renderer and independent of device size.
 *
 * THE STAGE
 *
 * The Hood is a shallow 2.5D stage: a horizon line with a ground plane below
 * it. A point on that plane has a DEPTH in [0,1] — 0 at the horizon (far), 1 at
 * the front edge (near). Depth drives three things at once, and they have to
 * agree or the illusion collapses:
 *
 *   1. vertical position — far things sit higher on screen
 *   2. scale             — far things are smaller
 *   3. paint order       — far things are painted first, so near things occlude
 *
 * Occlusion is what actually sells it. Six cats in a row on a flat colour band
 * read as a sprite sheet; two cats where the near one clips the far one read as
 * a place. That was the single biggest thing separating the old canvas from the
 * feel we're after.
 *
 * WHY ANCHORS RATHER THAN RANDOM SCATTER
 *
 * Pure random placement clumps and overlaps badly at small n. Instead the plane
 * carries a fixed lattice of anchors, jittered by a per-Hood seed. Two
 * consequences worth keeping:
 *
 *   - the same Hood always lays out identically, so returning to it feels like
 *     returning to a room rather than reshuffling a deck
 *   - different Hoods look genuinely different from each other
 *
 * CATS SIT AT ITEMS
 *
 * A cat is drawn beside the item it came for, one step nearer the camera so it
 * paints in front. That is the whole loop made visible: you place a bowl, a cat
 * turns up at the bowl. An item with nobody at it reads as an invitation.
 */

// ---------------------------------------------------------------------------
// Stage constants
// ---------------------------------------------------------------------------

/**
 * How many screens wide the world is.
 *
 * A Hood confined to one viewport is cramped: six cats and a dozen goodies on
 * a single screen leaves everything shoulder to shoulder, and the perspective
 * plane has no room to breathe laterally. Making the world wider than the
 * window and letting the player pan across it buys space without shrinking
 * anything, and turns "what's over there" into a reason to drag.
 *
 * All X coordinates below are fractions of the WORLD, not of the viewport.
 */
export const WORLD_WIDTHS = 2.4;

/** Fraction of scene height occupied by sky. The ground plane starts here. */
export const HORIZON = 0.42;

/**
 * Ground plane extent, as fractions of scene height.
 *
 * The near edge stops well short of the bottom: the drawer peek and the
 * floating buttons own the last chunk of the screen, and cats placed under
 * them were unreachable and half-hidden behind a Shop button.
 */
const GROUND_TOP = HORIZON + 0.05;
const GROUND_BOTTOM = 0.76;

/** Sprite scale at the near and far edges of the plane. */
const NEAR_SCALE = 1.0;
const FAR_SCALE = 0.52;

/**
 * How much the plane narrows toward the horizon. 1.0 would be a flat band with
 * no perspective; 0 would collapse the far edge to a single point. 0.44 reads
 * as a real recession without making far anchors uselessly cramped.
 */
const CONVERGENCE = 0.44;

/** Lateral inset so nothing at the near edge runs off the world's edges. */
const SIDE_MARGIN = 0.05;

// ---------------------------------------------------------------------------
// Anchor lattice
// ---------------------------------------------------------------------------

/**
 * Depth bands, back to front. Uneven spacing on purpose — evenly spaced bands
 * read as a grid, and the eye picks that up immediately.
 */
const DEPTH_BANDS = [0.10, 0.38, 0.72] as const;

/**
 * Anchors per band. Fewer at the back, where the plane is narrowest.
 *
 * Scaled up with WORLD_WIDTHS — a world two and a half screens wide with only
 * ten anchors would just be the same crowd with more empty ground around it.
 */
const ANCHORS_PER_BAND = [5, 7, 5] as const;

/**
 * Total anchors on the plane. This is the cap on how many things the scene can
 * show at once: items beyond it are still placed (they still count toward spawn
 * chances) but are not drawn. With MAX_HOOD_CATS at 6 there is always room for
 * every cat.
 */
export const ANCHOR_COUNT = ANCHORS_PER_BAND.reduce((a, b) => a + b, 0);

export interface Anchor {
  /** Stable id. Placements key off this so a re-render never reshuffles. */
  id: string;
  /** Lateral position across the plane, 0 (left) … 1 (right), pre-perspective. */
  u: number;
  /** 0 = horizon (far) … 1 = foreground (near). */
  depth: number;
}

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/** FNV-1a. Stable across platforms, unlike anything built on Math.random. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** xorshift-derived value in [0,1) from a seed and a salt. */
function noise(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 0x9e3779b9, 2654435761)) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;  x >>>= 0;
  return x / 4294967296;
}

/** Symmetric jitter in [-amount, +amount]. */
function jitter(seed: number, salt: number, amount: number): number {
  return (noise(seed, salt) * 2 - 1) * amount;
}

// ---------------------------------------------------------------------------
// Plane projection
// ---------------------------------------------------------------------------

/** Vertical screen position (fraction of height) of a point's BASE — its feet. */
export function planeY(depth: number): number {
  return GROUND_TOP + clamp01(depth) * (GROUND_BOTTOM - GROUND_TOP);
}

/**
 * Horizontal position as a fraction of the WORLD width (not the viewport),
 * narrowing toward the horizon.
 *
 * Convergence is applied about the world's centre, so the vanishing point sits
 * in the middle of the Hood rather than wherever the camera happens to be
 * looking. Anchoring it to the viewport instead would make the perspective
 * shear as you panned, which reads as the world bending.
 */
export function planeX(u: number, depth: number): number {
  const spread = CONVERGENCE + (1 - CONVERGENCE) * clamp01(depth);
  const usable = 1 - SIDE_MARGIN * 2;
  return 0.5 + (clamp01(u) - 0.5) * usable * spread;
}

/** Sprite scale multiplier at a given depth. */
export function planeScale(depth: number): number {
  return FAR_SCALE + clamp01(depth) * (NEAR_SCALE - FAR_SCALE);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// Anchors for a Hood
// ---------------------------------------------------------------------------

/**
 * Builds this Hood's anchor lattice, jittered by seed.
 *
 * Returned in a seed-dependent order rather than back-to-front, so that a Hood
 * with two items doesn't always put them in the same corner as every other
 * Hood with two items. Paint order is decided later, from depth.
 */
export function buildAnchors(seed: number): Anchor[] {
  const anchors: Anchor[] = [];
  let n = 0;

  DEPTH_BANDS.forEach((bandDepth, band) => {
    const count = ANCHORS_PER_BAND[band]!;
    for (let i = 0; i < count; i++) {
      // Spread across the band with a half-step inset, so no anchor sits hard
      // against the edge and adjacent bands stagger rather than align.
      const u = (i + 0.5) / count + jitter(seed, n * 7 + 1, 0.5 / count);
      const depth = bandDepth + jitter(seed, n * 7 + 2, 0.06);
      anchors.push({ id: `a${band}_${i}`, u: clamp01(u), depth: clamp01(depth) });
      n++;
    }
  });

  return shuffle(anchors, seed);
}

/** Fisher-Yates driven by the seed, so the order is stable per Hood. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(noise(seed, i * 31 + 5) * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface Placement {
  /** Stable React key. */
  key: string;
  /** Fraction of scene width — the sprite's horizontal centre. */
  x: number;
  /** Fraction of scene height — the sprite's BASE (feet), not its centre. */
  y: number;
  /** Multiplier on the sprite's nominal size. */
  scale: number;
  /** Paint order. Larger paints later, i.e. nearer the viewer. */
  z: number;
}

export interface ItemPlacement extends Placement {
  itemId: string;
  anchorId: string;
}

export interface CatPlacement extends Placement {
  /** Index into the perch-sprite list. */
  slot: number;
  /** The item this cat turned up for, if any. Drives the tap-a-cat blurb. */
  atItemId: string | null;
}

export interface SceneLayout {
  items: ItemPlacement[];
  cats: CatPlacement[];
  /** Items that were placed but had no anchor left to draw them at. */
  hiddenItemCount: number;
}

/**
 * How far in front of its item a cat stands, in depth units. Small — the cat
 * should read as being AT the bowl, not a pace in front of it — but non-zero,
 * because it is what puts the cat's paint order above the item's.
 */
const CAT_FORWARD_STEP = 0.045;

/** Lateral offset of a cat from its item, so the two don't sit dead centre. */
const CAT_SIDE_STEP = 0.055;

export interface LayoutInput {
  /** Seed source — use the Hood id so a Hood always lays out the same way. */
  hoodId: string;
  /** Placed item ids, in placement order. */
  placedItems: string[];
  /** How many cats are visiting. Callers must respect MAX_HOOD_CATS. */
  catCount: number;
}

/**
 * Places items and cats on the plane.
 *
 * Items claim anchors first, in placement order. Cats then claim anchors that
 * already hold an item — nearest to the front first, so the most visible items
 * are the ones that look occupied — and only spread to bare anchors once every
 * item has a visitor.
 */
export function layoutScene({ hoodId, placedItems, catCount }: LayoutInput): SceneLayout {
  const seed = hashSeed(hoodId);
  const anchors = buildAnchors(seed);

  const drawnItems = placedItems.slice(0, anchors.length);
  const items: ItemPlacement[] = drawnItems.map((itemId, i) => {
    const anchor = anchors[i]!;
    return {
      key: `item_${anchor.id}_${i}`,
      anchorId: anchor.id,
      itemId,
      x: planeX(anchor.u, anchor.depth),
      y: planeY(anchor.depth),
      scale: planeScale(anchor.depth),
      z: anchor.depth,
    };
  });

  // Occupied anchors, front-most first: a cat at a near item is worth more to
  // the scene than a cat at one barely visible against the horizon.
  const occupied = anchors
    .slice(0, drawnItems.length)
    .map((anchor, i) => ({ anchor, itemId: drawnItems[i]! }))
    .sort((a, b) => b.anchor.depth - a.anchor.depth);

  const bare = anchors.slice(drawnItems.length);

  const cats: CatPlacement[] = [];
  for (let slot = 0; slot < catCount; slot++) {
    const host = occupied[slot];
    if (host) {
      // Alternate sides so a pair of cats at adjacent items don't lean the same
      // way, which reads as a copy-paste.
      const side = slot % 2 === 0 ? 1 : -1;
      const depth = clamp01(host.anchor.depth + CAT_FORWARD_STEP);
      const u = clamp01(host.anchor.u + side * CAT_SIDE_STEP);
      cats.push({
        key: `cat_${host.anchor.id}`,
        slot,
        atItemId: host.itemId,
        x: planeX(u, depth),
        y: planeY(depth),
        scale: planeScale(depth),
        z: depth,
      });
      continue;
    }

    const spare = bare[slot - occupied.length];
    if (!spare) break; // more cats than anchors — cannot happen at MAX_HOOD_CATS
    cats.push({
      key: `cat_${spare.id}`,
      slot,
      atItemId: null,
      x: planeX(spare.u, spare.depth),
      y: planeY(spare.depth),
      scale: planeScale(spare.depth),
      z: spare.depth,
    });
  }

  return {
    items,
    cats,
    hiddenItemCount: placedItems.length - drawnItems.length,
  };
}

/**
 * Everything on the plane in paint order, back to front.
 *
 * React Native honours `zIndex`, but only reliably among siblings that are
 * already in a sane document order on Android. Sorting here means the tree
 * order and the zIndex agree, which is the combination that actually works on
 * both platforms.
 */
export function paintOrder(layout: SceneLayout): Array<
  | { kind: 'item'; placement: ItemPlacement }
  | { kind: 'cat'; placement: CatPlacement }
> {
  const all = [
    ...layout.items.map((placement) => ({ kind: 'item' as const, placement })),
    ...layout.cats.map((placement) => ({ kind: 'cat' as const, placement })),
  ];
  return all.sort((a, b) => a.placement.z - b.placement.z);
}
