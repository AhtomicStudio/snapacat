/**
 * Coat pattern masks.
 *
 * A pattern repaints coat pixels of the shared rig — it never changes the
 * silhouette. That separation is why one rig can serve 20 breeds: geometry is
 * authored once, markings are generated per pattern.
 *
 * Markings are shade-aware: a stripe crossing a lit shoulder resolves to a
 * different slot than the same stripe crossing a shadowed flank. Painting a
 * single flat PATTERN value is what makes procedural markings read as decals
 * stuck onto a cat rather than as fur.
 */
const { SLOT } = require('./slots');
const { FRAME_SIZE, idx, REGIONS } = require('./rig');
const { SIT } = require('./poses');

/**
 * The body frame the painters are currently drawing against.
 *
 * Markings are statements about a cat's anatomy — down the flank, across the
 * chest, over the muzzle — and every one of them needs to know which way the
 * cat is facing. Rather than thread a pose argument through nine painters and
 * the dispatcher, the active pose lives here and the compositor swaps it for
 * the frame it is rendering, the same way it already swaps REGIONS.
 *
 * The default is the sit pose, so the whole-frame sheets render exactly as they
 * did before this indirection existed.
 */
let POSE = SIT;

/** Swaps the active pose and returns the previous one, for restoring. */
function setPose(pose) {
  const previous = POSE;
  POSE = pose || SIT;
  return previous;
}

/** Coat slot -> marking slot, preserving the underlying shading band. */
const PATTERN_FOR = {
  [SLOT.COAT_LIGHT]: SLOT.PATTERN_LIGHT,
  [SLOT.FUR_LIGHT]: SLOT.PATTERN_LIGHT,
  [SLOT.COAT_BASE]: SLOT.PATTERN,
  [SLOT.COAT_DARK]: SLOT.PATTERN_DARK,
  [SLOT.COAT_SHADOW]: SLOT.PATTERN_DARK,
};

const WHITE_FOR = {
  [SLOT.COAT_LIGHT]: SLOT.WHITE,
  [SLOT.FUR_LIGHT]: SLOT.WHITE,
  [SLOT.COAT_BASE]: SLOT.WHITE,
  [SLOT.COAT_DARK]: SLOT.WHITE_DARK,
  [SLOT.COAT_SHADOW]: SLOT.WHITE_DARK,
};

const isCoat = (slot) => PATTERN_FOR[slot] !== undefined;

/**
 * Pixels markings must leave alone so the face stays readable.
 *
 * Two sources, because the two rigs tag the face differently. The sit rig's
 * REGIONS.isMuzzle is a generous ellipse over the whole lower face; the part
 * atlas tags only the literal nose patch and leaves the rest to the pose. Both
 * have to be honoured or the composited heads get bars across their eyes.
 */
const skipFace = (x, y) => REGIONS.isMuzzle(x, y) || POSE.faceClear(x, y);

/** Deterministic value noise in 0..1 — same input always yields the same patch. */
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Iterates coat pixels, letting the callback decide the marking slot. */
function eachCoat(buf, fn) {
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const i = idx(x, y);
      if (!isCoat(buf[i])) continue;
      fn(x, y, i, buf[i]);
    }
  }
}

const mark = (buf, i) => {
  buf[i] = PATTERN_FOR[buf[i]] ?? buf[i];
};
const markWhite = (buf, i) => {
  buf[i] = WHITE_FOR[buf[i]] ?? buf[i];
};

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------

/**
 * Mackerel tabby: narrow bars that splay outward down the flanks.
 *
 * Which way the bars run is the pose's business, not this function's. Facing
 * the camera they are iso-lines of distance-from-spine; in profile they are
 * iso-lines of position along the body, raked toward the tail. Asking POSE for
 * a single stripe coordinate keeps one painter serving both, and is what
 * stopped the profile frames rendering as wood grain.
 */
function paintTabby(buf) {
  eachCoat(buf, (x, y, i) => {
    if (skipFace(x, y)) return;

    // The tail gets rings, not a continuous vertical seam.
    if (REGIONS.isTail(x, y)) {
      if (y % 4 < 2) mark(buf, i);
      return;
    }

    // Necklace: one band across the upper chest, clear of the fluff at y21-23.
    // A front-facing tabby's low-frequency signal has to run ACROSS the body —
    // a dorsal spine is right on a side view and draws a bar down the chest
    // here. Spanning the full width matters: leaving a gap at the centreline
    // turned the band into a chevron that read as a heart marking. Side-on the
    // pose moves this to the shoulder, where the equivalent landmark is.
    if (POSE.necklace(x, y)) {
      mark(buf, i);
      return;
    }
    // Dark ear backs with a paler thumbprint. Lands at the top of the sprite
    // where a solid-coloured breed has no structure at all.
    if (REGIONS.isEar(x, y) && POSE.earMark(x, y)) {
      mark(buf, i);
      return;
    }

    // Fine 33%-duty bars average straight back to the base coat when the sprite
    // is downsampled to phone size, which is how a grey tabby landed 2.57 ΔE
    // from a solid grey when squinted at. Widening to 43% duty shifts the block
    // average without adding a low-frequency band.
    if ((Math.round(POSE.stripe(x, y)) + 64) % 7 < 3) mark(buf, i);
  });
}

/** Classic tabby: two off-centre shoulder swirls, which read as marbling. */
function paintClassicTabby(buf) {
  eachCoat(buf, (x, y, i) => {
    if (skipFace(x, y)) return;
    if (REGIONS.isTail(x, y)) {
      if (y % 4 < 2) mark(buf, i);
      return;
    }
    // Rounded before the modulo so the two mirrored centres stay in phase.
    // The centres sit on the shoulder and the hip, so the pose places them —
    // side-on they are a torso apart rather than side by side.
    for (const [ox, oy] of POSE.blotches) {
      /**
       * Broad bands, not fine rings — and the width is the point, not the duty.
       *
       * This used to run 3px rings on a 9px period, chosen so its 33% coverage
       * would differ from the mackerel's 43%. That reasoning was wrong about
       * what survives downsampling. Coverage is exactly what block-averaging
       * preserves: two patterns at similar duty average to the same tile
       * regardless of their shape, and measured, the two brown tabbies sat at
       * 4.98 block ΔE — the second-worst pair in the project and a collision a
       * player would actually notice in a Cat-a-log row.
       *
       * What survives tile-averaging is LOW SPATIAL FREQUENCY. 4px bands on a
       * 14px period are coarse enough that whole tiles land inside a band or
       * inside the open coat between them, so the pattern still modulates the
       * downsampled image. The pair goes to 6.30, and it happens to be what
       * "blotched" means anyway: a classic tabby wears a few broad swirls, not
       * a fine web.
       *
       * The duty is held near the old coverage on purpose. Widening the bands
       * to 6px scored better again — 7.48 — and produced a cat that is one
       * dark mass with a face on it, because bands from both blotch centres
       * merge across the body. That is the metric winning over the thing it is
       * a proxy for. 4px keeps coverage at 40% against the old 37%, which is
       * the most separation available without changing what the breed is.
       */
      const r = Math.round(Math.hypot(x - ox, (y - oy) * 1.15));
      if (r % 14 < 4) {
        mark(buf, i);
        return;
      }
    }
  });
}

/** Spotted: a scattered dot field. */
function paintSpotted(buf) {
  eachCoat(buf, (x, y, i) => {
    if (skipFace(x, y)) return;
    if (hash2(x >> 1, y >> 1) > 0.62) mark(buf, i);
  });
}

/**
 * Bicolor / tuxedo: a chest wedge that is WIDE at the throat and tapers toward
 * the belly, plus white paws. Real bibs are wedges; the inverse reads as a
 * bald patch.
 */
function paintBicolor(buf) {
  eachCoat(buf, (x, y, i) => {
    if (POSE.bib(x, y) || REGIONS.isPaw(x, y)) markWhite(buf, i);
  });
}

/**
 * Inverted bicolor for predominantly-white cats: white body with a few dark
 * blobs. Without this, cow_cat renders identically to black_tuxedo.
 */
function paintBicolorInverted(buf) {
  const dark = [];
  eachCoat(buf, (x, y, i) => {
    if (POSE.eyePatch(x, y) || POSE.flankPatch(x, y) || REGIONS.isTail(x, y)) dark.push(i);
    else markWhite(buf, i);
  });
  for (const i of dark) mark(buf, i);
}

/**
 * Tortie: two coat colours in interlocking patches. The domain is warped and
 * sheared before sampling — axis-aligned block noise reads as JPEG corruption
 * and made tortoiseshell and torbie indistinguishable.
 */
function paintTortie(buf) {
  eachCoat(buf, (x, y, i) => {
    if (skipFace(x, y)) return;

    // Torties famously have a split face. Nothing else on the sheet has this,
    // so it becomes the breed's signature read at small size. The pose decides
    // which half is near — side-on, `x >= 16` is every head pixel there is, and
    // the signature read becomes a solid head.
    if (REGIONS.isHead(x, y)) {
      if (POSE.faceNear(x, y)) mark(buf, i);
      return;
    }

    const w = (hash2(x >> 2, y >> 2) - 0.5) * 3;
    const u = (x + y * 0.6 + w) * 0.22;
    const v = (y - x * 0.35) * 0.3;
    const n =
      hash2(Math.floor(u), Math.floor(v)) * 0.6 +
      hash2(Math.floor(u * 2.3), Math.floor(v * 2.3)) * 0.4;
    if (n > 0.48) mark(buf, i);
  });
}

/**
 * Tabby bars laid over tortie patches.
 *
 * A torbie is genetically a tortie that also carries the tabby gene — the same
 * relationship lynx_point has to seal_point. Without the bars it is
 * tortoiseshell in a slightly lighter orange, and the two measured 5.77 ΔE
 * apart, which is a collision at display size.
 */
function paintTortieBars(buf) {
  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const i = idx(x, y);
      if (skipFace(x, y)) continue;

      if ((Math.round(POSE.stripeTortie(x, y)) + 64) % 7 >= 3) continue;

      const s = buf[i];
      if (isCoat(s)) mark(buf, i);
      else if (s === SLOT.PATTERN) buf[i] = SLOT.PATTERN_DARK;
      else if (s === SLOT.PATTERN_LIGHT) buf[i] = SLOT.PATTERN;
    }
  }
}

/** Colourpoint: dark extremities — ears, muzzle, paws, tail. */
function paintPointed(buf, { lynx = false } = {}) {
  const pointed = [];
  eachCoat(buf, (x, y, i) => {
    if (
      REGIONS.isEar(x, y) ||
      REGIONS.isTail(x, y) ||
      REGIONS.isPaw(x, y) ||
      POSE.muzzlePoint(x, y)
    ) {
      pointed.push([x, y, i]);
    }
  });
  for (const [, , i] of pointed) mark(buf, i);

  // A lynx point is a colourpoint WITH tabby bars inside the points — without
  // them it is just a paler seal_point.
  if (!lynx) return;
  for (const [x, y, i] of pointed) {
    if (POSE.lynxBar(x, y) || (REGIONS.isTail(x, y) && y % 4 < 2)) {
      buf[i] = SLOT.PATTERN_LIGHT;
    }
  }
}

/**
 * Smoke: a pale undercoat showing through dark guard hairs. That is a gradient,
 * which in pixel art means a dithered ramp — a hard-edged region would just
 * reproduce the tuxedo bib.
 */
function paintSmoke(buf) {
  eachCoat(buf, (x, y, i) => {
    const t = POSE.smokeT(x, y);
    const j = (hash2(POSE.smokeBand(x, y), y >> 1) - 0.5) * 0.3;
    if (t + j > 0.62) mark(buf, i);
    else if (t + j > 0.48 && ((x + y) & 1) === 0) mark(buf, i);
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Applies a breed's markings to a copy of the rig frame.
 * @param {Uint8Array} frame - rig slot buffer (not mutated)
 * @param {{ pattern: string, hasWhite: boolean, whiteDominant: boolean, id: string }} breed
 */
function applyPattern(frame, breed) {
  const out = frame.slice();

  switch (breed.pattern) {
    case 'tabby':
      paintTabby(out);
      break;
    case 'classic_tabby':
      paintClassicTabby(out);
      break;
    case 'spotted':
      paintSpotted(out);
      break;
    case 'bicolor':
      // A palette *led* by white means white is the dominant colour, so the
      // markings invert: dark blobs on white rather than a white bib on dark.
      if (breed.whiteDominant) {
        paintBicolorInverted(out);
      } else {
        // "Brown tabby & white" is a tabby that also has white. Painting only
        // the bib left it structurally identical to the six other bicolors.
        if (breed.id.includes('tabby')) paintTabby(out);
        paintBicolor(out);
      }
      break;
    case 'tortie':
      paintTortie(out);
      // A torbie is a tortie carrying the tabby gene.
      if (breed.id === 'torbie') paintTortieBars(out);
      // Calico is tortie patches plus white spotting; tortoiseshell has no
      // white at all, which is exactly what separates the two in real genetics.
      if (breed.hasWhite) paintBicolor(out);
      break;
    case 'pointed':
      paintPointed(out, { lynx: breed.id === 'lynx_point' });
      break;
    case 'smoke':
      paintSmoke(out);
      break;
    case 'solid':
    default:
      break;
  }

  return out;
}

module.exports = { applyPattern, setPose };
