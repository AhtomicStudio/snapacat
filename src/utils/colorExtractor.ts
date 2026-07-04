import designTokens from '../../.agent/skills/brand-identity/resources/design-tokens.json';

export type HexColor = `#${string}`;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

// Map the design token colors to a typed record
export const BRAND_COLORS = {
  // Brand Colors
  ginger: (designTokens.colors?.brand?.ginger || '#FF8E53') as HexColor,
  gingerDark: (designTokens.colors?.brand?.gingerDark || '#E67035') as HexColor,
  gingerLight: (designTokens.colors?.brand?.gingerLight || '#FFE8DC') as HexColor,
  nosePink: (designTokens.colors?.brand?.nosePink || '#FFAAA6') as HexColor,
  cream: (designTokens.colors?.brand?.cream || '#FAF6F0') as HexColor,
  milk: (designTokens.colors?.brand?.milk || '#FFFFFF') as HexColor,
  charcoal: (designTokens.colors?.brand?.charcoal || '#2C2A29') as HexColor,
  // UI colors
  background: (designTokens.colors?.ui?.background || '#FAF6F0') as HexColor,
  cardBg: (designTokens.colors?.ui?.cardBg || '#FFFFFF') as HexColor,
  textPrimary: (designTokens.colors?.ui?.textPrimary || '#2C2A29') as HexColor,
  textSecondary: (designTokens.colors?.ui?.textSecondary || '#706B67') as HexColor,
  border: (designTokens.colors?.ui?.border || '#EAE3DA') as HexColor,
  success: (designTokens.colors?.ui?.success || '#A8D0E6') as HexColor,
  warning: (designTokens.colors?.ui?.warning || '#F8D49B') as HexColor,
  error: (designTokens.colors?.ui?.error || '#F79E89') as HexColor,
} as const;

// Static fallback palettes for all 20 sprite types — mirrors spriteLibrary.ts palettes.
// Used when a cat record has no extracted_colors stored on its scrapbook entries.
export const SPRITE_TEMPLATE_COLORS: Record<string, HexColor[]> = {
  // Tier 1 — Wild-types
  brown_mackerel_tabby:  ['#C8945A', '#4A2810', '#E4BC88'],
  brown_classic_tabby:   ['#C08048', '#3C2010', '#D4A870'],
  grey_mackerel_tabby:   ['#ACACAC', '#404040', '#D0D0D0'],
  orange_mackerel_tabby: ['#E87830', '#B84010', '#FFD0A0'],
  // Tier 2 — White-spotted tabbies
  brown_tabby_white:     ['#C08040', '#F0F0F0', '#4A2810'],
  grey_tabby_white:      ['#989898', '#F0F0F0', '#404040'],
  orange_tabby_white:    ['#E87030', '#F0F0F0', '#B83C08'],
  // Tier 3 — Solids
  solid_black:           ['#101010', '#242424', '#FF9E9A'],
  solid_grey:            ['#888888', '#ACACAC', '#606060'],
  solid_white:           ['#F8F8F8', '#DCDCDC', '#FF9E9A'],
  // Tier 4 — Solid bicolors
  black_tuxedo:          ['#141414', '#F2F2F2', '#FF9E9A'],
  grey_tuxedo:           ['#787878', '#F2F2F2', '#484848'],
  cow_cat:               ['#F5F5F5', '#101010', '#808080'],
  // Tier 5 — Sex-linked multi-colors
  tortoiseshell:         ['#B84A20', '#181210', '#C87820'],
  calico:                ['#F5F5F5', '#E8782A', '#181A1E'],
  dilute_calico:         ['#F0F0F0', '#909090', '#EDD0A0'],
  torbie:                ['#B05A20', '#241810', '#D09060'],
  // Tier 6 — Recessive variants
  seal_point:            ['#ECE0C8', '#3C2018', '#C8A870'],
  lynx_point:            ['#EEE8D8', '#C4B090', '#806040'],
  black_smoke:           ['#202028', '#303038', '#D0D0D8'],
};

/**
 * Converts a hex color string (e.g. "#FF8E53" or "FF8E53") to RGB values.
 */
export function hexToRgb(hex: string): RGB | null {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 3 && cleaned.length !== 6) {
    return null;
  }

  let r = 0, g = 0, b = 0;
  if (cleaned.length === 3) {
    const rChar = cleaned[0] || '0';
    const gChar = cleaned[1] || '0';
    const bChar = cleaned[2] || '0';
    r = parseInt(rChar + rChar, 16);
    g = parseInt(gChar + gChar, 16);
    b = parseInt(bChar + bChar, 16);
  } else {
    r = parseInt(cleaned.substring(0, 2), 16);
    g = parseInt(cleaned.substring(2, 4), 16);
    b = parseInt(cleaned.substring(4, 6), 16);
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  return { r, g, b };
}

/**
 * Converts RGB to CIE XYZ space.
 */
export function rgbToXyz(rgb: RGB): { x: number; y: number; z: number } {
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  r *= 100;
  g *= 100;
  b *= 100;

  // D65 illuminant conversion matrix
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  return { x, y, z };
}

/**
 * Converts CIE XYZ to CIE L*a*b* space.
 */
export function xyzToLab(xyz: { x: number; y: number; z: number }): Lab {
  // Reference white D65/2°
  const Xn = 95.047;
  const Yn = 100.000;
  const Zn = 108.883;

  let x = xyz.x / Xn;
  let y = xyz.y / Yn;
  let z = xyz.z / Zn;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const b = 200 * (y - z);

  return { L, a, b };
}

/**
 * Converts RGB to Lab space directly.
 */
export function rgbToLab(rgb: RGB): Lab {
  return xyzToLab(rgbToXyz(rgb));
}

/**
 * Calculates CIE76 Delta-E color difference between two Lab colors.
 */
export function deltaE76(color1: Lab, color2: Lab): number {
  const dL = color1.L - color2.L;
  const da = color1.a - color2.a;
  const db = color1.b - color2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Matches any input color (hex or RGB) to the closest brand/UI design token color.
 * Uses CIE76 Delta-E algorithm for perceptual accuracy.
 */
export function matchColorToBrand(color: string | RGB): { name: string; hex: HexColor; distance: number } {
  let rgbInput: RGB | null = null;
  if (typeof color === 'string') {
    rgbInput = hexToRgb(color);
  } else {
    rgbInput = color;
  }

  if (!rgbInput) {
    // Fallback if parsing fails
    return { name: 'charcoal', hex: BRAND_COLORS.charcoal as HexColor, distance: Infinity };
  }

  const inputLab = rgbToLab(rgbInput);

  let closestName = 'charcoal';
  let closestHex = BRAND_COLORS.charcoal as HexColor;
  let minDistance = Infinity;

  for (const [name, hexVal] of Object.entries(BRAND_COLORS)) {
    const brandRgb = hexToRgb(hexVal);
    if (!brandRgb) continue;

    const brandLab = rgbToLab(brandRgb);
    const distance = deltaE76(inputLab, brandLab);

    if (distance < minDistance) {
      minDistance = distance;
      closestName = name;
      closestHex = hexVal;
    }
  }

  return { name: closestName, hex: closestHex, distance: minDistance };
}

/**
 * Get colors for a standard sprite template ID.
 * Returns the exact brand-synced signature colors.
 * Fallbacks to ginger + charcoal + nosePink if unknown.
 */
export function getSpriteTemplateColors(spriteTemplateId: string): HexColor[] {
  const colors = SPRITE_TEMPLATE_COLORS[spriteTemplateId];
  if (colors) {
    return colors;
  }
  return [BRAND_COLORS.ginger, BRAND_COLORS.charcoal, BRAND_COLORS.nosePink];
}

/**
 * Extract dominant colors from a custom array of pixel colors.
 * Groups/quantizes colors using simple grid bucketing (histogram quantization)
 * and returns the top matched brand colors.
 */
export function extractDominantColorsFromPixels(pixels: RGB[], maxColors = 3): HexColor[] {
  if (pixels.length === 0) {
    return [BRAND_COLORS.ginger, BRAND_COLORS.charcoal, BRAND_COLORS.nosePink];
  }

  // Use a histogram bucketing by rounding RGB values to nearest 16 for basic color grouping
  const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};

  for (const pixel of pixels) {
    // Round to nearest 32 to group similar colors
    const rKey = Math.round(pixel.r / 32) * 32;
    const gKey = Math.round(pixel.g / 32) * 32;
    const bKey = Math.round(pixel.b / 32) * 32;
    const key = `${rKey},${gKey},${bKey}`;

    const existing = buckets[key];
    if (existing) {
      existing.count++;
      // Running average for better representative color
      existing.r = (existing.r + pixel.r) / 2;
      existing.g = (existing.g + pixel.g) / 2;
      existing.b = (existing.b + pixel.b) / 2;
    } else {
      buckets[key] = { r: pixel.r, g: pixel.g, b: pixel.b, count: 1 };
    }
  }

  // Sort buckets by count descending
  const sortedBuckets = Object.values(buckets).sort((a: { count: number }, b: { count: number }) => b.count - a.count);

  // Take the representative colors of the top buckets, map them to the closest brand token, and deduplicate
  const resultColors = new Set<HexColor>();
  for (const bucket of sortedBuckets) {
    const matched = matchColorToBrand({ r: bucket.r, g: bucket.g, b: bucket.b });
    resultColors.add(matched.hex);
    if (resultColors.size >= maxColors) {
      break;
    }
  }

  // Ensure we return at least one color, fallback if somehow empty
  if (resultColors.size === 0) {
    return [BRAND_COLORS.ginger];
  }

  return Array.from(resultColors);
}

/**
 * High-level service function to resolve colors for a sighting.
 * Real observed photo pixels always win — they are this cat's actual colours.
 * The sprite template palette is the fallback when no photo data exists.
 */
export function extractColorsForSighting(options: {
  spriteTemplateId?: string;
  photoPixels?: RGB[];
}): HexColor[] {
  if (options.photoPixels && options.photoPixels.length > 0) {
    return extractDominantColorsFromPixels(options.photoPixels);
  }

  if (options.spriteTemplateId && options.spriteTemplateId in SPRITE_TEMPLATE_COLORS) {
    return getSpriteTemplateColors(options.spriteTemplateId);
  }

  // General fallback
  return [BRAND_COLORS.ginger, BRAND_COLORS.charcoal, BRAND_COLORS.nosePink];
}
