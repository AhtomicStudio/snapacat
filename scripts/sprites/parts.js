/**
 * Part atlas — the cat decomposed into independently-positioned pieces.
 *
 * Animation at 32px works by translating parts on INTEGER pixel offsets and
 * swapping between a small number of authored variants. Parts are never
 * rotated: a cat's leg is about 3px wide here, and rotation resamples, so
 * there is nothing to resample and the result is mush. This is the same
 * technique the PMD sprites in Reference/ use — their `-Offsets.png` sheets
 * encode exactly these per-frame anchor points.
 *
 * Parts are authored in semantic slots (see slots.js), so the palette-swap and
 * pattern layers apply to a composited cat exactly as they did to a whole-frame
 * rig. Breeds stay free.
 *
 * Part art is hand-authored per-row span tables — same technique as rig.js.
 * Ellipse maths can't give you a neck, and its widest-row-only artifact leaves
 * 1px shelves that sparkle at 4×.
 */
const { SLOT } = require('./slots');
const { AUTHORED, ROOTS, ANCHORS } = require('./directions');

// ---------------------------------------------------------------------------
// Cell geometry
// ---------------------------------------------------------------------------

/**
 * Cell dimensions per part. The anchor (ax, ay) is the part's own origin
 * within its cell, expressed so that placing a part means:
 *   cellTopLeft = root + anchorOffset - partAnchor
 *
 * Legs anchor at the foot, body and head at their bottom-centre, tail at
 * its root (where it joins the body).
 */
const PART_CELLS = {
  body:  { w: 22, h: 14, ax: 10, ay: 13 },
  head:  { w: 18, h: 16, ax: 8, ay: 15 },
  tail:  { w: 12, h: 16, ax: 2, ay: 14 },
  legFL: { w: 6, h: 10, ax: 3, ay: 9 },
  legFR: { w: 6, h: 10, ax: 3, ay: 9 },
  legBL: { w: 6, h: 10, ax: 3, ay: 9 },
  legBR: { w: 6, h: 10, ax: 3, ay: 9 },
};

const PART_IDS = Object.keys(PART_CELLS);

// ---------------------------------------------------------------------------
// Region tags — which anatomical region each pixel belongs to.
// Used by the compositor to provide pattern painters with direction-aware
// isEar / isTail / isMuzzle / isPaw / isHead queries.
// ---------------------------------------------------------------------------

const REGION = {
  NONE: 0,
  BODY: 1,
  HEAD: 2,
  TAIL: 3,
  LEG: 4,
  EAR: 5,
  MUZZLE: 6,
};

// ---------------------------------------------------------------------------
// Cell raster helpers
// ---------------------------------------------------------------------------

function makeCell(part) {
  const { w, h } = PART_CELLS[part];
  return { w, h, px: new Uint8Array(w * h), regions: new Uint8Array(w * h) };
}

const cellIdx = (cell, x, y) => y * cell.w + x;

function cellSet(cell, x, y, slot, region) {
  if (x < 0 || y < 0 || x >= cell.w || y >= cell.h) return;
  cell.px[cellIdx(cell, x, y)] = slot;
  if (region !== undefined) cell.regions[cellIdx(cell, x, y)] = region;
}

function cellSpan(cell, y, x0, x1, slot, region) {
  for (let x = x0; x <= x1; x++) cellSet(cell, x, y, slot, region);
}

/** Mirrors a cell about its vertical axis. */
function mirrorCell(cell) {
  const out = { w: cell.w, h: cell.h, px: new Uint8Array(cell.w * cell.h), regions: new Uint8Array(cell.w * cell.h) };
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      out.px[cellIdx(out, cell.w - 1 - x, y)] = cell.px[cellIdx(cell, x, y)];
      out.regions[cellIdx(out, cell.w - 1 - x, y)] = cell.regions[cellIdx(cell, x, y)];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Frame-space painting helpers
//
// These let us author part art using the same coordinate system as rig.js.
// The frame position of a part cell is:
//   frameX = root.x + anchor[0] - cell.ax
//   frameY = root.y + anchor[1] - cell.ay
// We convert frame coords to cell-local coords by subtracting this offset.
// ---------------------------------------------------------------------------

function makeBuilder(partId, dir) {
  const cellDef = PART_CELLS[partId];
  const cell = makeCell(partId);
  const root = ROOTS[dir];
  const offset = ANCHORS[dir][partId];

  const fx = root.x + offset[0] - cellDef.ax;
  const fy = root.y + offset[1] - cellDef.ay;

  return {
    cell,
    /** Set a pixel in frame coordinates. */
    fset(frameX, frameY, slot, region) {
      cellSet(cell, frameX - fx, frameY - fy, slot, region);
    },
    /** Fill a horizontal span in frame coordinates. */
    fspan(frameY, frameX0, frameX1, slot, region) {
      cellSpan(cell, frameY - fy, frameX0 - fx, frameX1 - fx, slot, region);
    },
    /** Fill a mirrored pair of spans about frame CX=15.5. */
    fspanMirror(frameY, frameX0, frameX1, slot, region) {
      cellSpan(cell, frameY - fy, frameX0 - fx, frameX1 - fx, slot, region);
      const mx0 = 31 - frameX1;
      const mx1 = 31 - frameX0;
      cellSpan(cell, frameY - fy, mx0 - fx, mx1 - fx, slot, region);
    },
  };
}

// ---------------------------------------------------------------------------
// HEAD art — per direction
// ---------------------------------------------------------------------------

// Rig.js coordinate data (S direction), reused directly via frame-space helpers.
const HEAD_TOP = 6;
const HEAD_HALF = [5, 6, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4];
const CX = 15.5;

const EAR = [
  [3, 10, 11], [4, 10, 12], [5, 9, 12],
  [6, 9, 13], [7, 8, 13], [8, 8, 14],
];
const EAR_INNER = [[6, 10, 11], [7, 10, 12]];

function buildHead_S(variant) {
  const { cell, fspan, fspanMirror, fset } = makeBuilder('head', 'S');
  const R = REGION;

  // Ears behind skull
  for (const [y, x0, x1] of EAR) {
    fspanMirror(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }
  // Skull overwrites ear bases
  for (let i = 0; i < HEAD_HALF.length; i++) {
    const h = HEAD_HALF[i];
    if (h <= 0) continue;
    fspan(HEAD_TOP + i, Math.ceil(CX - h), Math.floor(CX + h), SLOT.COAT_BASE, R.HEAD);
  }
  // Inner ears
  for (const [y, x0, x1] of EAR_INNER) {
    fspanMirror(y, x0, x1, SLOT.PINK, R.EAR);
  }
  // Under-lash
  fspanMirror(11, 11, 13, SLOT.OUTLINE_SOFT, R.HEAD);

  if (variant === 1) {
    // Closed eyes — short arcs
    fspan(12, 11, 13, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(12, 18, 20, SLOT.OUTLINE_SOFT, R.HEAD);
  } else {
    // Eyes open
    for (let y = 12; y <= 13; y++) {
      fspan(y, 11, 13, SLOT.EYE, R.HEAD);
      fspan(y, 18, 20, SLOT.EYE, R.HEAD);
    }
    fset(11, 13, SLOT.EYE_DARK, R.HEAD);
    fset(20, 13, SLOT.EYE_DARK, R.HEAD);
    fset(11, 12, SLOT.EYE_SHINE, R.HEAD);
    fset(18, 12, SLOT.EYE_SHINE, R.HEAD);
  }

  // Muzzle
  fspan(15, 12, 19, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(16, 13, 18, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(15, 15, 16, SLOT.PINK, R.MUZZLE);
  fspan(16, 15, 16, SLOT.OUTLINE_SOFT, R.MUZZLE);
  fspan(17, 13, 14, SLOT.OUTLINE_SOFT, R.MUZZLE);
  fspan(17, 17, 18, SLOT.OUTLINE_SOFT, R.MUZZLE);

  return cell;
}

function buildHead_SE(variant) {
  const { cell, fspan, fset } = makeBuilder('head', 'SE');
  const R = REGION;

  // Near ear (right, larger)
  for (const [y, x0, x1] of [[4, 20, 22], [5, 19, 23], [6, 19, 23], [7, 19, 23]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }
  fspan(6, 20, 21, SLOT.PINK, R.EAR);

  // Far ear (left, smaller — partially hidden)
  for (const [y, x0, x1] of [[5, 11, 12], [6, 10, 13], [7, 10, 13]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }

  // Skull — shifted right for 3/4 view
  const skullSpans = [
    [7, 11, 22], [8, 10, 23], [9, 10, 23], [10, 10, 23],
    [11, 10, 23], [12, 11, 23], [13, 11, 22], [14, 12, 22],
    [15, 12, 21], [16, 13, 20], [17, 14, 19],
  ];
  for (const [y, x0, x1] of skullSpans) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.HEAD);
  }

  // Under-lash
  fspan(12, 12, 14, SLOT.OUTLINE_SOFT, R.HEAD);
  fspan(12, 19, 21, SLOT.OUTLINE_SOFT, R.HEAD);

  if (variant === 1) {
    fspan(13, 12, 14, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(13, 19, 21, SLOT.OUTLINE_SOFT, R.HEAD);
  } else {
    // Far eye (left, smaller)
    fspan(13, 12, 14, SLOT.EYE, R.HEAD);
    fset(12, 13, SLOT.EYE_SHINE, R.HEAD);
    // Near eye (right, larger)
    for (let y = 13; y <= 14; y++) fspan(y, 19, 21, SLOT.EYE, R.HEAD);
    fset(21, 14, SLOT.EYE_DARK, R.HEAD);
    fset(19, 13, SLOT.EYE_SHINE, R.HEAD);
  }

  // Muzzle — pushed right
  fspan(16, 17, 22, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(17, 18, 21, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(16, 20, 21, SLOT.PINK, R.MUZZLE);
  fspan(17, 20, 21, SLOT.OUTLINE_SOFT, R.MUZZLE);

  return cell;
}

function buildHead_E(variant) {
  const { cell, fspan, fset } = makeBuilder('head', 'E');
  const R = REGION;

  // Single visible ear
  for (const [y, x0, x1] of [[4, 19, 22], [5, 18, 23], [6, 18, 23]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }
  fspan(5, 20, 21, SLOT.PINK, R.EAR);

  // Profile skull
  const skullSpans = [
    [7, 16, 24], [8, 15, 25], [9, 15, 25], [10, 15, 25],
    [11, 15, 25], [12, 16, 26], [13, 16, 26], [14, 17, 25],
    [15, 17, 25], [16, 18, 24], [17, 19, 23],
  ];
  for (const [y, x0, x1] of skullSpans) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.HEAD);
  }

  // Under-lash
  fspan(11, 21, 23, SLOT.OUTLINE_SOFT, R.HEAD);

  if (variant === 1) {
    fspan(12, 22, 23, SLOT.OUTLINE_SOFT, R.HEAD);
  } else {
    // One eye in profile
    for (let y = 12; y <= 13; y++) fspan(y, 22, 24, SLOT.EYE, R.HEAD);
    fset(22, 13, SLOT.EYE_DARK, R.HEAD);
    fset(22, 12, SLOT.EYE_SHINE, R.HEAD);
  }

  // Muzzle protruding right
  fspan(14, 24, 27, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(15, 24, 27, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(14, 26, 27, SLOT.PINK, R.MUZZLE);

  return cell;
}

function buildHead_NE(variant) {
  const { cell, fspan } = makeBuilder('head', 'NE');
  const R = REGION;

  // One ear tip visible (near side)
  for (const [y, x0, x1] of [[5, 20, 22], [6, 19, 23], [7, 19, 23]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }

  // Back of skull — no face
  const skullSpans = [
    [7, 11, 22], [8, 10, 23], [9, 10, 23], [10, 10, 23],
    [11, 10, 23], [12, 10, 22], [13, 11, 22], [14, 12, 21],
    [15, 12, 21], [16, 13, 20], [17, 14, 19],
  ];
  for (const [y, x0, x1] of skullSpans) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.HEAD);
  }

  return cell;
}

function buildHead_N(variant) {
  const { cell, fspan, fspanMirror } = makeBuilder('head', 'N');
  const R = REGION;

  // Both ear backs visible
  for (const [y, x0, x1] of EAR) {
    fspanMirror(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }

  // Back of skull — symmetric, no face features
  for (let i = 0; i < HEAD_HALF.length; i++) {
    const h = HEAD_HALF[i];
    if (h <= 0) continue;
    fspan(HEAD_TOP + i, Math.ceil(CX - h), Math.floor(CX + h), SLOT.COAT_BASE, R.HEAD);
  }

  return cell;
}

// ---------------------------------------------------------------------------
// BODY art — per direction
// ---------------------------------------------------------------------------

// Rig.js body spans, reused for S direction.
const BODY_SPANS = [
  [19, 11, 20], [20, 10, 21], [21, 9, 22], [22, 8, 23],
  [23, 8, 23], [24, 7, 24], [25, 7, 24], [26, 6, 25],
  [27, 6, 25], [28, 6, 25], [29, 7, 24], [30, 8, 23],
];

/** Rows whose width the breathing frames inflate. */
const BREATH_ROWS = [[22, 23, 24], [21, 25]];

function buildBody_S(variant) {
  const { cell, fspan, fset } = makeBuilder('body', 'S');
  const R = REGION;
  const breath = variant;  // 0 = rest, 1 = mid, 2 = peak

  const widened = new Set();
  for (let s = 0; s < breath; s++) {
    for (const r of BREATH_ROWS[s] ?? []) widened.add(r);
  }

  for (const [y, x0, x1] of BODY_SPANS) {
    const g = widened.has(y) ? 1 : 0;
    fspan(y, x0 - g, x1 + g, SLOT.COAT_BASE, R.BODY);
  }

  // Occlusion shadow at head–body junction
  fspan(19, 12, 19, SLOT.COAT_SHADOW, R.BODY);

  // Chest fluff
  for (const [y, x0, x1] of [[21, 13, 18], [22, 14, 17], [23, 15, 16]]) {
    fspan(y, x0, x1, SLOT.FUR_LIGHT, R.BODY);
  }

  // Between-legs shadow
  for (let y = 28; y <= 30; y++) fspan(y, 15, 16, SLOT.COAT_SHADOW, R.BODY);

  return cell;
}

function buildBody_SE(variant) {
  const { cell, fspan } = makeBuilder('body', 'SE');
  const R = REGION;
  const breath = variant;

  // 3/4 body — slightly wider right, angled
  const spans = [
    [19, 11, 21], [20, 10, 22], [21, 9, 23], [22, 8, 24],
    [23, 8, 24], [24, 7, 24], [25, 7, 24], [26, 7, 25],
    [27, 7, 25], [28, 7, 25], [29, 8, 24], [30, 9, 23],
  ];

  const widened = new Set();
  for (let s = 0; s < breath; s++) for (const r of BREATH_ROWS[s] ?? []) widened.add(r);

  for (const [y, x0, x1] of spans) {
    const g = widened.has(y) ? 1 : 0;
    fspan(y, x0 - g, x1 + g, SLOT.COAT_BASE, R.BODY);
  }

  fspan(19, 12, 20, SLOT.COAT_SHADOW, R.BODY);
  for (const [y, x0, x1] of [[21, 14, 19], [22, 15, 18]]) {
    fspan(y, x0, x1, SLOT.FUR_LIGHT, R.BODY);
  }
  for (let y = 28; y <= 30; y++) fspan(y, 15, 17, SLOT.COAT_SHADOW, R.BODY);

  return cell;
}

function buildBody_E(variant) {
  const { cell, fspan } = makeBuilder('body', 'E');
  const R = REGION;
  const breath = variant;

  // Side view — elongated, rounder. Starts at y18 to overlap with head base.
  const spans = [
    [18, 9, 22], [19, 8, 23], [20, 7, 23], [21, 6, 23],
    [22, 5, 24], [23, 5, 24], [24, 5, 24], [25, 5, 24],
    [26, 5, 23], [27, 6, 23], [28, 6, 23], [29, 7, 22],
    [30, 8, 21],
  ];

  const widened = new Set();
  for (let s = 0; s < breath; s++) for (const r of BREATH_ROWS[s] ?? []) widened.add(r);

  for (const [y, x0, x1] of spans) {
    const g = widened.has(y) ? 1 : 0;
    fspan(y, x0 - g, x1 + g, SLOT.COAT_BASE, R.BODY);
  }

  // Shoulder definition
  fspan(18, 19, 22, SLOT.COAT_SHADOW, R.BODY);
  // Belly highlight
  fspan(28, 10, 16, SLOT.FUR_LIGHT, R.BODY);

  return cell;
}

function buildBody_NE(variant) {
  const { cell, fspan } = makeBuilder('body', 'NE');
  const R = REGION;
  const breath = variant;

  // Same width profile as SE, but seen from behind
  const spans = [
    [19, 10, 20], [20, 9, 21], [21, 8, 22], [22, 7, 23],
    [23, 7, 23], [24, 7, 24], [25, 7, 24], [26, 6, 24],
    [27, 6, 24], [28, 6, 24], [29, 7, 23], [30, 8, 22],
  ];

  const widened = new Set();
  for (let s = 0; s < breath; s++) for (const r of BREATH_ROWS[s] ?? []) widened.add(r);

  for (const [y, x0, x1] of spans) {
    const g = widened.has(y) ? 1 : 0;
    fspan(y, x0 - g, x1 + g, SLOT.COAT_BASE, R.BODY);
  }

  fspan(19, 11, 19, SLOT.COAT_SHADOW, R.BODY);

  return cell;
}

function buildBody_N(variant) {
  const { cell, fspan, fspanMirror } = makeBuilder('body', 'N');
  const R = REGION;
  const breath = variant;

  // Seen from behind — symmetric, like S but no chest features
  const widened = new Set();
  for (let s = 0; s < breath; s++) for (const r of BREATH_ROWS[s] ?? []) widened.add(r);

  for (const [y, x0, x1] of BODY_SPANS) {
    const g = widened.has(y) ? 1 : 0;
    fspan(y, x0 - g, x1 + g, SLOT.COAT_BASE, R.BODY);
  }

  fspan(19, 12, 19, SLOT.COAT_SHADOW, R.BODY);
  for (let y = 28; y <= 30; y++) fspan(y, 15, 16, SLOT.COAT_SHADOW, R.BODY);

  return cell;
}

// ---------------------------------------------------------------------------
// TAIL art — per direction
// ---------------------------------------------------------------------------

// Rig.js tail spans reused for S direction.
const TAIL_SPANS = [
  [28, 25, 29], [27, 25, 29], [26, 25, 29], [25, 25, 28],
  [24, 25, 28], [23, 24, 27], [22, 24, 27], [21, 23, 26],
  [20, 23, 25], [19, 22, 24], [18, 22, 23], [17, 21, 22],
  [16, 21, 21],
];

function buildTail_S() {
  const { cell, fspan } = makeBuilder('tail', 'S');
  for (const [y, x0, x1] of TAIL_SPANS) {
    fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  }
  return cell;
}

function buildTail_SE() {
  const { cell, fspan } = makeBuilder('tail', 'SE');
  const spans = [
    [27, 23, 27], [26, 23, 27], [25, 23, 26], [24, 22, 26],
    [23, 22, 25], [22, 21, 25], [21, 21, 24], [20, 20, 23],
    [19, 20, 22], [18, 19, 21], [17, 19, 20], [16, 18, 19],
  ];
  for (const [y, x0, x1] of spans) fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  return cell;
}

function buildTail_E() {
  const { cell, fspan } = makeBuilder('tail', 'E');
  // Tail extends left, curving upward
  const spans = [
    [27, 6, 10], [26, 5, 10], [25, 4, 9], [24, 3, 9],
    [23, 3, 8], [22, 2, 7], [21, 2, 6], [20, 2, 5],
    [19, 2, 4], [18, 3, 4], [17, 3, 4],
  ];
  for (const [y, x0, x1] of spans) fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  return cell;
}

function buildTail_NE() {
  const { cell, fspan } = makeBuilder('tail', 'NE');
  // Behind-and-left tail — visible because cat faces away
  const spans = [
    [27, 6, 10], [26, 5, 10], [25, 5, 9], [24, 4, 9],
    [23, 4, 8], [22, 3, 8], [21, 3, 7], [20, 3, 6],
    [19, 3, 5], [18, 4, 5], [17, 4, 5],
  ];
  for (const [y, x0, x1] of spans) fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  return cell;
}

function buildTail_N() {
  const { cell, fspan } = makeBuilder('tail', 'N');
  // Same side as S, curving upward and visible above hips
  for (const [y, x0, x1] of TAIL_SPANS) {
    fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  }
  return cell;
}

// ---------------------------------------------------------------------------
// LEG art — per direction
// ---------------------------------------------------------------------------

/**
 * Legs at 32px are 3-4px wide columns with a paw at the bottom. In the
 * S direction only the paws are visible (the body covers the upper leg).
 * In E direction, the full leg length shows.
 *
 * Front legs have a lighter paw (FUR_LIGHT). Back legs are plain COAT_BASE
 * with a darker foot — visually distinguishes front from rear.
 */

function buildLeg_S(isFront) {
  // In S view, legs are mostly hidden behind the body. Only paws show at y28-30.
  const partId = isFront ? 'legFL' : 'legBL';
  const { cell, fspan, fset } = makeBuilder(partId, 'S');
  const R = REGION;

  // Minimal upper leg visible above paw
  fspan(27, 10, 13, SLOT.COAT_BASE, R.LEG);
  fspan(28, 10, 13, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);
  fspan(29, 9, 13, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);
  fspan(30, 9, 12, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);

  // Toe split
  if (isFront) {
    fset(11, 29, SLOT.OUTLINE_SOFT, R.LEG);
    fset(11, 30, SLOT.OUTLINE_SOFT, R.LEG);
  }

  return cell;
}

function buildLeg_SE(isFront) {
  const partId = isFront ? 'legFL' : 'legBL';
  const { cell, fspan } = makeBuilder(partId, 'SE');
  const R = REGION;

  // More of the leg visible in 3/4 view
  for (let y = 25; y <= 27; y++) fspan(y, 13, 16, SLOT.COAT_BASE, R.LEG);
  fspan(28, 13, 16, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);
  fspan(29, 12, 16, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);
  fspan(30, 12, 15, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);

  return cell;
}

function buildLeg_E(isFront) {
  const partId = isFront ? 'legFL' : 'legBL';
  const { cell, fspan } = makeBuilder(partId, 'E');
  const R = REGION;

  // Full side view — tall, narrow column
  for (let y = 23; y <= 27; y++) fspan(y, 14, 17, SLOT.COAT_BASE, R.LEG);
  fspan(28, 14, 17, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);
  fspan(29, 13, 17, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);
  fspan(30, 13, 16, isFront ? SLOT.FUR_LIGHT : SLOT.COAT_BASE, R.LEG);

  return cell;
}

function buildLeg_NE(isFront) {
  const partId = isFront ? 'legFL' : 'legBL';
  const { cell, fspan } = makeBuilder(partId, 'NE');
  const R = REGION;

  // Seen from behind — similar to SE but no special paw detail
  for (let y = 25; y <= 27; y++) fspan(y, 13, 16, SLOT.COAT_BASE, R.LEG);
  fspan(28, 13, 16, SLOT.COAT_BASE, R.LEG);
  fspan(29, 12, 16, SLOT.COAT_BASE, R.LEG);
  fspan(30, 12, 15, SLOT.COAT_BASE, R.LEG);

  return cell;
}

function buildLeg_N(isFront) {
  const partId = isFront ? 'legFL' : 'legBL';
  const { cell, fspan } = makeBuilder(partId, 'N');
  const R = REGION;

  // Symmetric back view, same as S but no paw detail
  fspan(27, 10, 13, SLOT.COAT_BASE, R.LEG);
  fspan(28, 10, 13, SLOT.COAT_BASE, R.LEG);
  fspan(29, 9, 13, SLOT.COAT_BASE, R.LEG);
  fspan(30, 9, 12, SLOT.COAT_BASE, R.LEG);

  return cell;
}

// ---------------------------------------------------------------------------
// Atlas builder
// ---------------------------------------------------------------------------

const HEAD_BUILDERS = { S: buildHead_S, SE: buildHead_SE, E: buildHead_E, NE: buildHead_NE, N: buildHead_N };
const BODY_BUILDERS = { S: buildBody_S, SE: buildBody_SE, E: buildBody_E, NE: buildBody_NE, N: buildBody_N };
const TAIL_BUILDERS = { S: buildTail_S, SE: buildTail_SE, E: buildTail_E, NE: buildTail_NE, N: buildTail_N };

const LEG_BUILDERS = {
  S:  buildLeg_S,
  SE: buildLeg_SE,
  E:  buildLeg_E,
  NE: buildLeg_NE,
  N:  buildLeg_N,
};

/** Number of variants per part. */
const VARIANT_COUNT = {
  body: 3,   // rest, mid-breath, peak-breath
  head: 2,   // eyes-open, eyes-closed
  tail: 1,
  legFL: 1, legFR: 1, legBL: 1, legBR: 1,
};

/**
 * Builds every part for every authored direction.
 *
 * @returns {Record<string, Record<string, Array<{w,h,px,regions}>>>}
 *          part -> direction -> [variant cells]
 */
function buildPartAtlas() {
  const atlas = {};
  for (const part of PART_IDS) atlas[part] = {};

  for (const dir of AUTHORED) {
    // Head — 2 variants (open/closed eyes)
    atlas.head[dir] = [];
    for (let v = 0; v < VARIANT_COUNT.head; v++) {
      atlas.head[dir].push(HEAD_BUILDERS[dir](v));
    }

    // Body — 3 variants (breath levels)
    atlas.body[dir] = [];
    for (let v = 0; v < VARIANT_COUNT.body; v++) {
      atlas.body[dir].push(BODY_BUILDERS[dir](v));
    }

    // Tail — 1 variant
    atlas.tail[dir] = [TAIL_BUILDERS[dir]()];

    // Legs — 1 variant each
    // Front legs are built with isFront=true, back legs with isFront=false.
    // Left and right legs share the same cell art (mirrored by the compositor
    // when needed, or distinguished only by draw order in S/N views).
    const frontLeg = LEG_BUILDERS[dir](true);
    const backLeg = LEG_BUILDERS[dir](false);
    atlas.legFL[dir] = [{ ...frontLeg, px: frontLeg.px.slice(), regions: frontLeg.regions.slice() }];
    atlas.legFR[dir] = [{ ...frontLeg, px: frontLeg.px.slice(), regions: frontLeg.regions.slice() }];
    atlas.legBL[dir] = [{ ...backLeg, px: backLeg.px.slice(), regions: backLeg.regions.slice() }];
    atlas.legBR[dir] = [{ ...backLeg, px: backLeg.px.slice(), regions: backLeg.regions.slice() }];
  }

  return atlas;
}

module.exports = {
  PART_CELLS,
  PART_IDS,
  REGION,
  VARIANT_COUNT,
  buildPartAtlas,
  mirrorCell,
  makeCell,
  cellSet,
  cellSpan,
};
