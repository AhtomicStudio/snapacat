/**
 * Part-based compositor.
 *
 * Given a direction, animation name, and frame index, produces a 32×32 slot
 * buffer identical in shape to what rig.js produces — so the existing pattern
 * painters (applyPattern) and palette resolution (resolvePalette) run on the
 * composited buffer unchanged. All 20 breeds come out for free.
 *
 * The pipeline mirrors the whole-frame rig's rendering order:
 *   1. Compose parts (painter's order, back to front)
 *   2. Apply Lambert shading on the coat silhouette
 *   3. Flatten shading on thin geometry (ears, tail)
 *   4. Despeckle
 *   5. (caller) Apply pattern, outline + whiskers, palette → PNG
 */
const { SLOT } = require('./slots');
const {
  FRAME_SIZE, makeFrame, idx, inBounds,
  applyShading, despeckle, CX,
} = require('./rig');
const {
  RESOLVE, DRAW_ORDER, ROOTS, ANCHORS, SHADOWS, WHISKER_OFFSETS,
} = require('./directions');
const { PART_CELLS, PART_IDS, REGION, buildPartAtlas } = require('./parts');
const { DIR_ANIMATIONS } = require('./animations');

// ---------------------------------------------------------------------------
// Compose parts into a frame
// ---------------------------------------------------------------------------

/**
 * Composes parts for one frame of one direction.
 *
 * @param {string} dir       One of the 8 compass directions
 * @param {string} animName  Animation name (e.g. 'idle', 'walk', 'sleep')
 * @param {number} frameIdx  Index into the animation's unique frames array
 * @param {object} atlas     Part atlas from buildPartAtlas()
 * @returns {{ buf: Uint8Array, regionBuf: Uint8Array, whiskers: number[][], shadow: object }}
 */
function compose(dir, animName, frameIdx, atlas) {
  const { source, mirror } = RESOLVE[dir];
  const drawOrder = DRAW_ORDER[source];
  const root = ROOTS[source];
  const anchors = ANCHORS[source];
  const anim = DIR_ANIMATIONS[animName];
  const frame = anim.frames[frameIdx];

  const buf = makeFrame();
  const regionBuf = new Uint8Array(FRAME_SIZE * FRAME_SIZE);
  // Which part owns each visible pixel, as 1-based indices into PART_IDS.
  // Region tags cannot answer this — all four legs share REGION.LEG — and
  // "which parts survived occlusion" is the question part-level tooling cannot
  // answer at all: --parts reported every leg painting healthy counts while
  // legFL in E rendered zero visible pixels.
  const partBuf = new Uint8Array(FRAME_SIZE * FRAME_SIZE);

  for (const partId of drawOrder) {
    const anchor = anchors[partId];
    const frameData = frame[partId] || {};
    const dx = frameData.dx || 0;
    const dy = frameData.dy || 0;
    const variant = frameData.v || 0;

    const cells = atlas[partId][source];
    if (!cells) continue;
    const cell = cells[Math.min(variant, cells.length - 1)];
    if (!cell) continue;

    // Anchor comes from the CELL, not PART_CELLS — cells are sized to their art
    // and carry their own origin. Reading the fixed table here was half of why
    // 208 authored pixels were being discarded.
    const { ax, ay } = cell;
    const fx = root.x + anchor[0] + dx - ax;
    const fy = root.y + anchor[1] + dy - ay;

    for (let cy = 0; cy < cell.h; cy++) {
      for (let cx = 0; cx < cell.w; cx++) {
        const slot = cell.px[cy * cell.w + cx];
        if (slot === SLOT.EMPTY) continue;
        const px = fx + cx;
        const py = fy + cy;
        if (!inBounds(px, py)) continue;
        buf[idx(px, py)] = slot;
        regionBuf[idx(px, py)] = cell.regions[cy * cell.w + cx];
        partBuf[idx(px, py)] = PART_IDS.indexOf(partId) + 1;
      }
    }
  }

  // Mirror the entire frame for derived directions (SW←SE, W←E, NW←NE).
  if (mirror) {
    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE / 2; x++) {
        const l = idx(x, y);
        const r = idx(FRAME_SIZE - 1 - x, y);
        const tmpS = buf[l]; buf[l] = buf[r]; buf[r] = tmpS;
        const tmpR = regionBuf[l]; regionBuf[l] = regionBuf[r]; regionBuf[r] = tmpR;
        const tmpP = partBuf[l]; partBuf[l] = partBuf[r]; partBuf[r] = tmpP;
      }
    }
  }

  // Whiskers
  const whiskerOffsets = WHISKER_OFFSETS[source] || [];
  const headAnchor = anchors.head;
  const headFrame = frame.head || {};
  const headDy = headFrame.dy || 0;
  const hx = root.x + headAnchor[0];
  const hy = root.y + headAnchor[1] + headDy;

  let whiskers;
  if (mirror) {
    whiskers = whiskerOffsets.map(([wdx, wdy]) => [FRAME_SIZE - 1 - (hx + wdx), hy + wdy]);
  } else {
    whiskers = whiskerOffsets.map(([wdx, wdy]) => [hx + wdx, hy + wdy]);
  }

  // Shadow
  const baseShadow = SHADOWS[source];
  const shadow = mirror
    ? { ...baseShadow, cx: FRAME_SIZE - 1 - baseShadow.cx }
    : { ...baseShadow };

  return { buf, regionBuf, partBuf, whiskers, shadow };
}

// ---------------------------------------------------------------------------
// Post-composition shading
//
// Replicates the rig's shading pipeline on the composited frame:
//   1. Lambert shading (only modifies COAT_BASE pixels)
//   2. Flatten thin geometry (ears, tail) where gradients are noise
//   3. Despeckle
// ---------------------------------------------------------------------------

/**
 * Applies the full shading pipeline to a composited frame.
 * Modifies buf in place.
 */
function shadeComposite(buf, regionBuf) {
  // Apply Lambert shading — only modifies COAT_BASE → COAT_LIGHT / COAT_DARK
  applyShading(buf);

  // Flatten shading on ears — too thin for gradients, same as rig.js
  for (let i = 0; i < buf.length; i++) {
    if (regionBuf[i] === REGION.EAR) {
      if (buf[i] === SLOT.COAT_LIGHT || buf[i] === SLOT.COAT_DARK) {
        buf[i] = SLOT.COAT_BASE;
      }
    }
  }

  // Flatten tail — right edge gets COAT_DARK, rest stays COAT_BASE
  // This matches the rig's manual tail shading.
  for (let y = 0; y < FRAME_SIZE; y++) {
    let tailRight = -1;
    for (let x = FRAME_SIZE - 1; x >= 0; x--) {
      if (regionBuf[idx(x, y)] === REGION.TAIL) {
        if (tailRight === -1) tailRight = x;
        const s = buf[idx(x, y)];
        if (s === SLOT.COAT_BASE || s === SLOT.COAT_DARK || s === SLOT.COAT_LIGHT) {
          buf[idx(x, y)] = (x >= tailRight) ? SLOT.COAT_DARK : SLOT.COAT_BASE;
        }
      }
    }
  }

  // Despeckle
  despeckle(buf);
}

// ---------------------------------------------------------------------------
// Direction-aware REGIONS for pattern painters
// ---------------------------------------------------------------------------

/**
 * Creates a REGIONS-compatible object from the compositor's region buffer.
 * This lets applyPattern() work on directional frames without modification.
 */
function regionsFromBuf(regionBuf) {
  return {
    isEar: (x, y) => regionBuf[idx(x, y)] === REGION.EAR,
    isTail: (x, y) => regionBuf[idx(x, y)] === REGION.TAIL,
    isPaw: (x, y) => regionBuf[idx(x, y)] === REGION.LEG,
    isMuzzle: (x, y) => regionBuf[idx(x, y)] === REGION.MUZZLE,
    isHead: (x, y) => {
      const r = regionBuf[idx(x, y)];
      return r === REGION.HEAD || r === REGION.EAR || r === REGION.MUZZLE;
    },
  };
}

/**
 * Applies a pattern with direction-aware region queries AND a direction-aware
 * body frame.
 *
 * Two swaps, for two different questions. REGIONS answers "what part of the cat
 * is this pixel" — it comes from the composited region buffer. POSE answers
 * "where is the cat's spine, face and chest" — it comes from poses.js. The
 * painters need both, and getting only the first is what left the profile
 * frames with front-view markings: correctly identified ears and tail, stripes
 * running the wrong way across the ribs.
 *
 * The pose is looked up for the SOURCE direction and then mirrored if the frame
 * was, because compose() flips the buffer before this runs.
 */
function applyPatternDir(buf, breed, regionBuf, source, mirror) {
  const rig = require('./rig');
  const { applyPattern, setPose } = require('./patterns');
  const { poseFor } = require('./poses');

  // Save original region functions
  const saved = {};
  for (const key of Object.keys(rig.REGIONS)) {
    saved[key] = rig.REGIONS[key];
  }

  // Swap in direction-aware regions
  const dirRegions = regionsFromBuf(regionBuf);
  for (const key of Object.keys(dirRegions)) {
    rig.REGIONS[key] = dirRegions[key];
  }

  const savedPose = setPose(poseFor(source, mirror));

  let result;
  try {
    result = applyPattern(buf, breed);
  } finally {
    // Restore
    for (const key of Object.keys(saved)) {
      rig.REGIONS[key] = saved[key];
    }
    setPose(savedPose);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Full render pipeline for one directional frame
// ---------------------------------------------------------------------------

/**
 * Renders a single directional frame, ready for palette resolution.
 *
 * @param {string} dir       Direction (S, SE, E, etc.)
 * @param {string} animName  Animation name
 * @param {number} frameIdx  Unique frame index within the animation
 * @param {object} atlas     Part atlas
 * @param {object} breed     Breed descriptor (for pattern painting)
 * @returns {{ buf: Uint8Array, whiskers: number[][], shadow: object }}
 */
function renderFrame(dir, animName, frameIdx, atlas, breed) {
  const { buf, regionBuf, whiskers, shadow } = compose(dir, animName, frameIdx, atlas);
  const { source, mirror } = RESOLVE[dir];

  // Shading pipeline
  shadeComposite(buf, regionBuf);

  // Pattern painting with direction-aware regions and body frame
  const patterned = applyPatternDir(buf, breed, regionBuf, source, mirror);

  return { buf: patterned, whiskers, shadow };
}

module.exports = {
  compose,
  shadeComposite,
  regionsFromBuf,
  applyPatternDir,
  renderFrame,
  buildPartAtlas,
};
