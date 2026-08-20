/**
 * Pixel-art props for every placeable item.
 *
 * WHY
 *
 * The Hood was drawing its goodies as system emoji — 🥣 next to a hand-authored
 * 32×32 cat. That is two different art media in the same frame: the emoji are
 * vector, glossy, sized off a font metric, drawn by a different hand at a
 * different resolution, and they change appearance with the OS. No amount of
 * layout work makes that read as one world; it reads as a prototype. Everything
 * in the scene has to be made of the same stuff as the cats.
 *
 * AUTHORING CONVENTIONS — these match rig.js so props and cats sit together:
 *
 *   - 32×32 frame, the same as a cat, and props are authored at their TRUE
 *     relative size inside it. A kibble bowl is ~13px wide because a kibble
 *     bowl is small next to a cat. That means the renderer can draw props and
 *     cats at one nominal size and the scale relationship comes out right
 *     without a per-item fudge factor.
 *   - bottom-anchored: the base of every prop sits on GROUND_Y so props line up
 *     with each other and with a cat's paws.
 *   - one 1px keyline, dilated OUTWARD into transparency (see rig.js —
 *     dilating inward erodes thin geometry).
 *   - three tones per material: base, plus an automatic lit top rim and a
 *     shaded bottom rim. Light comes from the upper-left, as it does on the
 *     cats.
 *
 * Output: src/assets/props/<item_id>.png at 4× (128×128), nearest-neighbour,
 * matching how the cat sheets ship.
 */

const fs = require('node:fs');
const path = require('node:path');
const { encodePNG, upscaleRGBA } = require('./png');

const SIZE = 32;
/** Row the props stand on. Leaves a row beneath for the keyline. */
const GROUND_Y = 29;

const OUTLINE = '#2B2B33';

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

/** A canvas is a flat array of colour strings (or null for transparent). */
function blank() {
  return new Array(SIZE * SIZE).fill(null);
}

const inB = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
const at = (c, x, y) => (inB(x, y) ? c[y * SIZE + x] : null);

function px(c, x, y, col) {
  if (!inB(x, y) || !col) return;
  c[y * SIZE + x] = col;
}

function rect(c, x0, y0, x1, y1, col) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) px(c, x, y, col);
  }
}

/** Filled ellipse. rx/ry are radii, so width is 2*rx+1. */
function ellipse(c, cx, cy, rx, ry, col) {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      const dx = (x - cx) / (rx + 0.001);
      const dy = (y - cy) / (ry + 0.001);
      if (dx * dx + dy * dy <= 1.02) px(c, x, y, col);
    }
  }
}

/** Upper half of an ellipse — domes, lids, mounds sitting on a surface. */
function dome(c, cx, baseY, rx, ry, col) {
  for (let y = baseY - ry; y <= baseY; y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      const dx = (x - cx) / (rx + 0.001);
      const dy = (y - baseY) / (ry + 0.001);
      if (dx * dx + dy * dy <= 1.02) px(c, x, y, col);
    }
  }
}

/**
 * A vessel — wider at the rim than the base. Bowls, pots, baskets, cans.
 * Returns the rim's half-width so callers can fill contents to match.
 */
function vessel(c, cx, topY, botY, topHalf, botHalf, col) {
  const rows = botY - topY;
  for (let y = topY; y <= botY; y++) {
    const t = rows === 0 ? 0 : (y - topY) / rows;
    const half = Math.round(topHalf + (botHalf - topHalf) * t);
    rect(c, cx - half, y, cx + half, y, col);
  }
  return topHalf;
}

/**
 * Filled ellipse rotated 45°: `a` runs up-right, `b` runs down-right.
 * For anything whose long axis is diagonal — a feather, a leaf, a fin.
 */
function diagEllipse(c, cx, cy, a, b, col) {
  const r = Math.ceil(Math.max(a, b)) + 1;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx - dy) / Math.SQRT2;
      const v = (dx + dy) / Math.SQRT2;
      if ((u / a) ** 2 + (v / b) ** 2 <= 1.02) px(c, x, y, col);
    }
  }
}

/** Outline of an ellipse — winding on a ball, a hoop, a rim seen face-on. */
function arc(c, cx, cy, rx, ry, _phase, col) {
  const steps = Math.ceil((rx + ry) * 4);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    px(c, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), col);
  }
}

function line(c, x0, y0, x1, y1, col) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    px(c, x, y, col);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// ---------------------------------------------------------------------------
// Finishing passes
// ---------------------------------------------------------------------------

/**
 * Rim light and rim shade.
 *
 * Rather than a lambert solve (overkill for shapes this small), every pixel on
 * the upper-left boundary of a material gets its lit tone and every pixel on
 * the lower-right boundary gets its shaded tone. Applied per-material so a
 * bowl's contents shade independently of the bowl.
 *
 * `tones` maps a base colour to { light, dark }. A material with no entry is
 * left flat, which is what you want for things that read as emissive (a laser
 * dot, a neon tube) — shading those makes them look dirty rather than lit.
 */
function shade(c, tones) {
  const src = c.slice();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const col = at(src, x, y);
      if (!col) continue;
      const tone = tones[col];
      if (!tone) continue;
      const up = at(src, x, y - 1);
      const left = at(src, x - 1, y);
      const down = at(src, x, y + 1);
      const right = at(src, x + 1, y);
      // Boundary against *anything else*, not just transparency, so a mound
      // sitting in a bowl still catches light where it meets the rim.
      const litEdge = up !== col || left !== col;
      const darkEdge = down !== col || right !== col;
      if (litEdge && tone.light) px(c, x, y, tone.light);
      else if (darkEdge && tone.dark) px(c, x, y, tone.dark);
    }
  }
}

/** 1px keyline dilated outward into transparency. Never erodes the shape. */
function outline(c) {
  const src = c.slice();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (at(src, x, y)) continue;
      const touches =
        at(src, x - 1, y) || at(src, x + 1, y) || at(src, x, y - 1) || at(src, x, y + 1);
      if (touches) px(c, x, y, OUTLINE);
    }
  }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Builds a { base, light, dark } material and registers its tones. */
function mat(tones, base, light, dark) {
  tones[base] = { light, dark };
  return base;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Each entry draws one item, bottom-anchored on GROUND_Y, and returns the tone
 * map for its materials. Sizes are deliberate: a cat is 32px tall in this same
 * frame, so a 9px-tall bowl is a bowl a cat could eat from.
 */
const PROPS = {
  // ── Food ────────────────────────────────────────────────────────────────
  item_kibble_bowl(c, t) {
    const bowl = mat(t, '#4E86C6', '#7FB0E4', '#2F5C93');
    const food = mat(t, '#9A6B3C', '#C08E58', '#6E4926');
    dome(c, 16, GROUND_Y - 5, 6, 3, food);
    vessel(c, 16, GROUND_Y - 5, GROUND_Y, 7, 4, bowl);
  },

  item_water_dish(c, t) {
    const dish = mat(t, '#E4DED2', '#FFFAF0', '#B3AA9B');
    const water = mat(t, '#5FB6D8', '#9CDCF0', '#3B87A8');
    vessel(c, 16, GROUND_Y - 4, GROUND_Y, 7, 5, dish);
    rect(c, 10, GROUND_Y - 4, 22, GROUND_Y - 3, water);
  },

  item_treats_pile(c, t) {
    const treat = mat(t, '#C98A46', '#E8B172', '#8F5C2A');
    // Discrete nuggets, not a dome — a smooth mound reads as a bread roll.
    // Jittered off the lattice too: a tidy pyramid reads as brickwork.
    for (const [x, y] of [
      [8, 0], [12, 0], [16, -1], [20, 0], [24, 0],
      [11, -3], [15, -4], [19, -3], [22, -2],
      [14, -6], [18, -7],
    ]) {
      rect(c, x, GROUND_Y + y - 2, x + 2, GROUND_Y + y, treat);
    }
  },

  item_warm_milk(c, t) {
    const bowl = mat(t, '#EDE6DA', '#FFFFFF', '#BAB0A0');
    const milk = mat(t, '#FBF3E2', '#FFFFFF', '#D9CDB6');
    const steam = '#FFFFFFAA';
    vessel(c, 16, GROUND_Y - 5, GROUND_Y, 6, 4, bowl);
    rect(c, 11, GROUND_Y - 5, 21, GROUND_Y - 4, milk);
    // Steam reads as warmth — the one cue that separates this from water.
    line(c, 13, GROUND_Y - 8, 13, GROUND_Y - 11, steam);
    line(c, 17, GROUND_Y - 9, 17, GROUND_Y - 13, steam);
    line(c, 20, GROUND_Y - 8, 20, GROUND_Y - 11, steam);
  },

  item_water_fountain(c, t) {
    const stone = mat(t, '#B9C0C6', '#DDE3E8', '#828A92');
    const water = mat(t, '#5FB6D8', '#9CDCF0', '#3B87A8');
    vessel(c, 16, GROUND_Y - 4, GROUND_Y, 9, 6, stone);
    rect(c, 8, GROUND_Y - 4, 24, GROUND_Y - 3, water);
    rect(c, 15, GROUND_Y - 11, 17, GROUND_Y - 5, stone);
    vessel(c, 16, GROUND_Y - 14, GROUND_Y - 11, 5, 2, stone);
    rect(c, 12, GROUND_Y - 14, 20, GROUND_Y - 13, water);
    px(c, 12, GROUND_Y - 10, water);
    px(c, 20, GROUND_Y - 10, water);
  },

  item_tuna_can(c, t) {
    const tin = mat(t, '#C2C8CF', '#E9EEF2', '#8A9199');
    const fish = mat(t, '#E58E7A', '#F6B7A4', '#B25F4C');
    vessel(c, 16, GROUND_Y - 6, GROUND_Y, 7, 7, tin);
    rect(c, 10, GROUND_Y - 6, 22, GROUND_Y - 5, fish);
    // Peeled lid, curled back — the detail that says "opened", not "unopened".
    line(c, 22, GROUND_Y - 7, 26, GROUND_Y - 11, tin);
    line(c, 23, GROUND_Y - 7, 27, GROUND_Y - 11, tin);
  },

  item_premium_kibble(c, t) {
    const bowl = mat(t, '#D9B45C', '#F5DC96', '#A67F2E');
    const food = mat(t, '#B98038', '#DCA85F', '#82551F');
    dome(c, 16, GROUND_Y - 5, 6, 4, food);
    vessel(c, 16, GROUND_Y - 5, GROUND_Y, 7, 4, bowl);
    sparkle(c, 24, GROUND_Y - 12);
    sparkle(c, 8, GROUND_Y - 9);
  },

  item_golden_mackerel(c, t) {
    const plate = mat(t, '#E4DED2', '#FFFAF0', '#B3AA9B');
    const gold = mat(t, '#E0B441', '#FBE79A', '#A8802A');
    vessel(c, 16, GROUND_Y - 2, GROUND_Y, 9, 7, plate);
    ellipse(c, 15, GROUND_Y - 5, 6, 3, gold);
    // Tail fin
    line(c, 22, GROUND_Y - 8, 25, GROUND_Y - 5, gold);
    line(c, 22, GROUND_Y - 2, 25, GROUND_Y - 5, gold);
    rect(c, 22, GROUND_Y - 6, 24, GROUND_Y - 4, gold);
    px(c, 11, GROUND_Y - 6, OUTLINE); // eye
    sparkle(c, 9, GROUND_Y - 12);
  },

  // ── Toys ────────────────────────────────────────────────────────────────
  item_toy_mouse(c, t) {
    const fur = mat(t, '#9AA0A8', '#C4CAD1', '#6B7178');
    const ear = mat(t, '#E7A9AE', '#F7CDD0', '#B57B80');
    ellipse(c, 15, GROUND_Y - 3, 6, 3, fur);
    ellipse(c, 20, GROUND_Y - 4, 3, 3, fur);
    ellipse(c, 19, GROUND_Y - 7, 2, 2, ear);
    px(c, 22, GROUND_Y - 5, OUTLINE); // eye
    // Tail — a curl, not a straight line, so it reads as soft
    line(c, 9, GROUND_Y - 3, 6, GROUND_Y - 5, fur);
    line(c, 6, GROUND_Y - 5, 6, GROUND_Y - 8, fur);
  },

  item_yarn_ball(c, t) {
    const yarn = mat(t, '#D4574E', '#F08A7E', '#9B3831');
    ellipse(c, 15, GROUND_Y - 6, 7, 6, yarn);
    // A 14px ball has no room for winding detail — rings read as a cut gem,
    // parabolas as a rose. ONE short groove plus the rim shading is the whole
    // budget. Restraint is the fix here, not a better curve.
    for (let i = -3; i <= 3; i++) {
      px(c, 14 + i, GROUND_Y - 9 + Math.round((i * i) / 6), '#9B3831');
    }
    // Loose end trailing off to the ground, which sells "ball of string"
    line(c, 22, GROUND_Y - 4, 26, GROUND_Y - 2, yarn);
    line(c, 26, GROUND_Y - 2, 28, GROUND_Y, yarn);
  },

  item_feather_wand(c, t) {
    const wood = mat(t, '#A87F4C', '#CBA372', '#7A5A33');
    const plume = mat(t, '#54B5A0', '#84DCC9', '#2F7D6D');
    // One continuous diagonal wand — the earlier L-bend read as a lollipop
    // stick. A feather is asymmetric and tapers to a point, so barbs shorten
    // toward the tip and the quill stays visible down the middle.
    line(c, 6, GROUND_Y, 17, GROUND_Y - 11, wood);
    line(c, 7, GROUND_Y, 18, GROUND_Y - 11, wood);
    // Barbs drawn as open V's left a mesh that read as a badminton racquet.
    // The plume has to be SOLID; the barb texture goes on afterwards as ticks
    // in the shade tone, which is how feathers read at this size.
    // Stamping one diagonal run per barb leaves a checkerboard: consecutive
    // barbs step by (+1,−1) and the run itself steps by (+1,+1), so both are
    // √2 apart and every other pixel falls in a gap. Filling the plume as a
    // solid rotated ellipse is the only version that holds together.
    diagEllipse(c, 22, GROUND_Y - 16, 8, 4, plume);
    line(c, 17, GROUND_Y - 11, 27, GROUND_Y - 21, '#2F7D6D');
  },

  item_spring_toy(c, t) {
    const coil = mat(t, '#E0793F', '#F5A874', '#A9532A');
    const base = mat(t, '#7A7F87', '#A9AEB6', '#53575E');
    const knob = mat(t, '#4E86C6', '#7FB0E4', '#2F5C93');
    vessel(c, 16, GROUND_Y - 2, GROUND_Y, 7, 6, base);
    // Stacked bars read as a layer cake. A coil needs each turn OFFSET
    // laterally and drawn as an open ring, so light shows through the gaps.
    for (let i = 0; i < 6; i++) {
      const y = GROUND_Y - 5 - i * 3;
      const lean = Math.round(Math.sin(i * 1.1) * 3);
      arc(c, 16 + lean, y, 5, 2, 0, coil);
    }
    ellipse(c, 16 + Math.round(Math.sin(5 * 1.1) * 3), GROUND_Y - 25, 3, 3, knob);
  },

  item_laser_dot(c, t) {
    const body = mat(t, '#3B3F47', '#5F646E', '#22252B');
    const trim = mat(t, '#B9414A', '#DE7A80', '#7E2A31');
    // The pointer and the dot read as two unrelated objects until a BEAM
    // joined them. The beam is the whole idea of the item, so it is the part
    // that has to be legible.
    vessel(c, 9, GROUND_Y - 1, GROUND_Y, 3, 5, body);
    for (let i = 0; i < 9; i++) {
      const x = 7 + i;
      const y = GROUND_Y - 3 - i;
      rect(c, x, y - 1, x + 1, y, i > 6 ? trim : body);
    }
    // Beam: a dashed diagonal, so it reads as light rather than as wire.
    for (let i = 0; i < 14; i++) {
      if (i % 3 === 2) continue;
      px(c, 17 + i, GROUND_Y - 11 + i, '#FF6B62');
    }
    ellipse(c, 27, GROUND_Y - 1, 4, 2, '#FF3B3055');
    ellipse(c, 27, GROUND_Y - 1, 2, 1, '#FF3B30');
    px(c, 27, GROUND_Y - 1, '#FFC9C4');
  },

  item_catnip(c, t) {
    const leaf = mat(t, '#5C9B4A', '#8CC776', '#3C6C2F');
    const leafB = mat(t, '#6FAE58', '#9DD98A', '#4A7D3A');
    for (const [x, h, col] of [[10, 6, leaf], [14, 9, leafB], [19, 7, leaf], [23, 5, leafB]]) {
      line(c, x, GROUND_Y, x, GROUND_Y - h, col);
      ellipse(c, x, GROUND_Y - h - 1, 2, 2, col);
      px(c, x - 2, GROUND_Y - h + 2, col);
      px(c, x + 2, GROUND_Y - h + 3, col);
    }
  },

  item_butterfly_mobile(c, t) {
    const stand = mat(t, '#8A8F97', '#B6BBC3', '#5F646C');
    const wing = mat(t, '#C77BD4', '#EBB2F2', '#8B4C97');
    const wingLo = mat(t, '#E8A24C', '#FBC684', '#AC6F2A');
    // Curved arm instead of a right-angled gallows — every pole item was
    // reading as the same piece of street furniture.
    vessel(c, 10, GROUND_Y - 2, GROUND_Y, 4, 5, stand);
    line(c, 10, GROUND_Y - 2, 10, GROUND_Y - 16, stand);
    line(c, 10, GROUND_Y - 16, 13, GROUND_Y - 20, stand);
    line(c, 13, GROUND_Y - 20, 18, GROUND_Y - 21, stand);
    line(c, 19, GROUND_Y - 21, 19, GROUND_Y - 17, '#5F646C');
    // Wings SPREAD wide and shallow rather than stacked in a 2×2 block — the
    // block read as two hanging lampshades. Upper pair reaches further out and
    // higher; lower pair tucks in beneath, which is the butterfly outline.
    ellipse(c, 14, GROUND_Y - 14, 4, 3, wing);
    ellipse(c, 24, GROUND_Y - 14, 4, 3, wing);
    ellipse(c, 16, GROUND_Y - 10, 3, 2, wingLo);
    ellipse(c, 22, GROUND_Y - 10, 3, 2, wingLo);
    rect(c, 19, GROUND_Y - 16, 19, GROUND_Y - 9, '#3E4249');
    // Antennae — two pixels, but they settle the reading immediately.
    line(c, 19, GROUND_Y - 16, 17, GROUND_Y - 19, '#3E4249');
    line(c, 19, GROUND_Y - 16, 21, GROUND_Y - 19, '#3E4249');
  },

  // ── Shelter ─────────────────────────────────────────────────────────────
  item_old_blanket(c, t) {
    const cloth = mat(t, '#B98BA8', '#DDB6CF', '#87627A');
    // Two overlapping heaps at different heights plus a trailing corner. A
    // single smooth dome read as a cushion; cloth needs an uneven skyline.
    dome(c, 12, GROUND_Y, 8, 6, cloth);
    dome(c, 21, GROUND_Y, 7, 4, cloth);
    rect(c, 22, GROUND_Y - 1, 27, GROUND_Y, cloth);
    line(c, 8, GROUND_Y - 3, 13, GROUND_Y - 6, '#87627A');
    line(c, 16, GROUND_Y - 4, 20, GROUND_Y - 2, '#87627A');
    line(c, 24, GROUND_Y - 2, 26, GROUND_Y - 1, '#87627A');
  },

  item_cardboard_box(c, t) {
    const card = mat(t, '#C79A5E', '#E7C08A', '#8F6B3A');
    const inner = '#6E5029';
    rect(c, 7, GROUND_Y - 10, 25, GROUND_Y, card);
    // Open top, seen slightly from above
    rect(c, 9, GROUND_Y - 12, 23, GROUND_Y - 10, inner);
    rect(c, 7, GROUND_Y - 12, 9, GROUND_Y - 10, card);
    rect(c, 23, GROUND_Y - 12, 25, GROUND_Y - 10, card);
    line(c, 16, GROUND_Y - 9, 16, GROUND_Y, '#8F6B3A');
  },

  item_cozy_basket(c, t) {
    const weave = mat(t, '#C2985C', '#E3BC87', '#8C6B39');
    vessel(c, 16, GROUND_Y - 9, GROUND_Y, 10, 7, weave);
    // Weave rows read at 32px only as alternating dark ticks
    for (let y = GROUND_Y - 8; y < GROUND_Y; y += 3) {
      for (let x = 7; x <= 25; x += 3) px(c, x + ((y / 3) % 2), y, '#8C6B39');
    }
  },

  item_cat_bed(c, t) {
    const rim = mat(t, '#7E9BC4', '#AEC4E4', '#556C90');
    const pad = mat(t, '#E9E2D4', '#FFFBF0', '#BCB4A3');
    ellipse(c, 16, GROUND_Y - 3, 11, 5, rim);
    ellipse(c, 16, GROUND_Y - 4, 8, 3, pad);
  },

  item_heated_cat_house(c, t) {
    const wall = mat(t, '#C56B54', '#E89A83', '#8E4735');
    const roof = mat(t, '#6E7A88', '#98A5B3', '#4A5460');
    const glow = '#FFCE7A';
    rect(c, 7, GROUND_Y - 12, 25, GROUND_Y, wall);
    for (let i = 0; i <= 11; i++) {
      rect(c, 5 + i, GROUND_Y - 13 - i, 27 - i, GROUND_Y - 13 - i, roof);
    }
    dome(c, 16, GROUND_Y, 5, 8, '#2B2B33');
    dome(c, 16, GROUND_Y, 4, 7, glow);
    dome(c, 16, GROUND_Y, 3, 5, '#3A2A1E');
  },

  // ── Decor ───────────────────────────────────────────────────────────────
  item_flower_pot(c, t) {
    const clay = mat(t, '#C2704A', '#E29A75', '#8D4B2E');
    const leaf = mat(t, '#5C9B4A', '#8CC776', '#3C6C2F');
    const bloom = mat(t, '#E8A0C0', '#FAC9DD', '#B36C8B');
    vessel(c, 16, GROUND_Y - 8, GROUND_Y, 7, 5, clay);
    rect(c, 8, GROUND_Y - 10, 24, GROUND_Y - 8, clay);
    for (const [x, h] of [[12, 6], [16, 9], [20, 7]]) {
      line(c, x, GROUND_Y - 10, x, GROUND_Y - 10 - h, leaf);
      ellipse(c, x, GROUND_Y - 11 - h, 2, 2, leaf);
    }
    ellipse(c, 16, GROUND_Y - 21, 2, 2, bloom);
  },

  item_wind_chime(c, t) {
    const cap = mat(t, '#A87F4C', '#CBA372', '#7A5A33');
    const tube = mat(t, '#C6CBD2', '#EDF1F5', '#8E949C');
    const hook = mat(t, '#8A8F97', '#B6BBC3', '#5F646C');
    // Hangs from a short hook rather than standing on a full-height post —
    // the post version read as a garden rake.
    line(c, 16, 1, 16, 5, hook);
    line(c, 16, 1, 22, 1, hook);
    ellipse(c, 16, 8, 6, 3, cap);
    for (const [x, len] of [[11, 9], [14, 13], [18, 11], [21, 7]]) {
      rect(c, x, 11, x, 11 + len, tube);
    }
    // Clapper disc and a sail below it — the shape that says "chime".
    line(c, 16, 11, 16, 22, '#8E949C');
    ellipse(c, 16, 24, 4, 2, cap);
  },

  item_lantern(c, t) {
    const post = mat(t, '#5F646C', '#8A8F97', '#3E4249');
    const paper = mat(t, '#E8674F', '#FA9B86', '#A94434');
    rect(c, 15, GROUND_Y - 16, 17, GROUND_Y, post);
    ellipse(c, 16, GROUND_Y - 21, 6, 6, paper);
    rect(c, 10, GROUND_Y - 22, 22, GROUND_Y - 21, '#A94434');
    rect(c, 13, GROUND_Y - 28, 19, GROUND_Y - 27, post);
  },

  item_fish_mobile(c, t) {
    const bar = mat(t, '#8A8F97', '#B6BBC3', '#5F646C');
    const fish = mat(t, '#5FB6D8', '#9CDCF0', '#3B87A8');
    // Also hangs, so it stops competing with the lantern and the neon sign for
    // the same lamp-post silhouette.
    line(c, 16, 1, 16, 4, bar);
    rect(c, 5, 4, 27, 5, bar);
    for (const [x, drop] of [[8, 3], [16, 7], [24, 1]]) {
      const cy = 12 + drop;
      line(c, x, 6, x, cy - 3, '#5F646C');
      // Body first, then a SOLID triangular tail. Two strokes made an arrow.
      ellipse(c, x + 1, cy, 4, 3, fish);
      for (let i = 0; i < 4; i++) rect(c, x - 4 - i, cy - i, x - 4 - i, cy + i, fish);
      px(c, x + 3, cy - 1, OUTLINE);
    }
  },

  item_neon_paw_sign(c, t) {
    const post = mat(t, '#4A4E56', '#71767F', '#2E3138');
    const plate = mat(t, '#23262C', '#383C44', '#15171B');
    const neon = '#FF6FA8';
    const neonHot = '#FFC2DC';
    rect(c, 15, GROUND_Y - 8, 17, GROUND_Y, post);
    vessel(c, 16, GROUND_Y - 1, GROUND_Y, 3, 5, post);
    // A dark backing plate is what makes the neon read as lit signage instead
    // of a floating pink flower.
    rect(c, 6, GROUND_Y - 25, 26, GROUND_Y - 8, plate);
    // Pad: a rounded blob, not a trapezoid. Toes are plain beans in a tight
    // arc just above it — giving each toe a bright centre turned them into
    // stars, and the whole thing read as a flower.
    ellipse(c, 16, GROUND_Y - 13, 6, 4, neon);
    ellipse(c, 16, GROUND_Y - 13, 4, 2, neonHot);
    // Toes: tall ovals, tucked in tight and arced steeply. Spread evenly in a
    // shallow row they read as petals sitting above a flower's centre.
    for (const [x, y] of [[10, -17], [14, -19], [18, -19], [22, -17]]) {
      ellipse(c, x, GROUND_Y + y, 1.6, 2.4, neon);
    }
  },
};

/** A four-pixel twinkle. Used for the legendary items. */
function sparkle(c, x, y) {
  px(c, x, y - 2, '#FFF3C4');
  px(c, x, y + 2, '#FFF3C4');
  px(c, x - 2, y, '#FFF3C4');
  px(c, x + 2, y, '#FFF3C4');
  px(c, x, y, '#FFFFFF');
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function toRGBA(canvas) {
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const col = canvas[i];
    if (!col) continue;
    const hex = col.replace('#', '');
    out[i * 4 + 0] = parseInt(hex.slice(0, 2), 16);
    out[i * 4 + 1] = parseInt(hex.slice(2, 4), 16);
    out[i * 4 + 2] = parseInt(hex.slice(4, 6), 16);
    out[i * 4 + 3] = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  }
  return out;
}

/** Renders one prop to a 32×32 canvas of colour strings. */
function renderProp(itemId) {
  const draw = PROPS[itemId];
  if (!draw) throw new Error(`No prop drawing for "${itemId}"`);
  const canvas = blank();
  const tones = {};
  draw(canvas, tones);
  // Drop any malformed tone entries rather than painting garbage.
  for (const [k, v] of Object.entries(tones)) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(k) || !v || typeof v !== 'object') delete tones[k];
    else {
      if (!/^#[0-9A-Fa-f]{6}$/.test(v.light ?? '')) delete v.light;
      if (!/^#[0-9A-Fa-f]{6}$/.test(v.dark ?? '')) delete v.dark;
    }
  }
  shade(canvas, tones);
  outline(canvas);
  return canvas;
}

const SCALE = 4;

function build() {
  const outDir = path.resolve(__dirname, '../../src/assets/props');
  fs.mkdirSync(outDir, { recursive: true });

  const ids = Object.keys(PROPS);
  for (const id of ids) {
    const canvas = renderProp(id);
    const rgba = toRGBA(canvas);
    const big = upscaleRGBA(rgba, SIZE, SIZE, SCALE);
    const png = encodePNG(SIZE * SCALE, SIZE * SCALE, big);
    fs.writeFileSync(path.join(outDir, `${id}.png`), png);
  }

  writeIndex(outDir, ids);
  return ids;
}

/** Emits the require() map the app imports. Metro cannot require() dynamically. */
function writeIndex(outDir, ids) {
  const lines = [
    '/**',
    ' * Generated by scripts/sprites/props.js — do not edit by hand.',
    ' *',
    ' * Metro resolves require() at bundle time, so the map has to be literal.',
    ' * Run `npm run sprites:props` after changing any prop drawing.',
    ' */',
    '',
    'import type { ImageSourcePropType } from \'react-native\';',
    '',
    'export const PROP_SHEETS: Record<string, ImageSourcePropType> = {',
    ...ids.map((id) => `  ${id}: require('./${id}.png'),`),
    '};',
    '',
    '/** Every item id that has authored art. */',
    'export const PROP_IDS: string[] = Object.keys(PROP_SHEETS);',
    '',
    '/** Art for an item, or undefined when none is authored yet. */',
    'export function getPropSheet(itemId: string): ImageSourcePropType | undefined {',
    '  return PROP_SHEETS[itemId];',
    '}',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'index.ts'), lines.join('\n'));
}

module.exports = { PROPS, renderProp, build, SIZE, GROUND_Y };

if (require.main === module) {
  const ids = build();
  console.log(`props: wrote ${ids.length} sheets at ${SIZE * SCALE}px`);
}
