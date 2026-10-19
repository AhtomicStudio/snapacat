/**
 * What a cat decides to do, and where it decides to go.
 *
 * Pure and deterministic so it can be reasoned about and tested without a
 * renderer — same split as scene.ts, and for the same reason: the interesting
 * failures here are "all six cats groomed at once" and "a cat walked off the
 * plane", both of which are arithmetic rather than rendering.
 *
 * ZONE DRIFT, NOT PATHFINDING
 *
 * Each cat wanders inside a small ellipse around the anchor it arrived at. It
 * does not path across the Hood, re-home to another anchor, or negotiate with
 * other cats for space. That is a deliberate ceiling, not a stepping stone:
 *
 *   - a cat that stays near the item it came for keeps the core loop legible.
 *     You put down a bowl, a cat turns up at the bowl and stays about the bowl.
 *   - anchors are owned by items, so letting cats reassign them would mean
 *     cats and items competing for the same lattice
 *   - six cats wandering a shared plane with no collision handling walk through
 *     each other, and at this sprite size overlap reads as a rendering bug
 *
 * The zone is wider than it is deep. Lateral movement puts the cat in profile,
 * which is where the walk cycle reads best and where the eight-way art is
 * strongest; a cat drifting mostly toward and away from the camera would spend
 * its time in the two facings with the least to show.
 */
import { ACT_ANIMATIONS, DIRECTIONS, type ActAnimation, type SpriteDirection } from '../assets/sprites';
import { planeY } from '../config/scene';

// ---------------------------------------------------------------------------
// Facing
// ---------------------------------------------------------------------------

/**
 * Unit vector each facing travels along, in SCREEN space.
 *
 * Positive y is down the screen, which on the ground plane is toward the
 * viewer — so "south" is forward out of the scene. This mirrors VECTOR in
 * scripts/sprites/directions.js; the two have to agree or a cat will walk east
 * while facing west.
 */
const FACING_VECTOR: Record<SpriteDirection, readonly [number, number]> = {
  S: [0, 1],
  SE: [0.7071, 0.7071],
  E: [1, 0],
  NE: [0.7071, -0.7071],
  N: [0, -1],
  NW: [-0.7071, -0.7071],
  W: [-1, 0],
  SW: [-0.7071, 0.7071],
};

/**
 * The facings a cat passes through turning from one direction to another.
 *
 * Returns the steps AFTER `from`, ending at `to`, taking whichever way round is
 * shorter. Turning from S to E yields ['SE', 'E'].
 *
 * WHY A CAT CANNOT JUST FACE THE OTHER WAY
 *
 * Popping straight from one facing to another is, in the pipeline doc's words,
 * the clearest "this is a prototype" tell there is — and the two-sheet design
 * makes it worse, because a cat leaving its resting spot changes sheet and
 * facing in the same frame. A 90-degree snap at the exact moment the texture
 * swaps reads as a glitch rather than as a cat.
 *
 * The fix needs no new art at all. Eight facings already exist on the
 * directional sheet; a turn is just those facings played in order. That is the
 * whole transition — three frames of existing art and a timer.
 */
export function turnPath(
  from: SpriteDirection,
  to: SpriteDirection,
  /**
   * Breaks the tie on an exact about-face. Without it every 180-degree turn
   * resolves the same way, and six cats deciding to leave at once all pivot
   * clockwise together — which reads as choreography.
   */
  tieBreak = 0,
): SpriteDirection[] {
  const start = DIRECTIONS.indexOf(from);
  const end = DIRECTIONS.indexOf(to);
  if (start < 0 || end < 0 || start === end) return [];

  // DIRECTIONS is in clockwise order, so the difference mod 8 is the number of
  // 45-degree steps one way and 8 minus that is the other.
  const forward = (end - start + 8) % 8;
  const clockwise = forward === 4 ? (tieBreak & 1) === 0 : forward < 4;
  const step = clockwise ? 1 : -1;
  const count = forward === 4 ? 4 : clockwise ? forward : 8 - forward;

  const path: SpriteDirection[] = [];
  for (let i = 1; i <= count; i++) {
    path.push(DIRECTIONS[(start + step * i + 8) % 8]!);
  }
  return path;
}

/** How long each 45-degree step of a turn is held, in ms. */
export const TURN_STEP_MS = 90;

/**
 * Nearest of the eight facings to a direction of travel.
 *
 * A zero-length vector keeps whatever the cat was already facing — snapping to
 * south on arrival would make every cat pivot to the camera the instant it
 * stopped, which reads as a flinch.
 */
export function facingFor(dx: number, dy: number, fallback: SpriteDirection = 'S'): SpriteDirection {
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return fallback;

  let best = fallback;
  let bestDot = -Infinity;
  for (const dir of DIRECTIONS) {
    const [vx, vy] = FACING_VECTOR[dir];
    const dot = (dx / length) * vx + (dy / length) * vy;
    if (dot > bestDot) {
      bestDot = dot;
      best = dir;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

/**
 * xorshift in [0,1). Repeated here rather than imported from scene.ts because
 * that module keeps its generator private, and a behaviour layer reaching into
 * a layout module's internals is the kind of coupling that makes both harder to
 * change later.
 */
function noise(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 0x9e3779b9, 2654435761)) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

// ---------------------------------------------------------------------------
// The zone
// ---------------------------------------------------------------------------

/**
 * Half-extents of a cat's wander zone, as fractions of the WORLD and of scene
 * height respectively.
 *
 * Lateral is roughly a cat and a half at mid-depth — far enough that the walk
 * is worth playing, near enough that the cat never loses its association with
 * the item it came for. Depth is deliberately a third of that: the plane is
 * only about a third of the screen tall, so equal extents would send cats
 * through the horizon.
 */
const ZONE_U = 0.035;
const ZONE_DEPTH = 0.055;

/** How long a cat rests between excursions, in ms. */
const SETTLE_MIN = 5200;
const SETTLE_SPREAD = 11000;

/**
 * Walk speed in world-fractions per second. Tuned against the walk cycle rather
 * than chosen: the cycle is 640ms for four frames with a stride of about two
 * source pixels a frame, so a cat that covers much more ground than this is
 * skating and one that covers much less is moonwalking on the spot.
 */
const WALK_SPEED = 0.028;

export interface DriftTarget {
  /** Offset from the cat's base position, as a fraction of the world width. */
  du: number;
  /** Offset from the cat's base depth. */
  dDepth: number;
  /** How long the walk should take, in ms. */
  durationMs: number;
}

/**
 * Picks the n-th excursion for a cat.
 *
 * Seeded by the cat's slot and the excursion index, so the whole sequence is
 * reproducible — a Hood revisited behaves the same way, and a failure can be
 * replayed. The target is drawn in polar form so the distribution fills the
 * ellipse instead of clustering in its corners.
 */
export function driftTarget(seed: number, slot: number, index: number): DriftTarget {
  const salt = slot * 977 + index * 31;
  const angle = noise(seed, salt) * Math.PI * 2;
  // sqrt keeps the points uniform over the area; without it they bunch at the
  // centre and the cat appears to twitch rather than walk.
  const radius = Math.sqrt(noise(seed, salt + 1));

  const du = Math.cos(angle) * radius * ZONE_U;
  const dDepth = Math.sin(angle) * radius * ZONE_DEPTH;

  const distance = Math.hypot(du, dDepth);
  return {
    du,
    dDepth,
    // Floor the duration so a short hop still plays enough of the cycle to read
    // as walking rather than as a nudge.
    durationMs: Math.max(900, Math.round((distance / WALK_SPEED) * 1000)),
  };
}

/** How long a cat sits still before its n-th excursion, in ms. */
export function settleDuration(seed: number, slot: number, index: number): number {
  return SETTLE_MIN + Math.round(noise(seed, slot * 613 + index * 17) * SETTLE_SPREAD);
}

/**
 * Screen geometry for a cat that has drifted `dDepth` from its base.
 *
 * Returns the vertical offset in points and the clamped depth, so the caller
 * never has to know how the plane projects. Scale is not returned: see the note
 * in useCatLife on why a wander zone's 2.6% size change is not worth animating.
 */
export function driftGeometry(
  baseDepth: number,
  dDepth: number,
  sceneHeight: number,
): { dy: number; depth: number } {
  const depth = Math.min(1, Math.max(0, baseDepth + dDepth));
  return {
    dy: (planeY(depth) - planeY(baseDepth)) * sceneHeight,
    depth,
  };
}

// ---------------------------------------------------------------------------
// Flavour idles
// ---------------------------------------------------------------------------

/** Total cycle length of an action animation, in ms. */
export function actDuration(animation: ActAnimation): number {
  return ACT_ANIMATIONS[animation].durations.reduce((a, b) => a + b, 0);
}

/**
 * The repertoire a settled cat draws from, and how often each comes up.
 *
 * Weighted rather than uniform because these are not equally welcome. A blink
 * is nearly subliminal and can happen constantly; a yawn is a performance and
 * palls if it comes round every fifteen seconds. Plain idle keeps the largest
 * share so the scene has a resting state to return to — constant activity is as
 * flat as no activity, just louder.
 *
 * The weights also account for how much each one actually MOVES, which is not
 * a matter of taste and was measured: groom changes 45% of the sprite's pixels
 * at its peak, look 38%, yawn 28% — and tailflick 3.9%, because the S tail is
 * hemmed in by the frame edge on one side and the skull on the other and
 * physically cannot swing further (the reasoning is in buildTail_S). An
 * earlier split gave tailflick and blink 40% of the weight between them, which
 * meant a cat spent most of its visible life on the two animations nobody can
 * see. Time on screen is now roughly proportional to what there is to look at.
 */
const REPERTOIRE: ReadonlyArray<{ animation: ActAnimation; weight: number }> = [
  { animation: 'idle', weight: 24 },
  { animation: 'blink', weight: 20 },
  { animation: 'look', weight: 18 },
  { animation: 'groom', weight: 17 },
  { animation: 'yawn', weight: 13 },
  { animation: 'tailflick', weight: 8 },
];

const TOTAL_WEIGHT = REPERTOIRE.reduce((sum, entry) => sum + entry.weight, 0);

/**
 * Picks what a settled cat does next.
 *
 * `previous` is excluded so the same flourish never runs twice in a row — at
 * six cats on screen a repeat reads as a stuck animation rather than as a cat
 * that happened to blink twice. Plain idle is exempt, because two quiet beats
 * in a row is just a calm cat.
 */
export function nextIdle(
  seed: number,
  slot: number,
  index: number,
  previous?: ActAnimation,
): ActAnimation {
  const roll = noise(seed, slot * 2089 + index * 59) * TOTAL_WEIGHT;

  let cursor = 0;
  for (const entry of REPERTOIRE) {
    cursor += entry.weight;
    if (roll < cursor) {
      if (entry.animation === previous && previous !== 'idle') return 'idle';
      return entry.animation;
    }
  }
  return 'idle';
}

/**
 * Milliseconds to wait before the first animation of a cat's life.
 *
 * Six cats mounting in the same commit otherwise start every loop on the same
 * frame, which is the bug the sprite renderer already staggers breathing to
 * avoid — this is the same problem one level up.
 *
 * The modulus has to exceed `slot * multiplier` for every slot, or the
 * sequence wraps and two cats land on top of each other. At `% 1700` it did:
 * the offsets came out 0, 431, 862, 1293, 24, 455, putting slots 0 and 4
 * **24ms apart** — under two display frames. That was survivable while the
 * sprite renderer applied its own stagger on top, and stopped being so the
 * moment scene sprites switched to `stagger={false}`, which made this the only
 * thing keeping two cats out of phase.
 *
 * 463 × 5 = 2315 < 2777, so nothing wraps and the minimum gap is 463ms —
 * longer than any single frame hold in the set.
 */
export function startupStagger(slot: number): number {
  return (slot * 463) % 2777;
}
