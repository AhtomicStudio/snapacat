/**
 * The cat's own body frame, per direction — where the spine runs, where the
 * face is, which way the stripes fall.
 *
 * WHY THIS EXISTS
 *
 * Every painter in patterns.js was written against the sit pose and encodes it
 * as raw screen coordinates: mackerel bars index off `|x - 15.5|`, the tortie
 * face splits at `x >= 16`, the colourpoint muzzle is an ellipse at (15.5, 16),
 * the tuxedo bib is a wedge down the middle of the frame. Every one of those is
 * a statement about a cat facing the camera.
 *
 * Run the same painter over a cat in profile and the statements are false. The
 * spine is horizontal, so bars indexed by distance-from-centre stop following
 * the body and become vertical bands across it — which is why the profile cats
 * read as wood grain rather than as tabbies. The colourpoint muzzle ellipse
 * lands on the shoulder. The tortie split marks the entire head, since side-on
 * every head pixel is past x=16.
 *
 * So the pose is lifted out of the painters and published here as a small set
 * of body-frame queries. The painters ask where the spine is instead of
 * assuming; this module answers per direction.
 *
 * MIRRORING
 *
 * compose() mirrors the whole frame BEFORE the pattern is painted, so W, SW and
 * NW are patterned on an already-flipped buffer. A pose describing E would put
 * the face at x~22 on a cat whose face is now at x~9. mirrorPose() flips the
 * frame of reference to match — without it, every mirrored direction gets its
 * markings on the wrong end of the cat.
 */

const CX = 15.5;

/**
 * The front-facing sit pose.
 *
 * These values are a transcription of what the painters used to hard-code, kept
 * exact on purpose: the whole-frame sheets that ship today render through this
 * pose and must come out byte-identical. The build asserts it.
 */
const SIT = {
  /**
   * Mackerel bar coordinate. Bars are iso-lines of this value, so what it
   * measures decides which way the stripes run.
   *
   * Facing the camera you look straight down the body axis, so the rings around
   * the barrel project to lines of constant distance-from-spine. The squared
   * term splays them outward down the flanks — gently, because a fast fan
   * mirrored about the spine resolves into a chevron across the chest.
   */
  stripe: (x, y) => Math.abs(x - CX) + (y - 16) * (y - 16) * 0.014,

  /** Same, with the harder splay the torbie bars use over tortie patches. */
  stripeTortie: (x, y) => Math.abs(x - CX) + (y - 16) * (y - 16) * 0.035,

  /** Distance from the spine, for anything that wants it unbent. */
  spineDist: (x, y) => Math.abs(x - CX),

  /**
   * The necklace — one band across the upper chest, clear of the fluff.
   * A front-facing tabby's low-frequency signal has to run ACROSS the body.
   */
  necklace: (x, y) => y === 20 && Math.abs(x - CX) < 7.5,

  /** Which ear pixels take the dark back. Spares the inner ear. */
  earMark: (x, y) => Math.abs(x - CX) > 3.5,

  /** Colourpoint muzzle mask — larger than REGIONS.isMuzzle, which is a face-clear. */
  muzzlePoint: (x, y) => ((x - CX) / 5.5) ** 2 + ((y - 16) / 4) ** 2 < 1,

  /**
   * Extra area markings must not cross, on top of REGIONS.isMuzzle.
   *
   * The sit rig publishes isMuzzle as a generous ellipse over the whole lower
   * face, so bars never run through the eyes. The part atlas tags REGION.MUZZLE
   * as the literal nose patch instead — anatomically truer, but it meant the
   * composited heads lost the face-clear the sit pose has always had, and every
   * directional tabby got a 3px bar painted across its eyes.
   *
   * Nothing here for the sit pose: its own isMuzzle already does this job, and
   * adding a second mask would change sheets that currently ship.
   */
  faceClear: () => false,

  /** Tuxedo bib: wide at the throat, tapering toward the belly. */
  bib: (x, y) => {
    const t = (y - 17) / 12;
    const half = 6 - 4.5 * t * t;
    return y >= 17 && y <= 29 && Math.abs(x - CX) <= half;
  },

  /** Classic-tabby swirl centres — one per shoulder. */
  blotches: [[11.5, 22], [20.5, 22]],

  /** The near half of a tortie's split face. */
  faceNear: (x, y) => x >= 16,

  /** Smoke ramp, 0 at the pale undercoat and 1 at the dark guard hairs. */
  smokeT: (x, y) => (y - 14) / 16,

  /** Band index the smoke dither jitters along. */
  smokeBand: (x, y) => Math.round(Math.abs(x - CX)),

  /** Cow-cat blobs: one over an eye, one on the flank. */
  eyePatch: (x, y) => ((x - 12.5) / 3.8) ** 2 + ((y - 11) / 3.2) ** 2 < 1,
  flankPatch: (x, y) => ((x - 21) / 4.5) ** 2 + ((y - 24) / 4) ** 2 < 1,

  /** Lynx bars inside the points — tighter period than the body mackerel. */
  lynxBar: (x, y) => (Math.round(Math.abs(x - CX)) + 64) % 4 < 2,
};

// ---------------------------------------------------------------------------
// Three-quarter poses
// ---------------------------------------------------------------------------

/**
 * SE and NE are the sit pose turned 45 degrees — the head anchor moves +2 in x
 * and the torso leans with it, so everything keyed to the centreline shifts
 * with the body rather than staying nailed to the middle of the frame.
 *
 * Only the offset changes; the stripe geometry is still looking down the body
 * axis, because at 45 degrees the barrel still projects to rings rather than to
 * a length. That is why these are a shift of SIT and not a rewrite of it.
 */
function threeQuarter({ cx, headCx, muzzle, blotches, faceSplit }) {
  return {
    ...SIT,
    stripe: (x, y) => Math.abs(x - cx) + (y - 16) * (y - 16) * 0.014,
    stripeTortie: (x, y) => Math.abs(x - cx) + (y - 16) * (y - 16) * 0.035,
    spineDist: (x) => Math.abs(x - cx),
    necklace: (x, y) => y === 20 && Math.abs(x - cx) < 7.5,
    earMark: (x) => Math.abs(x - headCx) > 2.5,
    muzzlePoint: (x, y) =>
      ((x - muzzle[0]) / muzzle[2]) ** 2 + ((y - muzzle[1]) / muzzle[3]) ** 2 < 1,
    bib: (x, y) => {
      const t = (y - 17) / 12;
      const half = 5.5 - 4 * t * t;
      return y >= 17 && y <= 29 && Math.abs(x - cx) <= half;
    },
    blotches,
    faceNear: (x) => x >= faceSplit,
    smokeBand: (x) => Math.round(Math.abs(x - cx)),
    lynxBar: (x) => (Math.round(Math.abs(x - cx)) + 64) % 4 < 2,
  };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * E — the one pose where the body axis lies across the screen.
 *
 * The torso runs x5..x24 with the back line at y~19 and the belly at y~29; the
 * skull sits x15..x28 with the muzzle low and forward at x26..x28. Nothing the
 * front-facing painters assume survives that.
 *
 * The stripe coordinate is the substantive change. Side-on you see the rings
 * spaced ALONG the body, so bars are iso-lines of x rather than of
 * distance-from-spine — and they rake backward as they fall down the flank,
 * which is the shear term. A mackerel cat photographed from the side is the
 * reference: near-vertical bars, leaning toward the tail, about three to a
 * torso.
 */
const SPINE_Y = 19.5;

const PROFILE_E = {
  // Rake: +0.34 per row below the spine shifts a bar of constant index toward
  // smaller x — toward the tail — as it descends. Straight vertical bars read
  // as a fence; the rake is what sits them on a ribcage.
  stripe: (x, y) => x + (y - SPINE_Y) * 0.34,
  stripeTortie: (x, y) => x + (y - SPINE_Y) * 0.5,
  spineDist: (x, y) => Math.abs(y - SPINE_Y),

  // The shoulder bar, standing in for the necklace. A band across the throat is
  // a front-view read; side-on the equivalent landmark is the shoulder.
  necklace: (x, y) => x === 20 && y >= 18 && y <= 26,

  // A single ear, seen from behind its own edge — all of it takes the dark back.
  earMark: () => true,

  // The mask covers the FACE, not the nose. Side-on that is the brow, cheek
  // and muzzle together — a 3px circle on the nose tip left a seal point with
  // almost no dark area in profile, and a lynx point with nowhere to put bars.
  muzzlePoint: (x, y) => ((x - 24.5) / 5) ** 2 + ((y - 12.5) / 4.5) ** 2 < 1,

  // The bib wraps the chest and runs back under the belly, which is where the
  // white actually sits on a tuxedo seen side-on.
  bib: (x, y) => {
    const throat = x >= 18 && x <= 24 && y >= 19 && y <= 29;
    const belly = y >= 26 && y <= 29 && x >= 9 && x <= 24;
    return throat || belly;
  },

  blotches: [[19.5, 23], [9.5, 24]],

  // Front of the face only. `x >= 16` would mark every head pixel there is.
  faceNear: (x) => x >= 22,

  // The front of the skull — brow, eye and muzzle. Side-on this is the only
  // face there is, so losing it to a stripe costs the direction its whole read.
  faceClear: (x, y) => ((x - 24.5) / 4.5) ** 2 + ((y - 12.5) / 4) ** 2 < 1,

  smokeT: (x, y) => (y - 14) / 16,
  smokeBand: (x, y) => Math.round(Math.abs(y - SPINE_Y)),

  eyePatch: (x, y) => ((x - 22) / 4) ** 2 + ((y - 11) / 3.4) ** 2 < 1,
  flankPatch: (x, y) => ((x - 11) / 4.8) ** 2 + ((y - 24) / 4.2) ** 2 < 1,

  lynxBar: (x) => (Math.round(x) + 64) % 4 < 2,
};

// ---------------------------------------------------------------------------
// Rear white
// ---------------------------------------------------------------------------

/**
 * Where a bicolor's white shows on a cat seen from behind.
 *
 * The chest bib is on the far side of a cat facing away, which is true and was
 * taken too literally: pointing `bib` at a strip of belly behind the hind legs
 * left a rear tuxedo showing 9% white against 26% front-on, and a rear calico
 * showing 3% against 12%. Two consequences, both measured. The breed stopped
 * reading — the only white left on a tuxedo was its two back paws. And two
 * pairs collided outright: solid_grey against grey_tuxedo fell from 10.03 to
 * 5.29 mean ΔE, black_tuxedo against black_smoke from 11.70 to 5.76.
 *
 * What a real bicolor actually shows from behind is the white that runs up the
 * backs of the legs and the white tail tip — so that is what this marks. It
 * restores the coverage without putting a chest bib on a cat's back.
 */
function rearWhite(cx) {
  return (x, y) => {
    /**
     * One solid mass, not a band with a gap down the middle.
     *
     * The first version excluded the centre column, on the reasoning that the
     * white climbs the legs. The amount of white that produced was about
     * right — 24% of a rear tuxedo against 26% before the rework — and it
     * still measured as a regression, because WHERE it sits matters as much as
     * how much there is. Scattered thin white averages back into the coat
     * under the 4x4 block comparison that approximates squinting at a sprite
     * from across a Cat-a-log, and grey_tuxedo drifted back toward solid_grey.
     *
     * A tuxedo seen from behind has white trousers: a continuous mass over the
     * hocks, inner thighs and belly. Drawing it as one shape is both truer and
     * survives downsampling.
     */
    // y25, not y23. At eight rows this overshot: a rear tuxedo showed 32% white
    // against 25% front-on, which inverts the anatomy — a bicolor shows MORE
    // white from the front, where the full bib and all four paws are visible.
    const trousers = y >= 25 && y <= 30 && Math.abs(x - cx) <= 7;
    // The tail tip. paintBicolor never marked the tail in any direction, which
    // is why a tuxedo's most recognisable rear feature was missing entirely.
    const tailTip = y <= 21 && x >= 20;
    return trousers || tailTip;
  };
}

/**
 * The dark nape a colourpoint shows from behind.
 *
 * Removing the front-view muzzle ellipse from the rear poses was correct — it
 * was marking the back of the skull as a muzzle — but it cost the pointed
 * breeds the only large pointed area visible from behind, and with it the room
 * a lynx point's bars need to distinguish it from a seal point. Measured, the
 * pair fell from 8.49 to 6.81 mean ΔE: a collision.
 *
 * A real colourpoint's mask does not stop at the face. It wraps over the brow
 * and down the nape to meet the ears, which is exactly the part still visible
 * when the cat turns away. So this restores the area honestly rather than by
 * putting a muzzle back where there is no muzzle.
 */
function nape(cx) {
  // Sized to the front view's mask rather than smaller than it. A colourpoint's
  // mask covers the lower half of the skull and the nape behind it, and that is
  // as true from behind as from in front — it was only ever the NAME that was
  // wrong. Shrinking it cost the lynx point the room its bars need and dropped
  // seal-against-lynx to 6.81 ΔE, a collision.
  return (x, y) => ((x - cx) / 5.5) ** 2 + ((y - 16) / 4) ** 2 < 1;
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const POSES = {
  /**
   * The composited front view. Same body frame as the sit pose, but it needs
   * the face-clear spelled out because its head is a part rather than the rig.
   *
   * The ellipse stops at y11, above the eyes and below the brow, so the top of
   * the skull still takes bars — that band is the tabby's forehead M, and
   * clearing the whole head would cost the breed its most recognisable marking.
   */
  S: {
    ...SIT,
    faceClear: (x, y) => ((x - CX) / 7) ** 2 + ((y - 15.5) / 4.5) ** 2 < 1,
  },

  N: {
    ...SIT,
    // Seen from behind there is no face to split and no muzzle to keep clear.
    // Pointing those at nothing is more honest than leaving the front-view
    // values in place, where they would mark the back of the skull as a muzzle.
    muzzlePoint: nape(CX),
    faceNear: () => false,
    bib: rearWhite(CX),
    eyePatch: (x, y) => ((x - CX) / 4.5) ** 2 + ((y - 10) / 3.4) ** 2 < 1,
  },

  SE: {
    ...threeQuarter({
      cx: 16.2,
      headCx: 16.5,
      muzzle: [19.5, 16, 5.2, 4],
      blotches: [[12.5, 22], [21, 22.5]],
      faceSplit: 17,
    }),
    // Pushed right with the skull, and a little narrower — at three-quarters
    // the far cheek turns away, so there is less face to keep clear.
    faceClear: (x, y) => ((x - 17.5) / 6.5) ** 2 + ((y - 16) / 4.5) ** 2 < 1,
  },

  NE: {
    ...threeQuarter({
      cx: 15.2,
      headCx: 16.5,
      muzzle: [19.5, 16, 5.2, 4],
      blotches: [[11, 22], [19.5, 22.5]],
      faceSplit: 17,
    }),
    muzzlePoint: nape(16),
    faceNear: () => false,
    bib: rearWhite(15.2),
  },

  E: PROFILE_E,
};

// ---------------------------------------------------------------------------
// Mirroring
// ---------------------------------------------------------------------------

/**
 * Reflects a pose about the frame's vertical axis.
 *
 * Queries are wrapped rather than rewritten: asking the original pose about
 * `31 - x` is exactly asking the mirrored pose about `x`. Point lists are
 * flipped in place. `stripe` reflects like any other query — the bars keep
 * raking toward the tail, because the tail moved too.
 */
function mirrorPose(pose) {
  const out = {};
  for (const [key, value] of Object.entries(pose)) {
    if (typeof value === 'function') {
      out[key] = (x, y) => value(31 - x, y);
    } else if (Array.isArray(value)) {
      out[key] = value.map(([px, py]) => [31 - px, py]);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Pose for a composed, already-mirrored frame of the given direction. */
function poseFor(source, mirrored) {
  const base = POSES[source] ?? SIT;
  return mirrored ? mirrorPose(base) : base;
}

module.exports = { SIT, POSES, mirrorPose, poseFor };
