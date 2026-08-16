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

  // Shading ramp. Shadows shift cool and highlights shift warm — mixing
  // straight to black/white makes every breed read as a greyscale multiply of
  // one hue. Near-black and near-white coats need inverted treatment because
  // there is nowhere left to go in the obvious direction.
  const coatLum = luminance(coat);
  let coatDark;
  let coatLight;
  let outline;

  if (coatLum < 0.2) {
    // Black cats can't be outlined darker — light the rim instead.
    coatDark = mix(coat, '#000008', 0.45);
    coatLight = mix(lighten(coat, 0.34), '#7A8AA8', 0.3);
    outline = mix(coat, '#5A5A78', 0.42);
  } else if (coatLum > 0.85) {
    // A neutral grey keyline reads as dirty wireframe on cream; go warm.
    coatDark = mix(darken(coat, 0.18), '#C8B49A', 0.35);
    coatLight = darken(coat, 0.02);
    outline = mix(darken(coat, 0.55), '#6B5A4A', 0.5);
  } else {
    coatDark = mix(darken(coat, 0.3), '#3A2A40', 0.18);
    coatLight = mix(lighten(coat, 0.22), '#FFE8B0', 0.25);
    outline = darken(coat, 0.62);
  }

  // A lynx point's read is "washed-out points with rings" — lifting its point
  // colour toward the body separates it from the near-black seal point.
  if (breed.id === 'lynx_point' && patternColor) {
    patternColor = mix(patternColor, lightest, 0.3);
  }

  const resolvedPattern = patternColor ?? coatDark;

  // Authored pale fur. On coats too light to shade upward, define features by
  // shading DOWN instead, or paws and muzzle vanish into the body.
  const furLight =
    coatLum > 0.85 ? mix(darken(coat, 0.12), '#E0CDB4', 0.45) : coatLight;

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
    [SLOT.COAT_SHADOW]:
      coatLum < 0.2 ? mix(coat, '#101828', 0.6) : mix(coatDark, '#2A1F33', 0.4),
    [SLOT.PATTERN]: resolvedPattern,
    [SLOT.PATTERN_LIGHT]: lighten(resolvedPattern, 0.2),
    [SLOT.PATTERN_DARK]: darken(resolvedPattern, 0.28),
    [SLOT.WHITE]: whiteColor,
    [SLOT.WHITE_DARK]: mix(darken(whiteColor, 0.14), '#C8B49A', 0.4),
    [SLOT.OUTLINE_SOFT]: mix(outline, coat, 0.45),
    [SLOT.EYE]: eye,
    [SLOT.EYE_DARK]: darken(eye, 0.4),
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
