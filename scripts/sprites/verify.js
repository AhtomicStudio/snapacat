/**
 * Composite-level invariants for directional frames.
 *
 * Every regression in the 8-direction work so far has been invisible to
 * part-level tooling. `dump.js --parts` correctly reported all twenty legs
 * painting healthy pixel counts while legFL in E rendered zero visible pixels,
 * and it could not see that a 1px head lift detached the skull on twelve
 * frames. The questions that matter are about the COMPOSED buffer:
 *
 *   - is the cat one connected shape?
 *   - did every part survive occlusion?
 *   - is the head still attached to the body?
 *
 * All three run in milliseconds across all 80 frames, so they belong in the
 * build rather than in a review.
 */
const { FRAME_SIZE, idx } = require('./rig');
const { SLOT } = require('./slots');
const { PART_IDS, REGION } = require('./parts');

/**
 * Counts 8-connected components of non-empty pixels.
 *
 * 8-connected rather than 4-connected on purpose: pixel art routinely joins
 * shapes diagonally, and treating a diagonal touch as a break would fire on
 * art that reads as connected.
 */
function componentCount(buf) {
  const seen = new Uint8Array(buf.length);
  let components = 0;
  let largest = 0;
  const sizes = [];

  for (let start = 0; start < buf.length; start++) {
    if (buf[start] === SLOT.EMPTY || seen[start]) continue;
    components++;
    let size = 0;
    const stack = [start];
    seen[start] = 1;

    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % FRAME_SIZE;
      const y = (i / FRAME_SIZE) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= FRAME_SIZE || ny >= FRAME_SIZE) continue;
          const n = idx(nx, ny);
          if (seen[n] || buf[n] === SLOT.EMPTY) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
    if (size > largest) largest = size;
  }

  return { components, largest, sizes };
}

/** Visible pixel count per part id, after occlusion. */
function visibleByPart(partBuf) {
  const counts = {};
  for (const id of PART_IDS) counts[id] = 0;
  for (const v of partBuf) {
    if (v === 0) continue;
    counts[PART_IDS[v - 1]]++;
  }
  return counts;
}

/** Lowest head row and highest body row, from the region buffer. */
function headBodyJoin(regionBuf) {
  let headBottom = -1;
  let bodyTop = Infinity;
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const r = regionBuf[idx(x, y)];
      if (r === REGION.HEAD || r === REGION.EAR || r === REGION.MUZZLE) {
        if (y > headBottom) headBottom = y;
      } else if (r === REGION.BODY) {
        if (y < bodyTop) bodyTop = y;
      }
    }
  }
  return { headBottom, bodyTop };
}

/**
 * Checks one composed frame. Returns an array of human-readable problems.
 *
 * `expectedParts` is the draw order for the direction — parts that are
 * deliberately fully occluded (front legs behind the torso in a rear view) are
 * passed via `allowHidden` rather than lowering the floor for everyone.
 */
function checkFrame(label, { buf, regionBuf, partBuf }, { allowHidden = [], minVisible = 5 } = {}) {
  const problems = [];

  const { components, sizes } = componentCount(buf);
  if (components !== 1) {
    problems.push(
      `${label}: ${components} disconnected components (sizes ${sizes.sort((a, b) => b - a).join(', ')})`,
    );
  }

  // allowHidden means "zero is acceptable here" — NOT "any count is acceptable".
  // Exempting a part from the floor as well let 58 part-instances render 1-4
  // visible pixels unreported, which is exactly the band the floor exists to
  // reject: a far leg is COAT_DARK, so a 1px instance is a dark speck on the
  // body's edge. A part should be properly hidden or properly visible.
  const visible = visibleByPart(partBuf);
  for (const [partId, n] of Object.entries(visible)) {
    if (n === 0) {
      if (!allowHidden.includes(partId)) {
        problems.push(`${label}: ${partId} renders 0 visible pixels`);
      }
    } else if (n < minVisible) {
      problems.push(`${label}: ${partId} renders only ${n} visible pixels`);
    }
  }

  /**
   * Row 31 and the frame's outer ring belong to the outline pass and the ground
   * shadow. Art sitting there leaves applyOutline nowhere to draw a keyline, so
   * the sprite renders flush against the border with a flat cut. This has now
   * happened twice — a planted walk foot on y31, then the whole sleep body.
   *
   * This belongs on the COMPOSED buffer and must stay here. Asking it of the
   * finished buffer instead looks stricter and is simply wrong: the outline
   * pass dilates art outward by a pixel, so a cat whose paws rest correctly on
   * row 30 has its keyline on row 31 by design. Moved there, the check fired on
   * 85 frames, every one of them correct art — including all three idle poses
   * of every facing. A guard that fails on the intended output trains people to
   * ignore it.
   */
  for (let x = 0; x < FRAME_SIZE; x++) {
    if (buf[idx(x, 0)] !== SLOT.EMPTY) { problems.push(`${label}: art on row 0 at x${x}`); break; }
  }
  for (let x = 0; x < FRAME_SIZE; x++) {
    if (buf[idx(x, FRAME_SIZE - 1)] !== SLOT.EMPTY) { problems.push(`${label}: art on row 31 at x${x} — no room for the bottom keyline`); break; }
  }
  for (let y = 0; y < FRAME_SIZE; y++) {
    if (buf[idx(0, y)] !== SLOT.EMPTY) { problems.push(`${label}: art on column 0 at y${y}`); break; }
    if (buf[idx(FRAME_SIZE - 1, y)] !== SLOT.EMPTY) { problems.push(`${label}: art on column 31 at y${y}`); break; }
  }

  const { headBottom, bodyTop } = headBodyJoin(regionBuf);
  if (headBottom >= 0 && bodyTop < Infinity && bodyTop - headBottom > 1) {
    problems.push(
      `${label}: head detached — head ends y${headBottom}, body starts y${bodyTop}`,
    );
  }

  return problems;
}

/**
 * Counts enclosed transparent pixels — holes the outline pass did not close.
 *
 * Must run on the FINISHED buffer. Pre-outline the sheet carries ~108 hole
 * pixels that applyOutline legitimately fills (the whole-frame rig has the
 * same ones), so the count is meaningless before that pass and precise after.
 */
function holeCount(buf) {
  const outside = new Uint8Array(buf.length);
  const stack = [];
  for (let i = 0; i < FRAME_SIZE; i++) {
    stack.push(idx(i, 0), idx(i, FRAME_SIZE - 1), idx(0, i), idx(FRAME_SIZE - 1, i));
  }
  while (stack.length) {
    const i = stack.pop();
    if (outside[i] || buf[i] !== SLOT.EMPTY) continue;
    outside[i] = 1;
    const x = i % FRAME_SIZE;
    const y = (i / FRAME_SIZE) | 0;
    if (x > 0) stack.push(idx(x - 1, y));
    if (x < FRAME_SIZE - 1) stack.push(idx(x + 1, y));
    if (y > 0) stack.push(idx(x, y - 1));
    if (y < FRAME_SIZE - 1) stack.push(idx(x, y + 1));
  }
  let holes = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === SLOT.EMPTY && !outside[i]) holes++;
  }
  return holes;
}

/**
 * Checks what actually ships. The composed buffer is the right layer for
 * geometry questions; this is the right layer for anything the outline pass
 * participates in.
 */
function checkFinished(label, buf) {
  const problems = [];

  const holes = holeCount(buf);
  if (holes) problems.push(`${label}: ${holes} enclosed hole pixel(s) survive outlining`);

  /**
   * COLUMNS only. The rows are a different problem and are checked elsewhere.
   *
   * Row 31 is a shared ground line: a cat's paws rest on row 30 and the outline
   * pass puts their keyline on row 31, flush with the bottom of the cell, by
   * design. Checking the full ring here fires on every correct frame in the
   * sheet, which is why the row check stays on the composed buffer where "art
   * at row 31" still means "no room for a keyline".
   *
   * Columns 0 and 31 carry no such meaning. Frames are packed side by side in
   * one texture, so a sprite touching column 31 sits against its neighbour's
   * column 0 with nothing between them. It is a latent hazard rather than a
   * live bug — frames are addressed at exact multiples of the frame size and
   * snapSize keeps one source pixel on a whole number of device pixels — but
   * the margin is zero, these are the sheets under active edit, and
   * assertFrameMargins never sees them. The guard costs six lines and fires on
   * nothing that is meant to be there.
   */
  for (let y = 0; y < FRAME_SIZE; y++) {
    if (buf[idx(0, y)] !== SLOT.EMPTY) {
      problems.push(`${label}: touches column 0 at y${y} — no margin to its neighbour in the sheet`);
      break;
    }
  }
  for (let y = 0; y < FRAME_SIZE; y++) {
    if (buf[idx(FRAME_SIZE - 1, y)] !== SLOT.EMPTY) {
      problems.push(`${label}: touches column 31 at y${y} — no margin to its neighbour in the sheet`);
      break;
    }
  }

  return problems;
}

module.exports = {
  checkFrame, checkFinished, componentCount, visibleByPart, headBodyJoin, holeCount,
};
