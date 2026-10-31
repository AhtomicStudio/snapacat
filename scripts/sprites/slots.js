/**
 * Palette slots + per-pattern role inference.
 *
 * The rig is authored in *semantic slots*, never literal colours. A slot buffer
 * plus a breed palette produces a finished sprite, which is what lets one rig
 * cover all 20 breeds in spriteLibrary.ts.
 */

// ---------------------------------------------------------------------------
// Slot table
// ---------------------------------------------------------------------------

const SLOT = {
  EMPTY: 0,
  OUTLINE: 1,
  COAT_DARK: 2,
  COAT_BASE: 3,
  COAT_LIGHT: 4,
  PATTERN: 5, // stripes / tortie patches / colourpoints
  WHITE: 6, // white spotting (tuxedo bib, paws, blaze)
  EYE: 7,
  PINK: 8, // nose, inner ear, paw pads
  EYE_SHINE: 9,
  COAT_SHADOW: 10, // deep occlusion — under chin, under tail
  PATTERN_LIGHT: 11, // markings crossing a lit surface
  PATTERN_DARK: 12, // markings crossing a shadowed surface
  WHITE_DARK: 13, // white fur in shadow
  OUTLINE_SOFT: 14, // interior division lines (leg split, tail over hip)
  EYE_DARK: 15, // limbal ring / pupil
  SHADOW: 16, // ground contact ellipse (composited with alpha)
  /**
   * Authored pale fur — paws, muzzle lobes, chest fluff.
   *
   * Distinct from COAT_LIGHT, which is lambert output. Sharing one slot broke
   * pale breeds: the `coatLum > 0.85` branch correctly refuses to light a white
   * cat brighter, which also flattened every authored feature to 2/255 from the
   * coat and left solid_white and both colourpoints featureless.
   */
  FUR_LIGHT: 17,
};

/** Slots rendered below full opacity. */
const SLOT_ALPHA = {
  [SLOT.SHADOW]: 0.20,
};

/** Authoring template colours — what you draw with in Aseprite. */
const TEMPLATE_COLORS = {
  [SLOT.EMPTY]: null,
  [SLOT.OUTLINE]: '#2B2B33',
  [SLOT.COAT_DARK]: '#8C6239',
  [SLOT.COAT_BASE]: '#C8945A',
  [SLOT.COAT_LIGHT]: '#E4BC88',
  [SLOT.PATTERN]: '#4A2810',
  [SLOT.WHITE]: '#F6F2EA',
  [SLOT.EYE]: '#B8C24A',
  [SLOT.PINK]: '#FF9E9A',
  [SLOT.EYE_SHINE]: '#FFFFFF',
  [SLOT.COAT_SHADOW]: '#6B4423',
  [SLOT.PATTERN_LIGHT]: '#6B3C18',
  [SLOT.PATTERN_DARK]: '#331B0B',
  [SLOT.WHITE_DARK]: '#D8CFC0',
  [SLOT.OUTLINE_SOFT]: '#7A5230',
  [SLOT.EYE_DARK]: '#6E7526',
  [SLOT.SHADOW]: '#8A7A6A',
  [SLOT.FUR_LIGHT]: '#F0D2A8',
};

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Perceptual-ish luminance, 0..1. */
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function saturation(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

const darken = (hex, t) => mix(hex, '#000000', t);
const lighten = (hex, t) => mix(hex, '#FFFFFF', t);

/**
 * Detects the warm pink accents some palettes carry for the nose (e.g.
 * #FF9E9A on solid_black).
 *
 * The discriminator is that pink sits at hue ~0°, meaning blue is nearly as
 * high as green. Testing `g >= b * 0.85` instead — as an earlier version did —
 * matches almost every warm colour, which silently ate the orange out of
 * calico, the cream out of dilute_calico, and seven other coat colours.
 */
function isPinkAccent(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (
    luminance(hex) > 0.6 && saturation(hex) > 0.25 && r > g * 1.15 && b >= g * 0.8
  );
}

const isNearWhite = (hex) => luminance(hex) > 0.78;

// ---------------------------------------------------------------------------
// Role inference
// ---------------------------------------------------------------------------

/**
 * The shading ramp: one coat colour in, four tiers out.
 *
 * WARM LIGHT, COOL SHADOW — AND WHY THE OLD VERSION ONLY MOVED 3 DEGREES
 *
 * The previous ramp had exactly the right intent and said so in its comment.
 * Measured on what actually shipped, it delivered +2 to +3 degrees of hue on
 * the highlight and -2 to -3 on the shadow, which is indistinguishable from
 * no hue shift at all. Two causes, both worth remembering:
 *
 *   1. A WARM TARGET CANNOT ROTATE A WARM HUE. The old highlight mixed
 *      toward cream (#FFE8B0, H44). From a brown at H32 that is almost no
 *      angular distance, so no (lighten, mix) pair can deliver more than
 *      about +3 degrees. To rotate a brown toward gold the target has to sit
 *      on the FAR side of yellow — which is why the targets below look
 *      alarming in isolation (a citron, a magenta) and are nevertheless
 *      correct once mixed at these fractions.
 *   2. The shadow darkened 30% BEFORE mixing 18% toward violet, so the cool
 *      arrived diluted into a colour that was still essentially the base hue.
 *
 * WHY FOUR BRANCHES AND NOT THREE
 *
 * The old mid branch served both browns and greys from one target. One mix
 * target cannot do that: it either greens a grey's highlight or purples its
 * shadow. Splitting warm from near-neutral took the worst residual from 7.6
 * to 4.2 dE. Near-neutrals have no hue to rotate, so they get admixture
 * instead — chroma where there was none, rather than a rotation of nothing.
 *
 * Near-black inverts the anchors: the lit side of a black cat is a sheen of
 * the SKY (cool) and the deepest fill is warm bounce off the ground. The old
 * code had found half of this empirically; this states it.
 *
 * Every tier preserves the authored value. The change is purely chromatic —
 * measured max L* drift across all tiers and all breeds is 0.18.
 */
function shadeRamp(base) {
  const lum = luminance(base);
  const sat = saturation(base);

  // Near-black: anchors invert. Sky sheen on the lit side, warm ground
  // bounce in the fill, and the rim is lit rather than darkened because
  // there is nothing darker to go to.
  if (lum < 0.2) {
    return {
      dark: mix(darken(base, 0.33), '#1C0400', 0.35),
      light: mix(lighten(base, 0.16), '#8C99B6', 0.56),
      outline: mix(lighten(base, 0.03), '#444C76', 0.45),
      shadow: mix(darken(base, 0.11), '#961700', 0.11),
    };
  }

  // Pale: a cream coat in shadow goes lilac, not beige. Shading upward is
  // not available, so the tiers separate by hue and the highlight barely
  // moves at all.
  if (lum > 0.85) {
    // 0.62 was too far. At play size a 62% lilac mix put a violet rim all
    // the way round a pale cat against desaturated ground, and it did not
    // read as light — it read as grime, or as JPEG fringing. Half the
    // shift keeps the cool without the cast.
    const dark = mix(darken(base, 0.04), '#B49BBA', 0.34);
    return {
      dark,
      light: darken(base, 0.02),
      outline: mix(darken(base, 0.55), '#564588', 0.22),
      shadow: mix(darken(dark, 0.31), '#3D75B9', 0.16),
    };
  }

  // Near-neutral: nothing to rotate, so spend the budget on chroma. Greys
  // gain a cool shadow and a warm lit side where they previously had none.
  if (sat < 0.17) {
    const dark = mix(darken(base, 0.13), '#0D143F', 0.33);
    return {
      dark,
      light: mix(lighten(base, 0.36), '#FFB42D', 0.15),
      outline: mix(darken(base, 0.46), '#00133C', 0.40),
      shadow: mix(darken(dark, 0.07), '#1B2552', 0.35),
    };
  }

  // Warm mid, which is most of the cast.
  const dark = mix(darken(base, 0.30), '#75308C', 0.32);
  return {
    dark,
    light: mix(lighten(base, 0.42), '#6CB00F', 0.11),
    outline: mix(darken(base, 0.48), '#2A0C54', 0.39),
    shadow: mix(darken(dark, 0.29), '#4C5477', 0.25),
  };
}
/**
 * spriteLibrary palettes are ordered by *area coverage in a photo*, not by
 * semantic role, and the meaning of each entry shifts with the pattern. Rather
 * than hand-maintaining a 20-row mapping table that would drift the moment a
 * palette is retuned, we infer roles from the pattern plus colour properties.
 *
 * @param {{ palette: string[], pattern: string, id: string }} breed
 * @returns {Record<number, string|null>} slot -> hex
 */
function resolvePalette(breed) {
  const colors = breed.palette.slice();
  const pattern = breed.pattern;

  const coatPool = colors.filter((c) => !isPinkAccent(c));
  const sorted = coatPool.slice().sort((a, b) => luminance(a) - luminance(b));

  const darkest = sorted[0] ?? colors[0];
  const lightest = sorted[sorted.length - 1] ?? colors[0];
  const whites = coatPool.filter(isNearWhite);

  let coat;
  let patternColor;
  let whiteColor = '#F6F2EA';

  switch (pattern) {
    case 'pointed':
      // Cream body, dark extremities — the points ARE the pattern.
      coat = lightest;
      patternColor = darkest;
      break;

    case 'smoke':
      // Dark coat over a pale undercoat. Held well short of the true undercoat
      // colour: full contrast reads as a white bib, not smoke.
      coat = darkest;
      patternColor = mix(coat, lightest, 0.55);
      break;

    case 'bicolor':
      // The palette is ordered by area, so the first non-white entry is the
      // coat. Picking `darkest` instead collapsed grey_tabby_white onto
      // grey_tuxedo and turned brown_tabby_white near-black.
      coat = colors.find((c) => !isNearWhite(c) && !isPinkAccent(c)) ?? colors[0];
      patternColor = darken(coat, 0.35);
      if (whites.length) whiteColor = whites[whites.length - 1];
      break;

    case 'tortie': {
      // A tortie's whole signature is DARK patches interleaved with orange, so
      // the pattern must be the darkest entry. Taking the second-lightest left
      // tortoiseshell painting orange-on-orange with its black never drawn.
      //
      // The white test is also stricter here than isNearWhite: dilute_calico's
      // cream (#EDD0A0, L 0.827) is a coat colour, not spotting, and excluding
      // it collapsed the breed onto solid_grey.
      const nonWhite = coatPool.filter((c) => luminance(c) <= 0.88);
      const byLum = nonWhite.slice().sort((a, b) => luminance(b) - luminance(a));
      coat = byLum[0] ?? colors[0];
      patternColor = byLum[byLum.length - 1] ?? darken(coat, 0.5);
      if (patternColor === coat) patternColor = darken(coat, 0.5);
      if (whites.length) whiteColor = whites[whites.length - 1];
      break;
    }

    case 'tabby':
    case 'classic_tabby':
    case 'spotted':
      coat = colors[0];
      patternColor = darkest === coat ? darken(coat, 0.45) : darkest;
      break;

    case 'solid':
    default:
      coat = colors[0];
      patternColor = null;
      break;
  }

  const coatLum = luminance(coat);
  const { dark: coatDark, light: coatLight, outline, shadow: coatShadowTone } =
    shadeRamp(coat);

  // A lynx point's read is "washed-out points with rings" — lifting its point
  // colour toward the body separates it from the near-black seal point.
  if (breed.id === 'lynx_point' && patternColor) {
    patternColor = mix(patternColor, lightest, 0.3);
  }

  const resolvedPattern = patternColor ?? coatDark;
  // Markings shade on their own terms — a single target cannot serve pattern
  // colours spanning near-black to saturated orange (measured: mean dE 6.3
  // and 7.2 for one-target fits, against 0.2-3.1 for this).
  const patternRamp = shadeRamp(resolvedPattern);

  // Authored pale fur. On coats too light to shade upward, define features by
  // shading DOWN instead, or paws and muzzle vanish into the body.
  const furLight =
    coatLum > 0.85 ? mix(darken(coat, 0.30), '#F9E2C2', 0.66) : coatLight;

  // Pointed cats carry the blue-eye gene; everyone else gets warm green-gold.
  const eye = pattern === 'pointed' || breed.id === 'solid_white' ? '#6FA8DC' : '#B8C24A';

  // Nose and inner-ear pink is a biological constant, not a coat colour —
  // sourcing it from the palette is what let orange coats masquerade as noses.
  // Tinting toward the coat keeps it from out-shouting dark breeds.
  const pink = mix('#FF9E9A', coat, 0.22);

  return {
    [SLOT.EMPTY]: null,
    [SLOT.OUTLINE]: outline,
    [SLOT.COAT_DARK]: coatDark,
    [SLOT.COAT_BASE]: coat,
    [SLOT.COAT_LIGHT]: coatLight,
    [SLOT.FUR_LIGHT]: furLight,
    // Near-black coats have nowhere darker to go, so the shadow tier separates
    // by hue instead of value.
    // The ramp produces this tier directly now, per branch.
    [SLOT.COAT_SHADOW]: coatShadowTone,
    [SLOT.PATTERN]: resolvedPattern,
    [SLOT.PATTERN_LIGHT]: patternRamp.light,
    [SLOT.PATTERN_DARK]: patternRamp.dark,
    [SLOT.WHITE]: whiteColor,
    [SLOT.WHITE_DARK]: mix(darken(whiteColor, 0.09), '#AD84C9', 0.29),
    [SLOT.OUTLINE_SOFT]: mix(outline, coat, 0.45),
    [SLOT.EYE]: eye,
    // This is the PUPIL, not a limbal ring. At 33% darker than a #B8C24A
    // olive it resolved to #696c37 — a mid olive that reads as a shadow on
    // the iris, not as a hole the cat is looking through. A pupil has to
    // be near-black or the eye reads as a flat lozenge.
    [SLOT.EYE_DARK]: mix(darken(eye, 0.80), '#140F24', 0.45),
    [SLOT.PINK]: pink,
    [SLOT.EYE_SHINE]: '#FFFFFF',
    [SLOT.SHADOW]: '#6B5A4A',
  };
}

module.exports = {
  SLOT,
  SLOT_ALPHA,
  TEMPLATE_COLORS,
  resolvePalette,
  hexToRgb,
  rgbToHex,
  luminance,
  saturation,
  mix,
  darken,
  lighten,
  isNearWhite,
  isPinkAccent,
};
