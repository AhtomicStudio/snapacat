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
  NE: ['head', 'legFL', 'legBL', 'body', 'legBR', 'legFR', 'tail'],
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

module.exports = { AUTHORED, ALL, RESOLVE, DRAW_ORDER, VECTOR, facingFor };
