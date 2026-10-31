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
  /**
   * The piece of scenery this cat turned up for, if any.
   *
   * Separate from `atItemId` rather than folded into it because the two
   * answer to different owners: an item is the player’s and has a Shop
   * record behind it, a bin belongs to the street and has none. The blurb
   * that fires when you tap a cat looks the item up, and would find nothing.
   */
  atSceneryId: string | null;
  /**
   * How much of the standard wander zone this cat may actually use, 0…1.
   *
   * The clearance below keeps cats apart where they STAND. It used to be the
   * whole guarantee, and it was not one: a cat then wanders up to `ZONE_U` by
   * `ZONE_DEPTH` around that spot, and on a real Hood the drift is the same
   * size as the gap. Measured on the Back Alley at six cats, two of the
   * fifteen pairs could close to inside the clearance box without either cat
   * doing anything unusual — which is two cats drawn on the same few points,
   * reading as one animal with two heads.
   *
   * So the layout hands each cat a budget. Scaled rather than clipped, so a
   * crowded cat still wanders in the same shape, just less far.
   */
  zone: number;
  /**
   * How far across the world this cat must walk to leave, as a signed
   * fraction of world width — or null if it has no clear way out.
   *
   * Leaving is the one thing a cat does that the zone cannot contain: it
   * walks the whole width of the plane at a fixed depth, past everyone
   * between it and the edge, and no amount of clearance at either end
   * covers the middle of that journey. So the layout checks the path and
   * picks the side that is clear, preferring the nearer edge because a
   * short departure is one you can watch from start to finish. Null means
   * both ways are blocked and the cat stays in.
   *
   * Only a cat on bare ground ever leaves — one at an item or a prop turned
   * up for it and stays. Across the five Hoods the suite lays out, six cats
   * stand on bare ground at six visitors and two of them have no clear way
   * out. That is the right way round: a plane crowded enough to block the
   * aisle is exactly the one where a departure would shoulder past somebody.
   */
  exitSpan: number | null;
}

/** A vacant anchor offered to the player as somewhere to put something. */
export interface SpotPlacement extends Placement {
  anchorId: string;
}

/**
 * How many vacant anchors to offer at once.
 *
 * The plane carries seventeen, and showing every bare one turns the Hood
 * into a form to fill in. Five is enough that panning always has one in
 * view without the scene reading as a grid of sockets.
 */
export const MAX_SPOTS = 5;

/**
 * Nearest depth a spot may sit at. Anything further is a handful of
 * pixels on screen — too small to aim at, and an invitation you cannot
 * hit is worse than no invitation.
 */
const SPOT_MIN_DEPTH = 0.3;

export interface SceneLayout {
  items: ItemPlacement[];
  cats: CatPlacement[];
  /** Vacant anchors the player can tap to place something. */
  spots: SpotPlacement[];
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

/**
 * Half-extents of a cat's wander zone, as fractions of the WORLD and of depth.
 *
 * Lateral is roughly a cat and a half at mid-depth — far enough that the walk
 * is worth playing, near enough that the cat never loses its association with
 * the item it came for. Depth is deliberately a third of that: the plane is
 * only about a third of the screen tall, so equal extents would send cats
 * through the horizon.
 *
 * These live HERE, beside the clearance they have to respect, rather than in
 * the behaviour layer that spends them. The layout is the only place that can
 * see every cat at once, so it is the only place that can work out how much
 * wandering each one can afford; catBehaviour imports them back.
 */
export const ZONE_U = 0.035;
export const ZONE_DEPTH = 0.055;

/**
 * How far a cat at this depth can move on each axis, in plane coordinates,
 * if it uses its whole zone.
 *
 * Not the same as the zone extents themselves. `u` is pre-perspective and
 * `depth` is not a distance at all, so a zone of fixed extent covers less of
 * the screen the further back it sits — which is exactly why the reach has to
 * be measured through the projection rather than assumed.
 */
function driftReach(depth: number): { x: number; y: number } {
  return {
    x: Math.abs(planeX(0.5 + ZONE_U, depth) - planeX(0.5, depth)),
    y: Math.abs(planeY(clamp01(depth + ZONE_DEPTH)) - planeY(depth)),
  };
}

/**
 * Below this, a zone is not worth having.
 *
 * A cat whose zone has been cut to a sliver would walk two or three points and
 * stop, which reads as a twitch rather than as a cat — and `useCatLife`
 * already drops any excursion shorter than three points and simply settles
 * again. Rounding the sliver down to nothing makes that the explicit outcome
 * instead of an accident of the geometry.
 */
const MIN_ZONE = 0.3;

/**
 * How close two actors may be drawn before they read as one.
 *
 * In plane coordinates, which are fractions of the world and of scene
 * height. A cat at mid-depth is about 0.07 of the world wide, so anything
 * inside that overlaps; the vertical figure is smaller because two sprites
 * at different depths overlap less the further apart their baselines are.
 */
const ACTOR_CLEARANCE_X = 0.06;
const ACTOR_CLEARANCE_Y = 0.035;

/**
 * How far past the edge of the world a departing cat aims for.
 *
 * It never gets there — `useCatLife` fades it out on arrival — but the walk
 * has to end somewhere offstage, or a cat would stop and dissolve in full
 * view of the player.
 */
const EXIT_MARGIN = 0.06;

export interface LayoutInput {
  /** Seed source — use the Hood id so a Hood always lays out the same way. */
  hoodId: string;
  /** Placed item ids, in placement order. */
  placedItems: string[];
  /** How many cats are visiting. Callers must respect MAX_HOOD_CATS. */
  catCount: number;
  /**
   * Items the player put at a particular anchor, as anchorId → itemId.
   *
   * Without this the scene assigns items to anchors in placement order,
   * which is fine when the player never chose a place — but the moment
   * they tap a specific vacant spot, "somewhere" is the wrong answer. A
   * pin that names an item no longer in `placedItems` is ignored, so the
   * map can go stale without stranding an anchor.
   */
  pinned?: Record<string, string>;
  /**
   * The environment’s fixed scenery, if it has any.
   *
   * Passed in rather than looked up so this module keeps knowing nothing
   * about environments — the same reason it takes `placedItems` instead of
   * reading a Hood.
   */
  scenery?: readonly SceneryHost[];
}

/** The part of a scenery prop the layout needs: where it is, and what it is. */
export interface SceneryHost {
  id: string;
  u: number;
  depth: number;
}

/**
 * Places items and cats on the plane.
 *
 * Items claim anchors first, in placement order. Cats then claim anchors that
 * already hold an item — nearest to the front first, so the most visible items
 * are the ones that look occupied — and only spread to bare anchors once every
 * item has a visitor.
 */
export function layoutScene({
  hoodId, placedItems, catCount, pinned, scenery,
}: LayoutInput): SceneLayout {
  const seed = hashSeed(hoodId);
  const anchors = buildAnchors(seed);

  /**
   * Pinned items claim their anchor first; everything else fills in around
   * them in placement order. With no pins this assigns item i to anchor i,
   * exactly as it always did.
   */
  const pool = placedItems.slice();
  const taken = new Map<string, string>();

  if (pinned) {
    for (const anchor of anchors) {
      const want = pinned[anchor.id];
      if (!want) continue;
      // Consume one instance: the same item can be stacked at two anchors.
      const at = pool.indexOf(want);
      if (at < 0) continue;
      pool.splice(at, 1);
      taken.set(anchor.id, want);
    }
  }

  let nextItem = 0;
  for (const anchor of anchors) {
    if (nextItem >= pool.length) break;
    if (taken.has(anchor.id)) continue;
    taken.set(anchor.id, pool[nextItem]!);
    nextItem += 1;
  }

  const items: ItemPlacement[] = [];
  const seated: { anchor: Anchor; itemId: string }[] = [];
  const bare: Anchor[] = [];

  for (const anchor of anchors) {
    const itemId = taken.get(anchor.id);
    if (itemId == null) {
      bare.push(anchor);
      continue;
    }
    items.push({
      key: `item_${anchor.id}`,
      anchorId: anchor.id,
      itemId,
      x: planeX(anchor.u, anchor.depth),
      y: planeY(anchor.depth),
      scale: planeScale(anchor.depth),
      z: anchor.depth,
    });
    seated.push({ anchor, itemId });
  }

  // Occupied anchors, front-most first: a cat at a near item is worth more to
  // the scene than a cat at one barely visible against the horizon.
  const occupied = seated.sort((a, b) => b.anchor.depth - a.anchor.depth);

  /**
   * Scenery takes the cats the items could not.
   *
   * A cat with nothing to be at used to go to a bare anchor, where it stood
   * on open ground doing the general repertoire. That is the state the Hood
   * spends most of its time in — six cats, two or three items — and it is
   * also what made the scenery read as decoration painted behind the game
   * rather than as part of it. Nothing ever went near the bin.
   *
   * Seating a spare cat at a prop costs no new art and answers both at once:
   * the cat has a reason to be where it is, and the prop is demonstrably
   * something a cat uses. Nearest first, for the same reason items are —
   * the visible end of the plane is where an occupied look is worth most.
   */
  const props = [...(scenery ?? [])].sort((a, b) => b.depth - a.depth);
  /** Props already used, so two cats never claim the same bin. */
  const claimedProps = new Set<number>();
  /** Bare anchors already standing a cat. */
  const usedBare = new Set<string>();

  const cats: CatPlacement[] = [];

  /**
   * Is something already drawn here?
   *
   * The scene has never needed this. Everything on the plane sat on the
   * anchor lattice, and the lattice is spaced; two actors could not collide
   * because two anchors do not. Scenery is NOT on the lattice — it sits at
   * coordinates written by hand per environment — so the moment a cat is
   * seated at a prop the guarantee is gone, and on the alley it went: a cat
   * at the right-hand bin drew on top of a cat at the item beside it, and
   * at this sprite size the pair read as one two-headed cat.
   *
   * Checked for bare anchors too, not just for props. A cat displaced onto
   * bare ground can land on a cat already standing at a prop, which is the
   * same collision arriving from the other direction.
   */
  const crowded = (x: number, y: number) =>
    [...cats, ...items].some(
      (other) =>
        Math.abs(other.x - x) < ACTOR_CLEARANCE_X &&
        Math.abs(other.y - y) < ACTOR_CLEARANCE_Y,
    );

  for (let slot = 0; slot < catCount; slot++) {
    const host = occupied[slot];
    if (host) {
      // Alternate sides so a pair of cats at adjacent items don't lean the same
      // way, which reads as a copy-paste.
      const side = slot % 2 === 0 ? 1 : -1;
      const depth = clamp01(host.anchor.depth + CAT_FORWARD_STEP);
      /**
       * The far side of the bowl if the near side is taken.
       *
       * A cat at an item cannot be moved elsewhere — standing at the thing
       * you put down is the whole point of the loop — but which side of it
       * the cat stands on is free, and two anchors a tenth of the world
       * apart put the alternating sides of two cats in the same place.
       * Flipping is the one adjustment available that costs the loop
       * nothing. If both sides are busy the cat stays where it belongs and
       * overlaps; being at the right item matters more than being clear.
       */
      const near = clamp01(host.anchor.u + side * CAT_SIDE_STEP);
      const far = clamp01(host.anchor.u - side * CAT_SIDE_STEP);
      const u = crowded(planeX(near, depth), planeY(depth)) ? far : near;
      cats.push({
        key: `cat_${host.anchor.id}`,
        slot,
        atItemId: host.itemId,
        atSceneryId: null,
        // Both filled in by the wander pass below, once every cat is placed.
        zone: 1,
        exitSpan: null,
        x: planeX(u, depth),
        y: planeY(depth),
        scale: planeScale(depth),
        z: depth,
      });
      continue;
    }

    // Alternate sides, as at an item, so two neighbours do not lean the
    // same way.
    const side = slot % 2 === 0 ? 1 : -1;
    let placed = false;

    // The nearest free prop with room beside it.
    for (let i = 0; i < props.length; i++) {
      if (claimedProps.has(i)) continue;
      const prop = props[i]!;
      const depth = clamp01(prop.depth + CAT_FORWARD_STEP);
      // Either side of the prop will do before giving up on it.
      const sides = [side, -side].map((d) => clamp01(prop.u + d * CAT_SIDE_STEP));
      const u = sides.find((candidate) => !crowded(planeX(candidate, depth), planeY(depth)));
      if (u === undefined) continue;
      const x = planeX(u, depth);
      const y = planeY(depth);
      claimedProps.add(i);
      cats.push({
        key: `cat_scenery_${slot}`,
        slot,
        atItemId: null,
        atSceneryId: prop.id,
        // Both filled in by the wander pass below, once every cat is placed.
        zone: 1,
        exitSpan: null,
        x,
        y,
        scale: planeScale(depth),
        z: depth,
      });
      placed = true;
      break;
    }
    if (placed) continue;

    // Open ground, in anchor order, first one with nobody on it.
    for (const spare of bare) {
      if (usedBare.has(spare.id)) continue;
      const x = planeX(spare.u, spare.depth);
      const y = planeY(spare.depth);
      if (crowded(x, y)) continue;
      usedBare.add(spare.id);
      cats.push({
        key: `cat_${spare.id}`,
        slot,
        atItemId: null,
        atSceneryId: null,
        // Both filled in by the wander pass below, once every cat is placed.
        zone: 1,
        exitSpan: null,
        x,
        y,
        scale: planeScale(spare.depth),
        z: spare.depth,
      });
      placed = true;
      break;
    }
    // Nowhere left that is not already occupied. Cannot happen at
    // MAX_HOOD_CATS against this lattice, but a Hood is not the only
    // caller and an unplaceable cat must not become a stacked one.
    if (!placed) break;
  }

  /**
   * How much each cat is allowed to wander, given who it is standing next to.
   *
   * A pair stays legible as two cats as long as ONE axis keeps them apart —
   * side by side, or one clearly in front of the other. So for each pair we
   * pick the axis that separates them best, measured in units of the drift
   * that would close it, and require that axis to survive both cats using
   * their whole budget:
   *
   *     reach(a) * zone(a) + reach(b) * zone(b)  <=  |separation| - clearance
   *
   * Taking the same budget for both sides of a pair makes that a bound on
   * each, and a cat's budget is the tightest bound any of its neighbours
   * imposes. Cutting both cats rather than one keeps the result independent
   * of the order they were placed in, which matters because that order is
   * seeded and otherwise invisible.
   *
   * The pair is left alone when neither axis has a positive margin. That only
   * happens for cats the placement loop had to stack anyway — a cat at an item
   * with both sides busy — and shrinking a zone cannot unstack them.
   */
  const budgets = cats.map(() => 1);
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i]!;
      const b = cats[j]!;
      const ra = driftReach(a.z);
      const rb = driftReach(b.z);
      const axes = [
        { margin: Math.abs(a.x - b.x) - ACTOR_CLEARANCE_X, reach: ra.x + rb.x },
        { margin: Math.abs(a.y - b.y) - ACTOR_CLEARANCE_Y, reach: ra.y + rb.y },
      ];
      // The axis that buys the most room per unit of drift spent on it.
      const best = axes.reduce((m, axis) =>
        axis.margin / (axis.reach || 1e-9) > m.margin / (m.reach || 1e-9) ? axis : m,
      );
      if (best.margin <= 0) continue;
      const allowed = best.reach > 0 ? Math.min(1, best.margin / best.reach) : 1;
      budgets[i] = Math.min(budgets[i]!, allowed);
      budgets[j] = Math.min(budgets[j]!, allowed);
    }
  }
  cats.forEach((cat, i) => {
    const budget = budgets[i]!;
    cat.zone = budget < MIN_ZONE ? 0 : budget;
  });

  /**
   * And which way out each cat has, now that the zones are settled.
   *
   * Measured the same way as the zones — a cat is in the way if the vertical
   * gap between the two of them, once both have spent their drift, is inside
   * the clearance — because the two questions are the same question. The
   * difference is that a walk out has no near end and no far end to be clear
   * at: the cat passes through every x between here and the edge, so anything
   * sharing its band blocks the whole side.
   *
   * Only other CATS count. A cat that walks past a bin at a different depth
   * is occluded by it, which is the plane doing its job; two cats at the same
   * depth cannot occlude each other usefully, because the thing in front is
   * the same size and shape as the thing behind and the pair reads as one
   * animal. Depth solves the first and cannot solve the second.
   */
  cats.forEach((cat) => {
    const reach = driftReach(cat.z);
    const blocked = (towardLeft: boolean) =>
      cats.some((other) => {
        if (other === cat) return false;
        if (towardLeft ? other.x > cat.x : other.x < cat.x) return false;
        const gap =
          Math.abs(cat.y - other.y) -
          reach.y * cat.zone -
          driftReach(other.z).y * other.zone;
        return gap < ACTOR_CLEARANCE_Y;
      });

    // The nearer edge first, then the far one, then not at all.
    const nearerIsLeft = cat.x < 0.5;
    const towardLeft = !blocked(nearerIsLeft)
      ? nearerIsLeft
      : !blocked(!nearerIsLeft)
        ? !nearerIsLeft
        : null;
    cat.exitSpan =
      towardLeft === null
        ? null
        : (towardLeft ? -EXIT_MARGIN : 1 + EXIT_MARGIN) - cat.x;
  });

  /**
   * What is left over becomes somewhere to put something.
   *
   * The Hood had no way to add an item to a particular place at all: you
   * tapped an item already down, or you used the drawer and the scene
   * decided for you. Pan away from the middle and there was nothing to
   * do out there, which is most of a world two and a half screens wide.
   *
   * They are spread ACROSS the width rather than taken in anchor order,
   * because anchor order is shuffled and would cluster them — and a
   * cluster defeats the point, which is that panning somewhere new
   * should offer you something new.
   */
  const candidates = bare
    .filter((a) => !usedBare.has(a.id))
    .filter((a) => a.depth >= SPOT_MIN_DEPTH)
    .sort((a, b) => a.u - b.u);

  const take = Math.min(MAX_SPOTS, candidates.length);
  const spots: SpotPlacement[] = [];
  for (let i = 0; i < take; i++) {
    const pick = take === 1 ? 0 : Math.round((i * (candidates.length - 1)) / (take - 1));
    const anchor = candidates[pick]!;
    spots.push({
      key: `spot_${anchor.id}`,
      anchorId: anchor.id,
      x: planeX(anchor.u, anchor.depth),
      y: planeY(anchor.depth),
      scale: planeScale(anchor.depth),
      z: anchor.depth,
    });
  }

  return {
    items,
    cats,
    spots,
    hiddenItemCount: placedItems.length - items.length,
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
