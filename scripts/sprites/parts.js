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

/**
 * The cat's right ear, tipped outward mid-flick.
 *
 * The base stays where it is and only the tip swings — rotating the whole ear
 * would leave it floating off the skull. Ear flicks are the cheapest "this
 * animal is awake and listening" cue there is: two frames, no body movement,
 * and it breaks up a breathing loop that otherwise reads as a texture.
 */
const EAR_FLICKED = [[5, 22, 23], [6, 21, 24], [7, 19, 24], [8, 17, 23]];

/**
 * Head variants. Numeric because the frame tables address them by index, named
 * because `v: 4` in an animation table tells you nothing.
 *
 * OPEN and SHUT are load-bearing and must keep indices 0 and 1 — the sleep
 * animation and the whole-frame rig both already reference them.
 */
const HEAD_V = {
  OPEN: 0,
  SHUT: 1,
  /** Half-lidded. The in-between a blink needs to not read as a flicker. */
  SQUINT: 2,
  /** Eyes screwed shut, mouth gaping. */
  YAWN: 3,
  /** Eyes shut, tongue out — mid-groom. */
  LICK: 4,
  /** Eyes open, one ear tipped. */
  EAR_FLICK: 5,
};

function buildHead_S(variant) {
  const { cell, fspan, fspanMirror, fset } = makeBuilder('head', 'S');
  const R = REGION;

  /**
   * Ears behind the skull.
   *
   * Mid-flick the RIGHT ear is replaced, not supplemented. Drawing the flicked
   * spans on top of the upright ones left the upright tip at y3 still standing
   * and added eight pixels beside it, so the cat grew a third ear instead of
   * tipping one — a lump, not a flick.
   */
  const flicking = variant === HEAD_V.EAR_FLICK;
  for (const [y, x0, x1] of EAR) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
    // The right ear is the one that flicks, so it is drawn from whichever
    // table applies rather than mirrored unconditionally.
    if (!flicking) fspan(y, 31 - x1, 31 - x0, SLOT.COAT_BASE, R.EAR);
  }
  if (flicking) {
    for (const [y, x0, x1] of EAR_FLICKED) {
      fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
    }
  }
  // Skull overwrites ear bases
  for (let i = 0; i < HEAD_HALF.length; i++) {
    const h = HEAD_HALF[i];
    if (h <= 0) continue;
    fspan(HEAD_TOP + i, Math.ceil(CX - h), Math.floor(CX + h), SLOT.COAT_BASE, R.HEAD);
  }
  // Inner ears. The right one has to follow wherever the right ear went, or
  // the pink is left behind on the bare skull.
  for (const [y, x0, x1] of EAR_INNER) {
    fspan(y, x0, x1, SLOT.PINK, R.EAR);
    if (!flicking) fspan(y, 31 - x1, 31 - x0, SLOT.PINK, R.EAR);
  }
  if (flicking) fspan(6, 22, 23, SLOT.PINK, R.EAR);
  // Under-lash
  fspanMirror(11, 11, 13, SLOT.OUTLINE_SOFT, R.HEAD);

  const shut = variant === HEAD_V.SHUT || variant === HEAD_V.YAWN || variant === HEAD_V.LICK;

  if (shut) {
    /**
     * Closed eyes, two rows deep.
     *
     * One row of lid left the lower row of each eye socket showing plain coat,
     * so open-to-shut changed about twelve pixels — 2.2% of the sprite, and
     * the smallest movement of any idle by a factor of twelve. At the size
     * cats render, a blink that quiet is a blink nobody sees. Taking the lid
     * down over both rows doubles the change and, more usefully, swaps EYE for
     * OUTLINE_SOFT rather than for COAT_BASE, so it is a value change as well
     * as a shape change. It also gives the sleep pose a far stronger read.
     */
    fspan(12, 11, 13, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(12, 18, 20, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(13, 11, 13, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(13, 18, 20, SLOT.OUTLINE_SOFT, R.HEAD);
  } else if (variant === HEAD_V.SQUINT) {
    // Half-lidded: the upper lid drops onto the top row of the eye, leaving one
    // row of iris. Going straight from two rows of eye to none is a one-frame
    // pop — this is the frame that turns a pop into a blink.
    fspan(12, 11, 13, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(12, 18, 20, SLOT.OUTLINE_SOFT, R.HEAD);
    fspan(13, 11, 13, SLOT.EYE, R.HEAD);
    fspan(13, 18, 20, SLOT.EYE, R.HEAD);
    fset(11, 13, SLOT.EYE_DARK, R.HEAD);
    fset(20, 13, SLOT.EYE_DARK, R.HEAD);
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

  if (variant === HEAD_V.YAWN) {
    /**
     * A gape, three rows deep.
     *
     * Reaching y19 puts the chin on the torso's own top row, which is exactly
     * what we want — the head draws last in S, so the mouth paints over the
     * chest and the jaw reads as having dropped rather than as a hole in the
     * face. Anything shallower than three rows reads as a frown at this size.
     */
    fspan(16, 13, 18, SLOT.OUTLINE_SOFT, R.MUZZLE);
    fspan(17, 12, 19, SLOT.OUTLINE_SOFT, R.MUZZLE);
    fspan(17, 14, 17, SLOT.PINK, R.MUZZLE);
    fspan(18, 13, 18, SLOT.OUTLINE_SOFT, R.MUZZLE);
    fspan(18, 15, 16, SLOT.PINK, R.MUZZLE);
    fspan(19, 14, 17, SLOT.OUTLINE_SOFT, R.MUZZLE);
  } else if (variant === HEAD_V.LICK) {
    // Mouth line on one side only, with the tongue out the other — a tongue
    // centred under a symmetric mouth reads as a goatee.
    fspan(17, 13, 14, SLOT.OUTLINE_SOFT, R.MUZZLE);
    fspan(17, 16, 17, SLOT.PINK, R.MUZZLE);
    fspan(18, 16, 17, SLOT.PINK, R.MUZZLE);
  } else {
    fspan(17, 13, 14, SLOT.OUTLINE_SOFT, R.MUZZLE);
    fspan(17, 17, 18, SLOT.OUTLINE_SOFT, R.MUZZLE);
  }

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
    [15, 17, 27],  // jaw
    // One joint row at shoulder width, overlapping the torso's own top row.
    //
    // This is NOT the old pencil neck: that was 7px over 5px between a 12px
    // skull and a 12px shoulder — three consecutive rows under 8px, which read
    // as a meerkat. This is a single 8px row between an 11px jaw and an 11px
    // chest. It exists so E and W match the other six directions in carrying
    // their own joint, rather than relying on head.dy === body.dy staying true
    // forever. The next animation that turns or lowers the head would otherwise
    // reopen the gap here and nowhere else.
    [16, 16, 23],
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

  /**
   * BOTH ear backs, not one.
   *
   * This drew only the near ear, which left the rear three-quarter head as a
   * smooth slab with a single bump — and with no strong "this end is the head"
   * cue, the eye kept choosing the raised tail instead and NE read as a bird
   * through three rounds of tail fixes. N has had both ears all along and N
   * reads; it is close to the only thing the two directions differ in.
   *
   * The far ear is smaller and set lower, because at three-quarters it is
   * turning away behind the skull.
   */
  for (const [y, x0, x1] of [[5, 20, 22], [6, 19, 23], [7, 19, 23]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }
  for (const [y, x0, x1] of [[6, 13, 15], [7, 12, 16]]) {
    fspan(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }

  // Back of skull — no face. Pulled in a pixel each side from the SE profile
  // for the same reason as HEAD_HALF_REAR: seen from behind there are no cheeks
  // to widen it, and at full width it fused with the shoulders.
  const skullSpans = [
    [7, 12, 21], [8, 11, 22], [9, 11, 22], [10, 11, 22],
    [11, 11, 22], [12, 11, 21], [13, 12, 21], [14, 12, 21],
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

/**
 * The back of a skull is narrower than the front of one.
 *
 * N reused HEAD_HALF, the front-view profile, which peaks at 8 — a 17px head on
 * a 20px shoulder. With nothing between them the two masses fused into a single
 * egg and the rear views read as owls. Cheeks and whisker pads are what make a
 * cat's head wide, and from behind you see neither, so the rear profile peaks
 * at 7 and tucks harder at the nape. The 4px of shoulder now showing either
 * side is the neck.
 */
const HEAD_HALF_REAR = [4, 5, 6, 7, 7, 7, 7, 6, 6, 5, 5, 4, 4, 3];

function buildHead_N(variant) {
  const { cell, fspan, fspanMirror } = makeBuilder('head', 'N');
  const R = REGION;

  // Both ear backs visible. Drawn against the narrower skull they now stand
  // proud of it, which is how ears read from behind.
  for (const [y, x0, x1] of EAR) {
    fspanMirror(y, x0, x1, SLOT.COAT_BASE, R.EAR);
  }

  // Back of skull — symmetric, no face features
  for (let i = 0; i < HEAD_HALF_REAR.length; i++) {
    const h = HEAD_HALF_REAR[i];
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

  /**
   * Side view. Rises to a 6px neck at y17 so the wedge skull sits on shoulders
   * rather than balancing on the torso's top edge.
   *
   * The back line is the change worth explaining. It used to walk leftward one
   * or two pixels per row all the way from y16 to y21 — a continuous diagonal
   * ramp from the neck to the rump, which is a duck's back, not a cat's. A cat
   * in profile has a short steep rise at the withers and then a near-level
   * spine. Compressing the whole rise into y16-y19 and holding x5-x6 flat from
   * y20 gives the level run, and it is most of why the profile stopped reading
   * as waterfowl.
   */
  const spans = [
    [16, 17, 22], [17, 14, 23], [18, 10, 23], [19, 7, 24],
    [20, 6, 24], [21, 5, 24],
    [22, 5, 24], [23, 5, 24], [24, 5, 24],
    // Belly. The torso used to run to y30 — the ground line — so the profile
    // had no daylight under it anywhere and flattened to a solid lump. A
    // quadruped seen side-on is read almost entirely from the gap between its
    // front and back legs; without that gap there is no four-legged animal in
    // the shape, which is the other half of why E and W read as ducks.
    [25, 5, 23],
    // Chest and haunch hang below the belly line as two separate masses. The
    // 7px of open ground between them at x11-x17 is the whole point.
    [26, 6, 10], [26, 18, 22],
    [27, 6, 10], [27, 19, 22],
  ];

  const widened = new Set();
  for (let s = 0; s < breath; s++) for (const r of BREATH_ROWS[s] ?? []) widened.add(r);

  for (const [y, x0, x1] of spans) {
    const g = widened.has(y) ? 1 : 0;
    fspan(y, x0 - g, x1 + g, SLOT.COAT_BASE, R.BODY);
  }

  // Shoulder definition
  fspan(18, 19, 22, SLOT.COAT_SHADOW, R.BODY);
  /**
   * Belly highlight, INSIDE the span table.
   *
   * It used to sit at y28, one row below the torso's last span — and because
   * finalizeCell sizes a cell to the ops it was given, that stray 7px bar
   * became part of the body silhouette. It welded the chest mass to the haunch
   * mass straight across the daylight the span rewrite had just opened,
   * leaving 6 transparent pixels between the leg pairs where the comment above
   * claims 7 columns of open ground. The whole point of raising the belly was
   * undone one line later by a highlight nobody thought of as geometry.
   */
  fspan(24, 9, 16, SLOT.FUR_LIGHT, R.BODY);

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
/**
 * y18 starts at x21, not x22, so the tail carries its own joint to the body.
 *
 * With `tail: {dx:1}` on walk frame 0 the wedge between the body's right edge
 * and the tail widened from 2px to 3px at that row, and a 1px outline dilate
 * bridges 2px but not 3 — leaving a single enclosed hole that sparkles for
 * 180ms every cycle. Same principle as the head's neck stub: let the part span
 * the joint rather than relying on a neighbour to be in the right place.
 */
/**
 * The base rows stop at x28, not x29.
 *
 * The walk cycle gives the tail a `dx: 1` on its left-contact frame as
 * follow-through, which pushed art to x30 and its keyline to x31 — flush
 * against the next frame packed beside it in the sheet, with no margin at all.
 * A tail needs room to swing inside its own cell, so the room is reserved in
 * the art rather than taken out of the animation.
 */
const TAIL_SPANS = [
  [28, 25, 28], [27, 25, 28], [26, 25, 28], [25, 25, 28],
  [24, 25, 28], [23, 24, 27], [22, 24, 27], [21, 23, 26],
  [20, 23, 25], [19, 22, 24], [18, 21, 23], [17, 21, 22],
  [16, 21, 21],
];

/**
 * Tail variants: 0 rest, 1 swung out, 2 swung in.
 *
 * The swing is applied as a per-row shift that grows toward the TIP and is zero
 * at the root, which is the whole trick. Translating the part wholesale — which
 * is all an animation `dx` can do — slides the root off the hip and opens a gap
 * the outline pass cannot bridge. A tail bends; it does not slide. Building the
 * bend into the art is the only way to get it at this size, since the pipeline
 * rightly refuses to rotate anything.
 *
 * TAIL_SPANS runs bottom-up from y28 to y16, so the index is already a measure
 * of distance from the root.
 */
function buildTail_S(variant = 0) {
  const { cell, fspan } = makeBuilder('tail', 'S');
  const swing = variant === 1 ? 1 : variant === 2 ? -1 : 0;

  TAIL_SPANS.forEach(([y, x0, x1], i) => {
    /**
     * One pixel over the shaft, two at the last two rows.
     *
     * The cap is not timidity. TAIL_SPANS runs tip-last, and rows y18-y20 sit
     * one pixel clear of the head's neck stub — a gap the outline pass bridges
     * because it is 1px wide and becomes 2px after dilation. Swinging those
     * rows two pixels makes it 3px, which the dilate is exactly one pixel short
     * of closing, and the verifier caught the result: three enclosed holes that
     * would have sparkled for 170ms every flick.
     *
     * The top two rows have nothing beside them, so they take the full two and
     * carry the readability.
     */
    /**
     * One pixel over most of the shaft, two at the last two rows — and this is
     * close to the most the S tail can do.
     *
     * The flick is the least visible idle in the set at 21 changed pixels,
     * 3.9% of the sprite, against groom's 45% and look's 38%. The obvious
     * response is more travel; the geometry will not give it. Measured, the
     * tail is boxed in on both sides:
     *
     *   y26-y28  one column of room before the frame edge at col 31
     *   y17-y20  the raised tip is joined to the skull at y16, so swinging
     *            these rows outward widens a wedge that is closed at the top.
     *            Past 2px the outline dilate can no longer bridge it and the
     *            wedge becomes enclosed holes — which is precisely the defect
     *            the verifier caught the first time this was written.
     *
     * So the swing stays small and the SCHEDULER carries the fix instead: the
     * repertoire in catBehaviour.ts weights this well below the idles that
     * have room to move. A flick is punctuation, not a performance.
     */
    /**
     * The ramp is banded, not monotonic, and the shape is dictated by what is
     * next to each row rather than by how far along the tail it is:
     *
     *   i 0-4   (y28-y24)  0px  — one free column before the frame edge
     *   i 5-7   (y23-y21)  2px  — 3-4 free columns, nothing alongside
     *   i 8-10  (y20-y18)  1px  — pinned: the wedge against the head is
     *                             already 2 outline columns here, and a 1px
     *                             dilate bridges 2 but not 3
     *   i 11-12 (y17-y16)  2px  — the tip, clear again
     *
     * The 1px dip in the middle is a pixel off a smooth arc and invisible at
     * this size; the alternative is holding the whole shaft to 1px to keep the
     * curve pure, which costs real motion at the widest part of the tail.
     */
    const band = i >= 11 ? 2 : i >= 8 ? 1 : i >= 5 ? 2 : 0;
    const step = swing * band;
    fspan(y, x0 + step, x1 + step, SLOT.COAT_BASE, REGION.TAIL);
  });
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
  /**
   * Thin, tapered, raked back off the rump at roughly 45 degrees.
   *
   * The previous table was 5px wide for its first six rows and stood thirteen
   * rows tall — taller than the skull and nearly as massive. Flattened to a
   * silhouette, E and NE stopped reading as cats at all: the eye took the tail
   * for a neck and the torso for a body, and both directions read as ducks.
   * That is the same failure the yarn ball had, and it has the same fix —
   * change the outline, not the interior.
   *
   * Three things keep it a tail. It is NARROW (4px at the root, 2px for the
   * last five rows, where the old one was still 4). It RAKES away from the body
   * instead of standing up beside it, so there is no parallel second mass. And
   * it stops at y16, a dozen rows below the ear tips, so it can never compete
   * with the head for "which of these is the front".
   */
  // The raised shaft stops at x3, leaving column 2 free for the walk cycle's
  // `dx: -1` follow-through and column 1 for its keyline. At x2 the swing put
  // the outline on column 0, hard against the neighbouring frame in the sheet.
  const spans = [
    [27, 5, 8], [26, 5, 8], [25, 4, 7], [24, 4, 6],
    [23, 3, 5], [22, 3, 5], [21, 3, 5], [20, 3, 5],
    // Three pixels wide, not two, through the mid-shaft. Moving the tail
    // inboard to clear column 0 left exactly one empty pixel between its
    // keyline and the hind leg's at y17 — enclosed on all four sides, so the
    // outline pass sealed it in rather than filling it. A tail that bridges
    // the gap is better than a one-pixel hole that sparkles once a cycle.
    [19, 3, 5], [18, 3, 5], [17, 3, 5],
    /**
     * Carried up to y13 rather than stopping at y16.
     *
     * Widening the leg stance to open the under-belly arch pushed more of the
     * tail's root behind the near hind leg — visible pixels fell to 20 and the
     * visible part is only three columns wide, which at 54pt reads as a nub
     * rather than as a tail. There was nothing below to recover, but there are
     * twelve rows of clear air above: the torso starts at y16 and the ear tips
     * reach y4, so the tail can stand up without touching anything.
     *
     * The tip still hooks forward. A straight taper reads as a spike, and in
     * profile the hook is safe — the mass below it is 2-3px against a
     * horizontal body, so the whole thing reads as one line. The same hook on
     * NE sat above a 4px shaft against a vertical body and read as a beak,
     * which is why that one is a straight taper now.
     */
    [16, 3, 5], [15, 3, 5], [14, 4, 6], [13, 5, 7],
  ];
  for (const [y, x0, x1] of spans) fspan(y, x0, x1, SLOT.COAT_BASE, REGION.TAIL);
  return cell;
}

function buildTail_NE() {
  const { cell, fspan } = makeBuilder('tail', 'NE');
  /**
   * Behind-and-left tail.
   *
   * The first pass narrowed this for the same reason as buildTail_E and did
   * not narrow it enough: at 38 visible pixels it was still 73% more massive
   * than E's finished tail and carried the highest tail-to-head ratio of any
   * facing (0.31 against E's 0.18), which is why NE and NW went on reading as
   * ducks after E stopped.
   *
   * The root was also simply wrong, and the comment that used to sit here
   * justified it backwards: it claimed a cat's tail leaves from low down
   * because the hip is the highest point seen from behind. A cat's tail leaves
   * from the SACRUM, at the top of the rump. Rooting it at y27-28 — the bottom
   * two rows of a torso spanning y18-30 — had it emerging from under the
   * haunch and curling up and outward, which is the shape of a neck.
   */
  const spans = [
    [25, 4, 7], [24, 4, 7], [23, 3, 6], [22, 3, 6],
    // x3 floor, for the walk cycle's dx:-1 and its keyline — see buildTail_E.
    [21, 3, 5], [20, 3, 5], [19, 3, 4], [18, 3, 4],
    // Straight taper to the tip. The hook that works in profile does not work
    // here: the last row used to kick back toward the body at x3-4, and above
    // a shaft that widens monotonically 2-2-2-3-3-4-4 that is the literal
    // construction of a bird's head — narrow neck, forward beak. It survives
    // in E/W because there the mass below the hook is 2-3px against a
    // horizontal body and the whole thing reads as a line; in NE it is 4px
    // against a vertical body and the eye segments it off as a second head.
    [17, 3, 4], [16, 3, 4],
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
  // Front-on: only the front paws show. The hind pair sits well inside the
  // torso footprint so it is FULLY occluded rather than peeking a speck out
  // past the body taper — a far leg is COAT_DARK, so a 1-3px instance reads as
  // dirt on the silhouette edge, not as a limb. A part should be properly
  // hidden or properly visible. The ±2px walk stride stays inside the body at
  // these positions.
  S: {
    legFL: [10, 13, 27, false], legFR: [18, 21, 27, false],
    // bottom 28, not 30: the walk lifts the body 1px on passing frames, and a
    // hidden leg reaching the ground line gets uncovered when it does.
    legBL: [11, 14, 26, true, 28], legBR: [17, 20, 26, true, 28],
  },
  // Three-quarter: near side is the cat's right, so legFR/legBR lead.
  SE: {
    legFL: [14, 17, 25, true], legFR: [17, 20, 25, false],
    legBL: [11, 14, 26, true, 28], legBR: [15, 18, 26, true, 28],
  },
  /**
   * Profile: full leg columns, front pair right, back pair left.
   *
   * Pushed apart by two pixels each way. The pairs used to stand at x8-11 and
   * x16-19, a four-column gap of which the outline dilation ate one on each
   * side — so the daylight that makes a profile read as a four-legged animal
   * was two pixels wide, about a tenth of the torso length where a standing
   * cat shows nearer a third.
   */
  E: {
    legFL: [18, 21, 23, true], legFR: [20, 23, 23, false],
    legBL: [5, 8, 23, true], legBR: [7, 10, 23, false],
  },
  // Rear three-quarter: hindquarters lead, front legs mostly occluded.
  // Rear three-quarter: hindquarters lead and both hind legs are visible, so
  // they spread either side of centre rather than crowding it. Front legs sit
  // behind the torso in draw order and barely show, which is correct.
  NE: {
    legFL: [11, 14, 26, true, 28], legFR: [15, 18, 26, true, 28],
    legBL: [10, 13, 25, true], legBR: [17, 20, 25, false],
  },
  // Rear: only the hind paws show; the front pair is fully behind the torso.
  N: {
    legFL: [12, 15, 25, true, 27], legFR: [16, 19, 25, true, 27],
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
  const [x0, x1, top, far, bottom = 30] = LEG_LAYOUT[dir][legId];

  const shaft = far ? SLOT.COAT_DARK : SLOT.COAT_BASE;
  const paw = far ? SLOT.COAT_DARK : SLOT.FUR_LIGHT;

  for (let y = top; y <= bottom - 2; y++) fspan(y, x0, x1, shaft, R.LEG);
  fspan(bottom - 1, x0 - 1, x1, paw, R.LEG);
  fspan(bottom, x0 - 1, x1 - 1, paw, R.LEG);

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

/**
 * Number of variants per part.
 *
 * Only the S builders author art for the expressive head and tail variants, and
 * that is deliberate: they exist for the flavour idles, which play on a settled
 * cat facing the player, and the action sheet is front-facing only.
 *
 * What the other directions do with a variant index they have no art for is
 * worth stating accurately, because an earlier version of this comment got it
 * wrong. The compositor clamps an out-of-range index to the LAST CELL, but
 * every direction builds the full count, so nothing is ever out of range —
 * SE and E check only `variant === 1` and therefore render variants 2-5 with
 * their eyes OPEN, not shut. NE and N ignore the variant entirely, so they
 * have no closed-eye pose at all; their sleep read comes from `head.dy` alone,
 * which is why sleep is front-facing only (see ANIM_ORDER in animations.js).
 *
 * None of that is currently reachable, since no non-S direction plays an
 * animation that asks for variants 2-5. It is written down so the next person
 * to want one knows what they will get.
 */
const VARIANT_COUNT = {
  body: 3,   // rest, mid-breath, peak-breath
  head: 6,   // open, shut, squint, yawn, lick, ear-flick
  tail: 3,   // rest, swung out, swung in
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

    // Tail — rest plus two swing variants (only S bends; the rest repeat)
    atlas.tail[dir] = [];
    for (let v = 0; v < VARIANT_COUNT.tail; v++) {
      atlas.tail[dir].push(fin(TAIL_BUILDERS[dir](v)));
    }

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
  HEAD_V,
  VARIANT_COUNT,
  buildPartAtlas,
  mirrorCell,
  makeCell,
  cellSet,
  cellSpan,
};
