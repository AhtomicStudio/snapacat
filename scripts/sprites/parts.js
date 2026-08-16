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
 */
const { SLOT } = require('./slots');
const { AUTHORED } = require('./directions');

/**
 * Cell geometry per part. The anchor is the part's own origin within its cell,
 * expressed so that placing a part means `cellTopLeft = root + offset - anchor`.
 * Legs anchor at the foot, body and head at their base, tail at its root.
 */
const PART_CELLS = {
  body: { w: 22, h: 16, ax: 11, ay: 15 },
  head: { w: 16, h: 16, ax: 8, ay: 15 },
  tail: { w: 14, h: 18, ax: 3, ay: 16 },
  legFL: { w: 6, h: 10, ax: 3, ay: 9 },
  legFR: { w: 6, h: 10, ax: 3, ay: 9 },
  legBL: { w: 6, h: 10, ax: 3, ay: 9 },
  legBR: { w: 6, h: 10, ax: 3, ay: 9 },
};

const PART_IDS = Object.keys(PART_CELLS);

// ---------------------------------------------------------------------------
// Cell raster helpers
// ---------------------------------------------------------------------------

const makeCell = (part) => {
  const { w, h } = PART_CELLS[part];
  return { w, h, px: new Uint8Array(w * h) };
};

const cellIdx = (cell, x, y) => y * cell.w + x;

function cellSet(cell, x, y, slot) {
  if (x < 0 || y < 0 || x >= cell.w || y >= cell.h) return;
  cell.px[cellIdx(cell, x, y)] = slot;
}

function cellSpan(cell, y, x0, x1, slot) {
  for (let x = x0; x <= x1; x++) cellSet(cell, x, y, slot);
}

function cellEllipse(cell, cx, cy, rx, ry, slot) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) cellSet(cell, x, y, slot);
    }
  }
}

/** Mirrors a cell about its vertical axis, remapping the anchor too. */
function mirrorCell(cell) {
  const out = { w: cell.w, h: cell.h, px: new Uint8Array(cell.w * cell.h) };
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      out.px[cellIdx(out, cell.w - 1 - x, y)] = cell.px[cellIdx(cell, x, y)];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placeholder part art
// ---------------------------------------------------------------------------
// Crude on purpose — these exist so the pipeline is real and verifiable before
// any hand-drawn art lands, and so there is a template with correct cell sizes
// and anchors to draw over. See README.md.

/** Torso. Reads long from the side, compact head-on. */
function buildBody(dir) {
  const cell = makeCell('body');
  const profile = {
    S: { rx: 8, ry: 7 },
    SE: { rx: 9, ry: 6.5 },
    E: { rx: 10.5, ry: 6 },
    NE: { rx: 9, ry: 6.5 },
    N: { rx: 8, ry: 7 },
  }[dir];
  cellEllipse(cell, 11, 8, profile.rx, profile.ry, SLOT.COAT_BASE);
  // Haunch mass sits rearward on the angled and side views.
  if (dir === 'E' || dir === 'SE' || dir === 'NE') {
    cellEllipse(cell, 4, 9, 5, 5.5, SLOT.COAT_BASE);
  }
  return cell;
}

/** Skull plus ears. Ears splay wider as the cat turns side-on. */
function buildHead(dir) {
  const cell = makeCell('head');
  const cx = 8;
  const cy = 8;

  const ears = {
    S: [[3, 2], [13, 2]],
    SE: [[3, 2], [12, 1]],
    E: [[4, 1], [11, 2]],
    NE: [[3, 1], [12, 2]],
    N: [[3, 2], [13, 2]],
  }[dir];

  for (const [ex, ey] of ears) {
    for (let i = 0; i < 4; i++) {
      cellSpan(cell, ey + i, ex - Math.floor(i / 2), ex + Math.ceil(i / 2), SLOT.COAT_BASE);
    }
  }

  cellEllipse(cell, cx, cy, 6, 5.5, SLOT.COAT_BASE);

  // Muzzle pushes forward on the profile views.
  if (dir === 'E') cellEllipse(cell, 12, 9, 3, 2.5, SLOT.COAT_LIGHT);
  if (dir === 'SE') cellEllipse(cell, 11, 10, 3, 2.5, SLOT.COAT_LIGHT);

  // The back of the head has no face.
  if (dir === 'N') return cell;

  const eyes = { S: [[5, 8], [10, 8]], SE: [[6, 8], [11, 8]], E: [[10, 8]], NE: [[11, 7]] }[dir] ?? [];
  for (const [ex, ey] of eyes) {
    cellSpan(cell, ey, ex, ex + 1, SLOT.EYE);
    cellSet(cell, ex, ey, SLOT.EYE_SHINE);
  }
  if (dir === 'S') cellSpan(cell, 11, 7, 8, SLOT.PINK);
  if (dir === 'SE') cellSpan(cell, 12, 10, 11, SLOT.PINK);
  if (dir === 'E') cellSpan(cell, 10, 13, 14, SLOT.PINK);

  return cell;
}

/** Tail. Rises and hooks; foreshortens toward the viewer on S and N. */
function buildTail(dir) {
  const cell = makeCell('tail');
  const path = {
    S: [[3, 15], [4, 12], [5, 9], [6, 7]],
    SE: [[3, 15], [5, 12], [7, 9], [8, 6]],
    E: [[3, 15], [6, 13], [8, 9], [9, 5]],
    NE: [[3, 15], [5, 12], [7, 8], [8, 4]],
    N: [[3, 15], [4, 11], [5, 7], [6, 4]],
  }[dir];

  path.forEach(([x, y], i) => {
    const r = 2.2 - i * 0.35; // taper toward the tip
    cellEllipse(cell, x, y, r, r, SLOT.COAT_BASE);
  });
  return cell;
}

/** A leg. Foreshortens on the head-on views. */
function buildLeg(dir) {
  const cell = makeCell('leg' + 'FL'); // all four legs share cell geometry
  const h = dir === 'S' || dir === 'N' ? 7 : 9;
  cellEllipse(cell, 3, 9 - h / 2, 2.2, h / 2, SLOT.COAT_BASE);
  cellSpan(cell, 9, 1, 4, SLOT.COAT_LIGHT); // paw
  return cell;
}

/**
 * Builds every part for every authored direction.
 * @returns {Record<string, Record<string, {w,h,px}>>} part -> direction -> cell
 */
function buildPartAtlas() {
  const atlas = {};
  for (const part of PART_IDS) atlas[part] = {};

  for (const dir of AUTHORED) {
    atlas.body[dir] = buildBody(dir);
    atlas.head[dir] = buildHead(dir);
    atlas.tail[dir] = buildTail(dir);
    const leg = buildLeg(dir);
    for (const id of ['legFL', 'legFR', 'legBL', 'legBR']) {
      atlas[id][dir] = { ...leg, px: leg.px.slice() };
    }
  }
  return atlas;
}

module.exports = {
  PART_CELLS,
  PART_IDS,
  buildPartAtlas,
  mirrorCell,
  makeCell,
  cellSet,
  cellSpan,
  cellEllipse,
};
