/**
 * Hand-authored cat rig.
 *
 * The silhouette is authored as explicit per-row spans rather than derived from
 * ellipse maths — an ellipse cannot give you a neck, and its widest-row-only
 * artifact leaves 1px shelves that sparkle at 4x. Every number in the profile
 * tables below is a deliberate pixel decision and is meant to be hand-tuned.
 *
 * Features (eyes, muzzle, paws, whiskers) are placed at explicit coordinates.
 * Shading and outlining are passes, because those *should* be algorithmic:
 * they must stay correct as the profiles are edited.
 *
 * Output is a slot-index buffer (see slots.js), never literal colours.
 */
const { SLOT } = require('./slots');

const FRAME_SIZE = 32;

/**
 * The rig is symmetric about x = 15.5, so a half-width of h covers integer
 * columns 16-h .. 15+h and every width is even.
 */
const CX = 15.5;

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------

const makeFrame = () => new Uint8Array(FRAME_SIZE * FRAME_SIZE);
const idx = (x, y) => y * FRAME_SIZE + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < FRAME_SIZE && y < FRAME_SIZE;

function setPx(buf, x, y, slot) {
  if (inBounds(x, y)) buf[idx(x, y)] = slot;
}

/** Fills an inclusive horizontal span. */
function span(buf, y, x0, x1, slot) {
  for (let x = x0; x <= x1; x++) setPx(buf, x, y, slot);
}

/** Fills rows from a half-width profile, centred on CX. */
function fillProfile(buf, topY, halves, slot) {
  halves.forEach((h, i) => {
    if (h <= 0) return;
    span(buf, topY + i, Math.ceil(CX - h), Math.floor(CX + h), slot);
  });
}

/** Fills a span and its mirror about CX. */
function spanMirrored(buf, y, x0, x1, slot) {
  span(buf, y, x0, x1, slot);
  span(buf, y, Math.round(2 * CX) - x1, Math.round(2 * CX) - x0, slot);
}

/** Repaints pixels currently holding `from` within a rect. */
function recolorRect(buf, x0, y0, x1, y1, from, to) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inBounds(x, y) && buf[idx(x, y)] === from) buf[idx(x, y)] = to;
    }
  }
}

// ---------------------------------------------------------------------------
// Authored silhouette profiles
// ---------------------------------------------------------------------------

const HEAD_TOP = 6;
// Skull: rises to 16px wide, tapers to an 8px chin so the neck can pinch.
// Index 3 is 8, not 7: the ear's last row pushes y8 out to x8 and y10 is also
// x8, so a 7 there bit a 1px notch out of both sides of the skull.
const HEAD_HALF = [5, 6, 7, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4]; // y 6..18

/**
 * Body as explicit spans rather than half-widths: the seat needs to round off
 * at the bottom, and a symmetric half-width table can only step in 2px
 * increments, which produced a rectangular slab.
 * Neck pinches to 10px against a 16px head, flares to a 20px seat, then tucks.
 */
const BODY = [
  [19, 11, 20],
  [20, 10, 21],
  [21, 9, 22],
  [22, 8, 23],
  [23, 8, 23],
  [24, 7, 24],
  [25, 7, 24],
  [26, 6, 25],
  [27, 6, 25],
  [28, 6, 25],
  [29, 7, 24],
  [30, 8, 23],
];

/** Rows whose width the breathing frames inflate — the ribcage, not the hips. */
const BREATH_ROWS = [[22, 23, 24], [21, 25]];

/** Left ear, [y, x0, x1]; the right ear is mirrored. */
const EAR = [
  [3, 10, 11],
  [4, 10, 12],
  [5, 9, 12],
  [6, 9, 13],
  [7, 8, 13],
  [8, 8, 14],
];

/**
 * Inner ear. Deliberately smaller than the ear it sits in — at the previous
 * size the pink filled all but one column on each side, and 20 hot-pink pixels
 * on a 32px cat read as antennae rather than ears.
 */
const EAR_INNER = [
  [6, 10, 11],
  [7, 10, 12],
];

/**
 * Raised tail. Hugs the body from y27 up to y23, then rises free — above the
 * hip a tail *should* separate from the body silhouette, and the outline pass
 * draws the keyline between them.
 */
/**
 * A pixel curve reads as smooth only when its edges step gradually and never
 * both on the same row. Stepping both edges together at y21 produced two
 * straight bars joined by a visible jog.
 */
/**
 * Raised tail, hugging the body with its left edge at exactly `bodyRight + 1`
 * on every row it touches.
 *
 * The previous table drifted in and out of contact — merging at y22/24/26 and
 * leaving a gap at y21/23/25 — which read as a lumpy extension of the hip
 * rather than a tail. Consistent adjacency plus a soft edge (applied in
 * poseSit) separates the two masses cleanly with no transparent channel.
 */
const TAIL = [
  [28, 25, 29],
  [27, 25, 29],
  [26, 25, 29],
  [25, 25, 28],
  [24, 25, 28],
  [23, 24, 27],
  [22, 24, 27],
  [21, 23, 26],
  [20, 23, 25],
  [19, 22, 24],
  [18, 22, 23],
  [17, 21, 22],
  [16, 21, 21],
];

// ---------------------------------------------------------------------------
// Shading
// ---------------------------------------------------------------------------

/**
 * Inward chamfer distance transform — 0 outside the silhouette, increasing
 * toward the interior. Used both as a surface-normal source and as a
 * "how deep am I" term so interiors flatten to mid-tone.
 */
function distanceField(buf) {
  const N = FRAME_SIZE;
  const D = new Float32Array(N * N);
  for (let i = 0; i < D.length; i++) D[i] = buf[i] === SLOT.EMPTY ? 0 : 9999;

  const at = (x, y) => (inBounds(x, y) ? D[idx(x, y)] : 0);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (buf[idx(x, y)] === SLOT.EMPTY) continue;
      D[idx(x, y)] = Math.min(
        D[idx(x, y)],
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + 1.4,
        at(x + 1, y - 1) + 1.4,
      );
    }
  }
  for (let y = N - 1; y >= 0; y--) {
    for (let x = N - 1; x >= 0; x--) {
      if (buf[idx(x, y)] === SLOT.EMPTY) continue;
      D[idx(x, y)] = Math.min(
        D[idx(x, y)],
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + 1.4,
        at(x - 1, y + 1) + 1.4,
      );
    }
  }
  return D;
}

/**
 * Lambert shading against the distance field's gradient.
 *
 * An earlier version marked "top 2 rows / bottom 3 rows of each column", which
 * is a function of the silhouette's vertical extent rather than of its form —
 * it produced speckle on the tail and nothing coherent on curved surfaces.
 */
function applyShading(buf) {
  const D = distanceField(buf);
  const LX = -0.55;
  const LY = -0.83; // light from upper-left
  const at = (x, y) => (inBounds(x, y) ? D[idx(x, y)] : 0);

  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const i = idx(x, y);
      if (buf[i] !== SLOT.COAT_BASE) continue;

      const nx = at(x + 1, y) - at(x - 1, y);
      const ny = at(x, y + 1) - at(x, y - 1);
      const len = Math.hypot(nx, ny) || 1;
      const ndl = -((nx / len) * LX + (ny / len) * LY);
      const core = Math.min(D[i] / 3, 1);
      const lit = ndl * (1 - core) + 0.5 * core;

      if (lit > 0.6) buf[i] = SLOT.COAT_LIGHT;
      else if (lit < 0.3) buf[i] = SLOT.COAT_DARK;
    }
  }
}

/**
 * Removes isolated shading pixels. Single-pixel value changes are the main
 * cause of sprites reading as noisy once scaled down on a phone.
 */
/**
 * Only lambert output is despeckled. Authored slots (FUR_LIGHT, COAT_SHADOW)
 * are deliberate placements, and including them meant the pass quietly ate the
 * 1px taper off the chest fluff and the paw edges — the shading cleanup was
 * deleting the very features it ran after.
 */
const LOOSE_SLOTS = [SLOT.COAT_LIGHT, SLOT.COAT_DARK];

function despeckle(buf) {
  // Reverting one pixel can newly isolate its neighbour, and a single pass
  // evaluated against one snapshot never sees that. Three passes converge.
  for (let pass = 0; pass < 3; pass++) {
    const src = buf.slice();
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const i = idx(x, y);
        if (!LOOSE_SLOTS.includes(src[i])) continue;
        let same = 0;
        if (inBounds(x - 1, y) && src[idx(x - 1, y)] === src[i]) same++;
        if (inBounds(x + 1, y) && src[idx(x + 1, y)] === src[i]) same++;
        if (inBounds(x, y - 1) && src[idx(x, y - 1)] === src[i]) same++;
        if (inBounds(x, y + 1) && src[idx(x, y + 1)] === src[i]) same++;
        if (same < 2) buf[i] = SLOT.COAT_BASE;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

/**
 * Dilates an outline OUTWARD into transparency.
 *
 * The obvious implementation — overwrite every solid pixel that touches
 * transparency — erodes the sprite: it eats the highlight everywhere the
 * silhouette curves, and on thin geometry like ears it consumes almost the
 * whole shape. Growing outward preserves all authored interior pixels and
 * incidentally seals any 1px pinholes between overlapping parts.
 */
function applyOutline(buf) {
  const src = buf.slice();
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const i = idx(x, y);
      if (src[i] !== SLOT.EMPTY) continue;
      const touches =
        (inBounds(x - 1, y) && src[idx(x - 1, y)] !== SLOT.EMPTY && src[idx(x - 1, y)] !== SLOT.SHADOW) ||
        (inBounds(x + 1, y) && src[idx(x + 1, y)] !== SLOT.EMPTY && src[idx(x + 1, y)] !== SLOT.SHADOW) ||
        (inBounds(x, y - 1) && src[idx(x, y - 1)] !== SLOT.EMPTY && src[idx(x, y - 1)] !== SLOT.SHADOW) ||
        (inBounds(x, y + 1) && src[idx(x, y + 1)] !== SLOT.EMPTY && src[idx(x, y + 1)] !== SLOT.SHADOW);
      if (touches) buf[i] = SLOT.OUTLINE;
    }
  }
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

/**
 * Whiskers, stamped after outlining so they stay 1px thin.
 *
 * They must sit ON the keyline and be allowed to overwrite it: the outline
 * pass fills the entire 1px ring around the silhouette, so anything placed
 * only on EMPTY can exist no closer than 2px away and reads as a floating
 * speck. Row 16 is the one place both cheeks are clear — the head has narrowed
 * to x10..21 and the tail has not yet started (TAIL begins at y16 on the right,
 * so x21..23 there is avoided).
 */
const SIT_WHISKERS = [[8, 16], [7, 16], [23, 16], [24, 16]];

/**
 * Sitting cat, front-facing.
 *
 * `breath` inflates the ribcage only (rows 21-25). The head never moves: the
 * eyes are the highest-contrast feature on the sprite and a 1px vertical eye
 * jump at 4x is a 4-device-pixel pop that reads as a twitch, not a breath.
 */
function poseSit(breath = 0) {
  const buf = makeFrame();

  // Tail behind the body.
  for (const [y, x0, x1] of TAIL) span(buf, y, x0, x1, SLOT.COAT_BASE);

  // Body, with the ribcage widened on the breath frames.
  const widened = new Set();
  for (let s = 0; s < breath; s++) for (const r of BREATH_ROWS[s] ?? []) widened.add(r);
  for (const [y, x0, x1] of BODY) {
    const g = widened.has(y) ? 1 : 0;
    span(buf, y, x0 - g, x1 + g, SLOT.COAT_BASE);
  }

  // Ears, then head over them so the skull trims the ear bases.
  for (const [y, x0, x1] of EAR) spanMirrored(buf, y, x0, x1, SLOT.COAT_BASE);
  fillProfile(buf, HEAD_TOP, HEAD_HALF, SLOT.COAT_BASE);

  applyShading(buf);

  // A 3px-wide ear cannot carry a gradient — the lambert is correct there but
  // produces isolated speckle. Flatten both ears to base after shading.
  for (const [y, x0, x1] of EAR) {
    for (const s of [SLOT.COAT_DARK, SLOT.COAT_LIGHT]) {
      recolorRect(buf, x0, y, x1, y, s, SLOT.COAT_BASE);
      recolorRect(buf, 31 - x1, y, 31 - x0, y, s, SLOT.COAT_BASE);
    }
  }

  // A 3px-wide tail can no more carry a gradient than a 3px ear can; the
  // distance-field gradient flips on the rows where the tail steps left, which
  // made the shadow edge step in, out, then in again down its length.
  for (const [y, x0, x1] of TAIL) {
    for (let x = x0; x <= x1; x++) {
      const s = buf[idx(x, y)];
      if (s !== SLOT.COAT_BASE && s !== SLOT.COAT_DARK && s !== SLOT.COAT_LIGHT) continue;
      buf[idx(x, y)] = x >= x1 ? SLOT.COAT_DARK : SLOT.COAT_BASE;
    }
  }

  // Soft edge where the tail lies against the body. Without it the two masses
  // fuse into one silhouette, since they are deliberately adjacent.
  //
  // The separator's x steps diagonally down the tail, and a diagonal run of
  // single pixels is not 4-connected — its first three pixels rendered as
  // detached dots before the line went solid. Bridging each step horizontally
  // makes the whole run continuous without widening it where it already was.
  let prevX = null;
  for (const [y, x0] of TAIL) {
    if (y < 19) {
      prevX = x0;
      continue;
    }
    setPx(buf, x0, y, SLOT.OUTLINE_SOFT);
    if (prevX !== null && Math.abs(x0 - prevX) === 1) {
      setPx(buf, prevX, y, SLOT.OUTLINE_SOFT);
    }
    prevX = x0;
  }

  // ── Occlusion. This does more for head/body separation at 40px than the
  //    entire lighting ramp does. COAT_DARK is included because the neck pinch
  //    already shades dark there, and omitting it left the bar 2px wide. ─────
  for (const s of [SLOT.COAT_BASE, SLOT.COAT_LIGHT, SLOT.COAT_DARK]) {
    recolorRect(buf, 12, 19, 19, 19, s, SLOT.COAT_SHADOW);
  }

  // Chest fluff: widest at the throat, narrowing downward, like a ruff. A
  // symmetric diamond reads as a heart locket once the tabby bars frame it.
  for (const [y, x0, x1] of [[21, 13, 18], [22, 14, 17], [23, 15, 16]]) {
    recolorRect(buf, x0, y, x1, y, SLOT.COAT_BASE, SLOT.FUR_LIGHT);
  }

  // ── Front paws ────────────────────────────────────────────────────────────
  for (const [y, x0, x1] of [[28, 10, 13], [29, 9, 13], [30, 9, 12]]) {
    span(buf, y, x0, x1, SLOT.FUR_LIGHT);
    span(buf, y, 31 - x1, 31 - x0, SLOT.FUR_LIGHT);
  }
  // Toe split. Two pixels per mitt is the cheapest thing that stops a paw
  // reading as a rounded block.
  for (const y of [29, 30]) {
    setPx(buf, 11, y, SLOT.OUTLINE_SOFT);
    setPx(buf, 20, y, SLOT.OUTLINE_SOFT);
  }
  // A 2px gap reads as the space between the front legs; 4px read as a hole.
  for (let y = 28; y <= 30; y++) span(buf, y, 15, 16, SLOT.COAT_SHADOW);

  // ── Inner ears ────────────────────────────────────────────────────────────
  for (const [y, x0, x1] of EAR_INNER) spanMirrored(buf, y, x0, x1, SLOT.PINK);

  // ── Face ──────────────────────────────────────────────────────────────────
  // Under-lash grounds the eyes and stops them floating on a flat skull.
  spanMirrored(buf, 11, 11, 13, SLOT.OUTLINE_SOFT);

  for (let y = 12; y <= 13; y++) {
    span(buf, y, 11, 13, SLOT.EYE);
    span(buf, y, 18, 20, SLOT.EYE);
  }
  // Limbal ring only at the bottom-outer corner. Eye colour differentiates
  // breeds (blue on points and solid_white) and a full ring left just one iris
  // pixel per row to carry it.
  setPx(buf, 11, 13, SLOT.EYE_DARK);
  setPx(buf, 20, 13, SLOT.EYE_DARK);
  // Shine on the top-LEFT pixel of each eye — one light source, and the same
  // corner on both. Previously the left eye's shine sat in its middle column
  // while the right eye's sat on its edge, which reads as a squint.
  setPx(buf, 11, 12, SLOT.EYE_SHINE);
  setPx(buf, 18, 12, SLOT.EYE_SHINE);

  // Muzzle: two lighter lobes with the nose at the seam. This is the single
  // feature that makes a front-facing pixel cat read as a cat.
  span(buf, 15, 12, 19, SLOT.FUR_LIGHT);
  span(buf, 16, 13, 18, SLOT.FUR_LIGHT);
  span(buf, 15, 15, 16, SLOT.PINK);
  span(buf, 16, 15, 16, SLOT.OUTLINE_SOFT);
  // Lip lines, not two floating corner specks.
  span(buf, 17, 13, 14, SLOT.OUTLINE_SOFT);
  span(buf, 17, 17, 18, SLOT.OUTLINE_SOFT);

  // Despeckle LAST: the feature stamps above re-isolate lambert pixels, so
  // running it right after applyShading left speckle in the final buffer.
  despeckle(buf);

  return {
    buf,
    whiskers: SIT_WHISKERS,
    shadow: { cx: 15.5, cy: 31, rx: 8, ry: 1.4 },
  };
}

/**
 * Curled sleeping cat — a low dome with the head tucked at one end and the
 * tail wrapped around the front.
 */
function poseSleep(breath = 0) {
  const buf = makeFrame();

  // The arch of the back must be the highest point on the sprite and the head
  // must tuck BELOW it. Previously the head crowned a row above the dome, which
  // flattened the topline into a straight edge with two ear towers on it — the
  // definition of "loaf with bumps" rather than "curled cat".
  const dome = [
    [17, 18, 23],
    [18, 16, 25],
    [19, 14, 27],
    [20, 12, 28],
    [21, 11, 28],
    [22, 10, 29],
    [23, 10, 29],
    [24, 9, 29],
    [25, 9, 28],
    [26, 10, 27],
    [27, 11, 26],
  ];
  for (const [y, x0, x1] of dome) {
    span(buf, y, x0, x1, SLOT.COAT_BASE);
  }
  // Breath widens a single row above the crown rather than stacking upward.
  // Two stacked rows read as a growth on the cat's back, not a breath.
  if (breath >= 1) span(buf, 16, 19, 22, SLOT.COAT_BASE);
  if (breath >= 2) span(buf, 16, 18, 23, SLOT.COAT_BASE);

  // Head, crowning three rows below the back.
  const head = [
    [20, 6, 14],
    [21, 4, 15],
    [22, 3, 15],
    [23, 3, 15],
    [24, 3, 15],
    [25, 4, 15],
    [26, 5, 14],
    [27, 7, 13],
  ];
  for (const [y, x0, x1] of head) span(buf, y, x0, x1, SLOT.COAT_BASE);

  // Near ear only, folded back, topping out at y18 — one row below the crown
  // at y17. The arch of the back has to be the highest point on the sprite;
  // level with the ear tips it reads as a loaf with bumps. The far ear is
  // dropped: at this angle it lands inside the dome and adds only noise.
  const ears = [
    [18, 9, 11], [19, 8, 12],
  ];
  for (const [y, x0, x1] of ears) span(buf, y, x0, x1, SLOT.COAT_BASE);

  applyShading(buf);

  // Shoulder line at the head's trailing edge. Without it the tucked head and
  // the curled body fuse into one undifferentiated loaf — measured, the head
  // and dome share a continuous silhouette from x3 to x29 with nothing to
  // mark where one ends.
  // Bridged for the same reason as the sit tail's separator — the line steps
  // diagonally, so its leading pixel detached.
  let prevShoulder = null;
  for (const [y, , x1] of head) {
    const sx = x1 + 1;
    setPx(buf, sx, y, SLOT.OUTLINE_SOFT);
    if (prevShoulder !== null && Math.abs(sx - prevShoulder) === 1) {
      setPx(buf, prevShoulder, y, SLOT.OUTLINE_SOFT);
    }
    prevShoulder = sx;
  }

  // Inner ear, near side only, kept small.
  span(buf, 19, 9, 10, SLOT.PINK);

  // Muzzle wedge at the snout end.
  span(buf, 24, 2, 5, SLOT.FUR_LIGHT);
  span(buf, 25, 3, 6, SLOT.FUR_LIGHT);
  setPx(buf, 2, 24, SLOT.PINK);

  // Closed eye as a shallow arc — ends up, middle down reads as content.
  setPx(buf, 6, 21, SLOT.OUTLINE_SOFT);
  span(buf, 22, 7, 8, SLOT.OUTLINE_SOFT);
  setPx(buf, 9, 21, SLOT.OUTLINE_SOFT);

  // Tail emerges behind the rump and sweeps across the front toward the head.
  // Each row overlaps the next in x so the curve reads as continuous; the
  // earlier table had two disjoint segments and left a hole at y28.
  const sleepTail = [
    [26, 23, 27],
    [27, 17, 26],
    [28, 11, 22],
    [29, 9, 17],
  ];
  const tailPx = new Set();
  for (const [y, x0, x1] of sleepTail) {
    for (let x = x0; x <= x1; x++) {
      span(buf, y, x, x, SLOT.COAT_BASE);
      tailPx.add(`${x},${y}`);
    }
  }

  // Separator follows the tail's actual curve rather than a hardcoded straight
  // line, so it stays correct when the table is retuned. Skipping pixels that
  // are themselves tail is what stops overlapping rows from converting each
  // other — that bug turned 42 pixels of the belly into separator.
  for (const key of tailPx) {
    const [x, y] = key.split(',').map(Number);
    if (tailPx.has(`${x},${y - 1}`) || !inBounds(x, y - 1)) continue;
    const above = buf[idx(x, y - 1)];
    if (above === SLOT.COAT_BASE || above === SLOT.COAT_DARK || above === SLOT.COAT_LIGHT) {
      buf[idx(x, y - 1)] = SLOT.OUTLINE_SOFT;
    }
  }

  despeckle(buf);

  return { buf, whiskers: [], shadow: { cx: 18, cy: 30, rx: 10, ry: 1.4 } };
}

// ---------------------------------------------------------------------------
// Frame set
// ---------------------------------------------------------------------------

/**
 * Idle plays rest → mid → peak → mid, which gives a 3-pose ease out of an
 * asymmetric 4-beat cycle. Sleep runs the same shape, slower.
 */
function buildFrames() {
  return [poseSit(0), poseSit(1), poseSit(2), poseSleep(0), poseSleep(1), poseSleep(2)];
}

/**
 * Animations reference frames by index rather than a start+count range, so the
 * rest→mid→peak→mid shape costs three authored poses instead of four. Shipping
 * a byte-identical duplicate frame wasted sheet width and forced anyone drawing
 * over the template to paint the same pose twice.
 */
const ANIMATIONS = {
  idle: { frames: [0, 1, 2, 1], durations: [560, 130, 420, 130] },
  sleep: { frames: [3, 4, 5, 4], durations: [1400, 220, 700, 220] },
};

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

/**
 * Named areas of the sit pose, derived from the same authored tables that draw
 * it. Pattern painters need to ask "is this an ear / the tail / a paw" — doing
 * that with raw coordinate thresholds (`x >= 24`, `y <= 9`) clipped the body
 * flank and darkened the top of the skull, so the geometry is published here
 * instead and stays correct when the profiles are retuned.
 */
const EAR_SET = new Set();
for (const [y, x0, x1] of EAR) {
  for (let x = x0; x <= x1; x++) {
    EAR_SET.add(`${x},${y}`);
    EAR_SET.add(`${Math.round(2 * CX) - x},${y}`);
  }
}

const TAIL_SET = new Set();
for (const [y, x0, x1] of TAIL) {
  for (let x = x0; x <= x1; x++) TAIL_SET.add(`${x},${y}`);
}

const REGIONS = {
  isEar: (x, y) => EAR_SET.has(`${x},${y}`),
  isTail: (x, y) => TAIL_SET.has(`${x},${y}`),
  isPaw: (x, y) => y >= 28 && y <= 30 && ((x >= 8 && x <= 13) || (x >= 18 && x <= 23)),
  /** Face area kept clear of markings so the features stay readable at 40px. */
  isMuzzle: (x, y) => ((x - CX) / 5) ** 2 + ((y - 15.5) / 3.5) ** 2 < 1,
  isHead: (x, y) => {
    const h = HEAD_HALF[y - HEAD_TOP];
    return h !== undefined && Math.abs(x - CX) <= h;
  },
};

/** Outline + whiskers. Runs AFTER pattern painting so the keyline can match
 *  whichever marking it borders. */
function finishFrame(buf, whiskers = []) {
  applyOutline(buf);
  for (const [x, y] of whiskers) {
    if (!inBounds(x, y)) continue;
    const s = buf[idx(x, y)];
    // Overwriting the keyline is the point — a whisker has to grow out of the
    // face, not hover beside it. OUTLINE_SOFT reads as a hair, not a contour.
    if (s === SLOT.EMPTY || s === SLOT.OUTLINE) setPx(buf, x, y, SLOT.OUTLINE_SOFT);
  }
  return buf;
}

module.exports = {
  FRAME_SIZE,
  buildFrames,
  finishFrame,
  ANIMATIONS,
  REGIONS,
  makeFrame,
  idx,
  inBounds,
};
