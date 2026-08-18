/**
 * Eight-way facing, PMD style.
 *
 * Only five directions are ever authored. Mirroring about the vertical axis
 * yields the other three for free, because a cat facing west is a cat facing
 * east reflected — nothing about its markings or anatomy is chiral at 32px.
 * That cuts the art bill by 37.5% before a single pixel is drawn.
 */

/** The five directions that require original art. */
const AUTHORED = ['S', 'SE', 'E', 'NE', 'N'];

/** Every facing, in clockwise order starting from "toward the viewer". */
const ALL = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

/** direction -> { source, mirror } */
const RESOLVE = {
  S: { source: 'S', mirror: false },
  SE: { source: 'SE', mirror: false },
  E: { source: 'E', mirror: false },
  NE: { source: 'NE', mirror: false },
  N: { source: 'N', mirror: false },
  NW: { source: 'NE', mirror: true },
  W: { source: 'E', mirror: true },
  SW: { source: 'SE', mirror: true },
};

/**
 * Painter's order, back to front, per authored direction.
 *
 * Order flips as the cat turns away: facing the viewer the head reads on top,
 * facing away the tail comes forward and the head tucks behind the shoulders.
 * Leg names are from the CAT's perspective, so "front left" is the far leg
 * once it has turned around.
 */
const DRAW_ORDER = {
  S: ['tail', 'legBL', 'legBR', 'body', 'legFL', 'legFR', 'head'],
  SE: ['tail', 'legBL', 'legBR', 'body', 'legFL', 'legFR', 'head'],
  E: ['legFL', 'legBL', 'tail', 'body', 'legBR', 'legFR', 'head'],
  NE: ['head', 'legFL', 'legFR', 'body', 'legBR', 'legBL', 'tail'],
  N: ['head', 'legFL', 'legFR', 'body', 'legBL', 'legBR', 'tail'],
};

/** Unit vector each facing moves along, for the drift behaviour layer. */
const VECTOR = {
  S: [0, 1],
  SE: [0.7, 0.7],
  E: [1, 0],
  NE: [0.7, -0.7],
  N: [0, -1],
  NW: [-0.7, -0.7],
  W: [-1, 0],
  SW: [-0.7, 0.7],
};

/** Nearest facing for a movement vector. */
function facingFor(dx, dy) {
  let best = 'S';
  let bestDot = -Infinity;
  const len = Math.hypot(dx, dy) || 1;
  for (const dir of ALL) {
    const [vx, vy] = VECTOR[dir];
    const dot = (dx / len) * vx + (dy / len) * vy;
    if (dot > bestDot) {
      bestDot = dot;
      best = dir;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Part-based composition tables — used by compositor.js
// ---------------------------------------------------------------------------

/**
 * Root position in the 32×32 frame for each authored direction.
 * This is the "ground contact centre" — the bottom-centre of the standing cat.
 * All part anchors are relative to this point.
 */
const ROOTS = {
  S:  { x: 15, y: 30 },
  SE: { x: 15, y: 30 },
  E:  { x: 15, y: 30 },
  NE: { x: 15, y: 30 },
  N:  { x: 15, y: 30 },
};

/**
 * Where each part connects, relative to the root, per direction.
 * [dx, dy] — positive x is rightward, positive y is downward.
 *
 * These are STRUCTURAL connections that depend on how the cat's body is
 * oriented in 3D. Animation offsets are applied ON TOP of these (see
 * animations.js).
 *
 * Leg names are from the CAT's perspective:
 *   FL = front-left, FR = front-right, BL = back-left, BR = back-right.
 * For E-facing, front legs are on the right side of the frame and back legs
 * are on the left. FL is the far front leg, FR is the near front leg.
 */
const ANCHORS = {
  S: {
    body:  [0, 0],
    head:  [0, -12],
    tail:  [7, -3],
    legFL: [-4, 0],
    legFR: [4, 0],
    legBL: [-4, 0],
    legBR: [4, 0],
  },
  SE: {
    body:  [0, 0],
    head:  [2, -12],
    tail:  [5, -4],
    legFL: [-2, 0],
    legFR: [5, 0],
    legBL: [-4, 0],
    legBR: [3, 0],
  },
  E: {
    body:  [0, 0],
    head:  [5, -11],
    tail:  [-7, -4],
    legFL: [3, 0],
    legFR: [4, 0],
    legBL: [-4, 0],
    legBR: [-3, 0],
  },
  NE: {
    body:  [0, 0],
    head:  [2, -12],
    tail:  [-5, -4],
    legFL: [5, 0],
    legFR: [-2, 0],
    legBL: [3, 0],
    legBR: [-4, 0],
  },
  N: {
    body:  [0, 0],
    head:  [0, -12],
    tail:  [7, -3],
    legFL: [4, 0],
    legFR: [-4, 0],
    legBL: [4, 0],
    legBR: [-4, 0],
  },
};

/**
 * Ground-contact shadow ellipse, per direction.
 * The shadow is cosmetic and composited under the sprite (not in the slot
 * buffer), same as the existing rig.
 */
const SHADOWS = {
  S:  { cx: 15.5, cy: 31, rx: 8,  ry: 1.4 },
  SE: { cx: 15.5, cy: 31, rx: 8,  ry: 1.4 },
  E:  { cx: 15.5, cy: 31, rx: 9,  ry: 1.4 },
  NE: { cx: 15.5, cy: 31, rx: 8,  ry: 1.4 },
  N:  { cx: 15.5, cy: 31, rx: 8,  ry: 1.4 },
};

/**
 * Whisker pixel offsets, relative to the head's anchor position in frame space.
 * Mirrored directions negate dx automatically.
 */
const WHISKER_OFFSETS = {
  S:  [[-7, -2], [-8, -2], [8, -2], [9, -2]],
  SE: [[7, -2], [8, -3]],
  // E has none: the offsets resolved to (28,14) and (29,13), which extended the
  // muzzle by two pixels and lengthened the very bill the head rebuild removes.
  // rig.js puts it plainly — a whisker has to grow out of the face, not hover
  // beside it — and in profile there is no clear face-edge to grow from.
  E:  [],
  NE: [],
  N:  [],
};

module.exports = {
  AUTHORED, ALL, RESOLVE, DRAW_ORDER, VECTOR, facingFor,
  ROOTS, ANCHORS, SHADOWS, WHISKER_OFFSETS,
};
