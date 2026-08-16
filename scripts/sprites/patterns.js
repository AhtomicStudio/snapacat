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
 * Mackerel tabby: narrow bars that splay outward down the flanks. Screen-space
 * vertical bars on a round body read as corduroy; bending them by the square of
 * the distance from the spine makes them follow the form.
 */
function paintTabby(buf) {
  eachCoat(buf, (x, y, i) => {
    if (REGIONS.isMuzzle(x, y)) return;

    // The tail gets rings, not a continuous vertical seam.
    if (REGIONS.isTail(x, y)) {
      if (y % 4 < 2) mark(buf, i);
      return;
    }

    // Everything is computed from distance-to-spine, never from raw x. Bending
    // by sign(x) flipped the stripe phase across the midline and left 36% of
    // mirrored pixel pairs disagreeing — most visibly on a front-facing head.
    const d = Math.abs(x - 15.5);
    // Gentle splay only. At 0.035 the bars fanned fast enough that, mirrored
    // about the spine on a front-facing pose, they resolved into a chevron
    // across the chest rather than into stripes down the flanks.
    const bend = (y - 16) * (y - 16) * 0.014;

    // Necklace: one band across the upper chest, clear of the fluff at y21-23.
    // A front-facing tabby's low-frequency signal has to run ACROSS the body —
    // a dorsal spine is right on a side view and draws a bar down the chest
    // here. Spanning the full width matters: leaving a gap at the centreline
    // turned the band into a chevron that read as a heart marking.
    if (y === 20 && d < 7.5) {
      mark(buf, i);
      return;
    }
    // Dark ear backs with a paler thumbprint. Lands at the top of the sprite
    // where a solid-coloured breed has no structure at all.
    if (REGIONS.isEar(x, y) && d > 3.5) {
      mark(buf, i);
      return;
    }

    // Fine 33%-duty bars average straight back to the base coat when the sprite
    // is downsampled to phone size, which is how a grey tabby landed 2.57 ΔE
    // from a solid grey when squinted at. Widening to 43% duty shifts the block
    // average without adding a low-frequency band.
    //
    // A solid dorsal spine would do this better — but only on a side view. Our
    // sit pose faces the camera, where "along the spine" is the centre of the
    // chest, and a 3px bar there reads as a stripe down the cat's front.
    if ((Math.round(d + bend) + 64) % 7 < 3) mark(buf, i);
  });
}

/** Classic tabby: two off-centre shoulder swirls, which read as marbling. */
function paintClassicTabby(buf) {
  eachCoat(buf, (x, y, i) => {
    if (REGIONS.isMuzzle(x, y)) return;
    if (REGIONS.isTail(x, y)) {
      if (y % 4 < 2) mark(buf, i);
      return;
    }
    // Rounded before the modulo so the two mirrored centres stay in phase.
    for (const [ox, oy] of [[11.5, 22], [20.5, 22]]) {
      // 33% duty against the mackerel's 43%. "Blotched" means broad marks with
      // more open coat between them, and block-averaging discards shape — so
      // the two tabby families need different COVERAGE, not just different
      // geometry, or they collapse onto each other when downsampled.
      const r = Math.round(Math.hypot(x - ox, (y - oy) * 1.15));
      if (r % 9 < 3) {
        mark(buf, i);
        return;
      }
    }
  });
}

/** Spotted: a scattered dot field. */
function paintSpotted(buf) {
  eachCoat(buf, (x, y, i) => {
    if (REGIONS.isMuzzle(x, y)) return;
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
    const t = (y - 17) / 12; // 0 at throat, 1 at belly
    const bibHalf = 6 - 4.5 * t * t;
    const bib = y >= 17 && y <= 29 && Math.abs(x - 15.5) <= bibHalf;
    const paws = REGIONS.isPaw(x, y);
    if (bib || paws) markWhite(buf, i);
  });
}

/**
 * Inverted bicolor for predominantly-white cats: white body with a few dark
 * blobs. Without this, cow_cat renders identically to black_tuxedo.
 */
function paintBicolorInverted(buf) {
  const dark = [];
  eachCoat(buf, (x, y, i) => {
    const eyePatch = ((x - 12.5) / 3.8) ** 2 + ((y - 11) / 3.2) ** 2 < 1;
    const flank = ((x - 21) / 4.5) ** 2 + ((y - 24) / 4) ** 2 < 1;
    const tail = REGIONS.isTail(x, y);
    if (eyePatch || flank || tail) dark.push(i);
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
    if (REGIONS.isMuzzle(x, y)) return;

    // Torties famously have a split face. Nothing else on the sheet has this,
    // so it becomes the breed's signature read at small size.
    if (REGIONS.isHead(x, y)) {
      if (x >= 16) mark(buf, i);
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
      if (REGIONS.isMuzzle(x, y)) continue;

      const d = Math.abs(x - 15.5);
      const bend = (y - 16) * (y - 16) * 0.035;
      if ((Math.round(d + bend) + 64) % 7 >= 3) continue;

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
    const muzzle = ((x - 15.5) / 5.5) ** 2 + ((y - 16) / 4) ** 2 < 1;
    if (REGIONS.isEar(x, y) || REGIONS.isTail(x, y) || REGIONS.isPaw(x, y) || muzzle) {
      pointed.push([x, y, i]);
    }
  });
  for (const [, , i] of pointed) mark(buf, i);

  // A lynx point is a colourpoint WITH tabby bars inside the points — without
  // them it is just a paler seal_point.
  if (!lynx) return;
  for (const [x, y, i] of pointed) {
    const d = Math.abs(x - 15.5);
    if ((Math.round(d) + 64) % 4 < 2 || (REGIONS.isTail(x, y) && y % 4 < 2)) {
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
    const t = (y - 14) / 16;
    const j = (hash2(Math.round(Math.abs(x - 15.5)), y >> 1) - 0.5) * 0.3;
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

module.exports = { applyPattern };
