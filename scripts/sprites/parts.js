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

/**
 * Records paint operations in frame coordinates; the cell is sized to fit them
 * afterwards by finalizeCell().
 *
 * The previous version allocated a fixed-size cell from PART_CELLS up front and
 * relied on cellSet's bounds check to discard anything outside it — silently.
 * That dropped **208 authored pixels** across the atlas: every leg on the
 * N-facing cat (all four rendered zero pixels), three of E's four legs, and the
 * entire E tail. Nothing warned, and the art looked "drawn but wrong" rather
 * than "not drawn".
 *
 * Sizing the cell to the art it actually contains makes that impossible, and
 * has a second effect worth understanding: the anchor now CANCELS OUT of the
 * compositor's placement maths.
 *
 *   ax  = (root.x + anchor[0]) - bboxX0
 *   fx  = root.x + anchor[0] + dx - ax   ==>   fx = bboxX0 + dx
 *
 * So a part lands exactly where it was authored, shifted only by the animation
 * offset. That is what frame-space authoring was always meant to mean.
 */
function makeBuilder(partId, dir) {
  const ops = [];
  const cell = {
    __pending: { ops, root: ROOTS[dir], offset: ANCHORS[dir][partId], partId, dir },
  };

  const record = (x, y, slot, region) => {
    // EMPTY is a visual no-op and must not inflate the bounding box.
    if (slot === SLOT.EMPTY) return;
    ops.push({ x, y, slot, region });
  };

  return {
    cell,
    /** Set a pixel in frame coordinates. */
    fset(frameX, frameY, slot, region) {
      record(frameX, frameY, slot, region);
    },
    /** Fill a horizontal span in frame coordinates. */
    fspan(frameY, frameX0, frameX1, slot, region) {
      for (let x = frameX0; x <= frameX1; x++) record(x, frameY, slot, region);
    },
    /** Fill a mirrored pair of spans about frame CX=15.5. */
    fspanMirror(frameY, frameX0, frameX1, slot, region) {
      for (let x = frameX0; x <= frameX1; x++) record(x, frameY, slot, region);
      for (let x = 31 - frameX1; x <= 31 - frameX0; x++) record(x, frameY, slot, region);
    },
  };
}

/**
 * Sizes a pending cell to its art and rasterises it, in place.
 *
 * Mutates rather than returning a new object so the builders can keep their
 * `return cell` shape — twenty functions that would otherwise all need editing.
 */
function finalizeCell(cell) {
  const pending = cell.__pending;
  if (!pending) return cell; // already finalised
  delete cell.__pending;

  const { ops, root, offset, partId, dir } = pending;

  if (ops.length === 0) {
    // A part that paints nothing is almost always a bug, but it is not this
    // function's job to decide that — buildPartAtlas reports it.
    Object.assign(cell, {
      w: 1, h: 1, ax: 0, ay: 0,
      px: new Uint8Array(1), regions: new Uint8Array(1),
      partId, dir, painted: 0,
    });
    return cell;
  }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const op of ops) {
    if (op.x < x0) x0 = op.x;
    if (op.x > x1) x1 = op.x;
    if (op.y < y0) y0 = op.y;
    if (op.y > y1) y1 = op.y;
  }

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const px = new Uint8Array(w * h);
  const regions = new Uint8Array(w * h);

  for (const op of ops) {
    const i = (op.y - y0) * w + (op.x - x0);
    px[i] = op.slot;
    if (op.region !== undefined) regions[i] = op.region;
  }

  Object.assign(cell, {
    w, h, px, regions,
    ax: (root.x + offset[0]) - x0,
    ay: (root.y + offset[1]) - y0,
    partId, dir,
    painted: ops.length,
  });
  return cell;
}

// ---------------------------------------------------------------------------
// HEAD art — per direction
// ---------------------------------------------------------------------------

// Rig.js coordinate data (S direction), reused directly via frame-space helpers.
const HEAD_TOP = 6;
/**
 * y6..y19. The final entry is a neck stub that overlaps the torso.
 *
 * The joint has to belong to the HEAD, not the body. Closing the gap from the
 * torso side is correct for a static pose and fails the moment the head takes a
 * `dy` — a 1px head lift on a walk contact frame opened a gap on 12 of 80
 * frames, 4 of which flood-filled as a fully detached 136-pixel head.
 *
 * This is a local copy; rig.js keeps its own 13-entry table so the shipping
 * whole-frame sheets stay byte-identical.
 */
const HEAD_HALF = [5, 6, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4, 3];
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
    // Neck stub overlapping the torso — see HEAD_HALF. Draw order hides it.
    [18, 14, 19], [19, 15, 18],
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

  // Ear, angled back rather than straight up — a profile cat's ear tilts with
  // the skull, and a vertical one reads as a comb.
  for (const [y, x0, x1] of [[4, 18, 20], [5, 18, 21], [6, 18, 22]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }
  fspan(5, 19, 20, SLOT.PINK, R.EAR);

  /**
   * Profile skull as a WEDGE, not a sphere.
   *
   * The previous table was an 11x11 circle with a 2px protrusion and no neck,
   * finished off by a 2px block of PINK at the very tip. That is the anatomical
   * definition of a rubber duck, and the mackerel pattern's flank blotch
   * completed the read as a folded wing.
   *
   * A cat in profile has a high sloping cranium, a brow at the widest point,
   * then a distinct step down and FORWARD to a muzzle that sits low, with a
   * chin undercutting it.
   */
  const skullSpans = [
    [7, 17, 24],   // cranium top
    [8, 16, 25],
    [9, 15, 26],   // brow — widest
    [10, 15, 26],
    [11, 15, 26],  // eye row
    [12, 15, 27],  // cheek; muzzle begins
    [13, 16, 28],  // muzzle full extension
    [14, 16, 28],
    [15, 17, 27],  // jaw — lands directly on the shoulder at y16
    // No throat/neck rows here. A 7px row over a 5px row, under a 12px skull
    // and above a 12px shoulder, is three consecutive rows below 8px — a 12px
    // pencil neck at 4x, which read as a meerkat. The jaw now meets the
    // shoulder in one transition instead of three.
  ];
  for (const [y, x0, x1] of skullSpans) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.HEAD);
  }

  // Under-lash
  fspan(9, 22, 24, SLOT.OUTLINE_SOFT, R.HEAD);

  if (variant === 1) {
    fspan(10, 22, 24, SLOT.OUTLINE_SOFT, R.HEAD);
  } else {
    // One eye in profile, sitting under the brow rather than beside the muzzle.
    for (let y = 10; y <= 11; y++) fspan(y, 22, 24, SLOT.EYE, R.HEAD);
    fset(24, 11, SLOT.EYE_DARK, R.HEAD);
    fset(22, 10, SLOT.EYE_SHINE, R.HEAD);
  }

  // Muzzle: low and forward, with the nose a SINGLE pixel at its top-front.
  // A 2px block at the tip was most of the bill.
  fspan(12, 26, 28, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(13, 26, 28, SLOT.FUR_LIGHT, R.MUZZLE);
  fspan(14, 26, 28, SLOT.FUR_LIGHT, R.MUZZLE);
  fset(28, 12, SLOT.PINK, R.MUZZLE);
  // Chin, undercutting the muzzle — the other half of what stops a beak read.
  fspan(15, 26, 27, SLOT.OUTLINE_SOFT, R.MUZZLE);

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
    // Neck stub overlapping the torso — see HEAD_HALF. NE and NW were the two
    // directions where nothing bridged the gap, so a lifted head flood-filled
    // as a detached fragment.
    [18, 14, 19], [19, 15, 18],
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

  // 3/4 body — slightly wider right, angled.
  // y18 is a neck row. The skull ends at y17 and the torso used to start at
  // y19, leaving that row empty — the head floated, and after outlining the gap
  // read as a decapitation seam. buildBody_E already starts at y18; SE and NE
  // did not.
  const spans = [
    [18, 13, 20],
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

  // Side view — elongated, rounder. Rises to a 6px neck at y17 so the wedge
  // skull sits on shoulders rather than balancing on the torso's top edge.
  const spans = [
    [16, 16, 22], [17, 13, 23], [18, 12, 23], [19, 9, 23], [20, 7, 23], [21, 6, 23],
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

  // Same width profile as SE, but seen from behind. y18 is the neck row —
  // see buildBody_SE.
  const spans = [
    [18, 13, 20],
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
  // Raised tail, rising clear of the back line with a hook at the tip.
  // The old table topped out at y17 against a body whose top row is y18, so
  // almost all of it was painted underneath the torso — 0 visible pixels. A
  // tail that clears the silhouette is the strongest "cat, not duck" signal
  // available in profile, so it has to actually show.
  // Tapers 5,5,5,4,4,4,4,4,3,3,2,2,2,1 — the profile rig.js uses. A constant
  // 4-5px width over fifteen rows reads as a limb, not a tail.
  const spans = [
    [27, 5, 9], [26, 5, 9], [25, 4, 8], [24, 4, 7],
    [23, 3, 6], [22, 3, 6], [21, 2, 5], [20, 2, 5],
    [19, 2, 4], [18, 2, 4], [17, 2, 3], [16, 2, 3],
    [15, 3, 4], [14, 4, 4],
  ];
  for (const [y, x0, x1] of spans) fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  return cell;
}

function buildTail_NE() {
  const { cell, fspan } = makeBuilder('tail', 'NE');
  // Behind-and-left tail, raised clear of the back line. Same reasoning as
  // buildTail_E: below the body's top row it is simply painted over.
  // Tapered like buildTail_E, and the shaft moved outboard to x2-x5. It used to
  // sit at x3-x10 at constant 5-6px width, lying across a hip whose left edge
  // is x6-x7 — 69 visible pixels, half the head's mass, drawn last so nothing
  // occluded it. It read as a raised arm.
  const spans = [
    [27, 4, 8], [26, 4, 8], [25, 3, 7], [24, 3, 6],
    [23, 2, 5], [22, 2, 5], [21, 2, 5], [20, 2, 5],
    [19, 2, 4], [18, 2, 4], [17, 2, 3], [16, 2, 3],
    [15, 3, 4], [14, 4, 4],
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

/**
 * Where each leg sits, per direction: [x0, x1, topY, far].
 *
 * Every leg is authored at its true frame position and built against its OWN
 * part id, so self-sizing cells place it exactly where it was drawn. Previously
 * one shared cell was built for "front" and one for "back", and the anchor
 * delta was expected to separate the copies — which put all four E legs within
 * a pixel of each other and every N leg outside its own cell.
 *
 * `far` legs are painted entirely in COAT_DARK. At 32px depth reads through
 * value, not perspective, and front-vs-back was previously distinguished by paw
 * colour — the wrong axis. Near-vs-far is what the eye needs.
 *
 * Near and far legs overlap by design; draw order puts far first so the near
 * leg occludes it, leaving a sliver that reads as a second limb behind.
 * Nothing reaches y31 — that row belongs to the ground shadow.
 */
const LEG_LAYOUT = {
  // Front-on: front paws forward, back paws peeking outboard behind them.
  S: {
    legFL: [10, 13, 27, false], legFR: [18, 21, 27, false],
    legBL: [7, 9, 28, true], legBR: [22, 24, 28, true],
  },
  // Three-quarter: near side is the cat's right, so legFR/legBR lead.
  SE: {
    legFL: [14, 17, 25, true], legFR: [17, 20, 25, false],
    legBL: [7, 10, 26, true], legBR: [9, 12, 26, false],
  },
  // Profile: full leg columns, front pair right, back pair left.
  E: {
    legFL: [16, 19, 23, true], legFR: [18, 21, 23, false],
    legBL: [6, 9, 23, true], legBR: [8, 11, 23, false],
  },
  // Rear three-quarter: hindquarters lead, front legs mostly occluded.
  // Rear three-quarter: hindquarters lead and both hind legs are visible, so
  // they spread either side of centre rather than crowding it. Front legs sit
  // behind the torso in draw order and barely show, which is correct.
  NE: {
    legFL: [7, 10, 27, true], legFR: [9, 12, 27, true],
    legBL: [10, 13, 25, true], legBR: [17, 20, 25, false],
  },
  // Rear: hind paws forward, front paws peeking outboard.
  N: {
    legFL: [7, 9, 28, true], legFR: [22, 24, 28, true],
    legBL: [10, 13, 27, false], legBR: [18, 21, 27, false],
  },
};

/**
 * Draws one leg: a column down to a slightly wider paw.
 * The paw flares one pixel left and loses one on the last row, which is what
 * stops it reading as a rectangle.
 */
function buildLeg(dir, legId) {
  const { cell, fspan, fset } = makeBuilder(legId, dir);
  const R = REGION;
  const [x0, x1, top, far] = LEG_LAYOUT[dir][legId];

  const shaft = far ? SLOT.COAT_DARK : SLOT.COAT_BASE;
  const paw = far ? SLOT.COAT_DARK : SLOT.FUR_LIGHT;

  for (let y = top; y <= 28; y++) fspan(y, x0, x1, shaft, R.LEG);
  fspan(29, x0 - 1, x1, paw, R.LEG);
  fspan(30, x0 - 1, x1 - 1, paw, R.LEG);

  // Toe split, near legs only — invisible on a dark far leg and just noise.
  if (!far) {
    const toe = x0 + Math.floor((x1 - x0) / 2);
    fset(toe, 29, SLOT.OUTLINE_SOFT, R.LEG);
    fset(toe, 30, SLOT.OUTLINE_SOFT, R.LEG);
  }

  return cell;
}

// ---------------------------------------------------------------------------
// Atlas builder
// ---------------------------------------------------------------------------

const HEAD_BUILDERS = { S: buildHead_S, SE: buildHead_SE, E: buildHead_E, NE: buildHead_NE, N: buildHead_N };
const BODY_BUILDERS = { S: buildBody_S, SE: buildBody_SE, E: buildBody_E, NE: buildBody_NE, N: buildBody_N };
const TAIL_BUILDERS = { S: buildTail_S, SE: buildTail_SE, E: buildTail_E, NE: buildTail_NE, N: buildTail_N };

// Legs no longer need a per-direction builder table — buildLeg(dir, legId)
// reads LEG_LAYOUT directly.

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
  const empty = [];

  /** Finalises a pending cell and flags it if it painted nothing. */
  const fin = (cell) => {
    finalizeCell(cell);
    if (cell.painted === 0) empty.push(`${cell.partId}/${cell.dir}`);
    return cell;
  };

  for (const dir of AUTHORED) {
    // Head — 2 variants (open/closed eyes)
    atlas.head[dir] = [];
    for (let v = 0; v < VARIANT_COUNT.head; v++) {
      atlas.head[dir].push(fin(HEAD_BUILDERS[dir](v)));
    }

    // Body — 3 variants (breath levels)
    atlas.body[dir] = [];
    for (let v = 0; v < VARIANT_COUNT.body; v++) {
      atlas.body[dir].push(fin(BODY_BUILDERS[dir](v)));
    }

    // Tail — 1 variant
    atlas.tail[dir] = [fin(TAIL_BUILDERS[dir]())];

    // Legs — four distinct cells, each authored at its own frame position.
    for (const legId of ['legFL', 'legFR', 'legBL', 'legBR']) {
      atlas[legId][dir] = [fin(buildLeg(dir, legId))];
    }
  }

  // A part that paints nothing is always a bug and used to be invisible.
  if (empty.length) {
    console.warn(`[parts] ${empty.length} part(s) painted no pixels: ${empty.join(', ')}`);
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
