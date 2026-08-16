import type { HexColor } from './colorExtractor';
import { hexToRgb, rgbToLab, deltaE76 } from './colorExtractor';

export type SpriteRarity = 'common' | 'uncommon' | 'rare';
export type SpritePattern =
  | 'tabby'
  | 'classic_tabby'
  | 'solid'
  | 'bicolor'
  | 'pointed'
  | 'tortie'
  | 'smoke'
  | 'spotted';

export interface SpriteDefinition {
  id: string;
  label: string;
  description: string;
  /** Dominant palette ordered by area-coverage in a typical photo. Used for matching. */
  palette: HexColor[];
  pattern: SpritePattern;
  rarity: SpriteRarity;
  /** Tier from the genetic taxonomy (1–6). */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
}

// ─── Tier 1 — The Dominant Wild-Types ────────────────────────────────────────

const TIER_1: SpriteDefinition[] = [
  {
    id: 'brown_mackerel_tabby',
    label: 'Brown Mackerel Tabby',
    description: 'The original wild-type. Every house cat secretly believes it\'s a forest panther.',
    palette: ['#C8945A', '#4A2810', '#E4BC88'],
    pattern: 'tabby',
    rarity: 'common',
    tier: 1,
  },
  {
    id: 'brown_classic_tabby',
    label: 'Brown Classic Tabby',
    description: 'Bold marbled swirls. Genetically ancient, artistically gifted.',
    palette: ['#C08048', '#3C2010', '#D4A870'],
    pattern: 'classic_tabby',
    rarity: 'common',
    tier: 1,
  },
  {
    id: 'grey_mackerel_tabby',
    label: 'Grey Mackerel Tabby',
    description: 'The dilute edition. All the attitude, softened palette.',
    palette: ['#A8B0BC', '#404550', '#D4D8E0'],
    pattern: 'tabby',
    rarity: 'common',
    tier: 1,
  },
  {
    id: 'orange_mackerel_tabby',
    label: 'Orange Mackerel Tabby',
    description: 'All orange cats are tabbies underneath. They just prefer not to discuss it.',
    palette: ['#E87830', '#B84010', '#FFD0A0'],
    pattern: 'tabby',
    rarity: 'common',
    tier: 1,
  },
];

// ─── Tier 2 — Co-Dominant White-Spotted Tabbies ──────────────────────────────

const TIER_2: SpriteDefinition[] = [
  {
    id: 'brown_tabby_white',
    label: 'Brown Tabby & White',
    description: 'Brown stripes, white accessories. Business up top, chaos everywhere else.',
    palette: ['#C08040', '#F0F0F0', '#4A2810'],
    pattern: 'bicolor',
    rarity: 'common',
    tier: 2,
  },
  {
    id: 'grey_tabby_white',
    label: 'Grey Tabby & White',
    description: 'Clean white patches, serious grey stripes. Perpetually unimpressed.',
    palette: ['#9A9A9A', '#F0F0F0', '#404040'],
    pattern: 'bicolor',
    rarity: 'common',
    tier: 2,
  },
  {
    id: 'orange_tabby_white',
    label: 'Orange Tabby & White',
    description: 'Creamsicle energy. Zero regrets, maximum volume.',
    palette: ['#E87030', '#F0F0F0', '#B83C08'],
    pattern: 'bicolor',
    rarity: 'common',
    tier: 2,
  },
];

// ─── Tier 3 — The Solids (Non-Agouti) ────────────────────────────────────────

const TIER_3: SpriteDefinition[] = [
  {
    id: 'solid_black',
    label: 'Solid Black',
    description: 'Eumelanin at full dominance. Moves through darkness like a rumour.',
    palette: ['#101010', '#242424', '#FF9E9A'],
    pattern: 'solid',
    rarity: 'common',
    tier: 3,
  },
  {
    id: 'solid_grey',
    label: 'Solid Grey',
    description: 'Diluted black, undiluted confidence. Also called Blue by those who know.',
    palette: ['#7C8288', '#A4AAB2', '#585E64'],
    pattern: 'solid',
    rarity: 'common',
    tier: 3,
  },
  {
    id: 'solid_white',
    label: 'Solid White',
    description: 'The masking gene: dominant, dramatic, and thoroughly aware of both.',
    palette: ['#F8F8F8', '#DCDCDC', '#FF9E9A'],
    pattern: 'solid',
    rarity: 'common',
    tier: 3,
  },
];

// ─── Tier 4 — Solid Bicolors ──────────────────────────────────────────────────

const TIER_4: SpriteDefinition[] = [
  {
    id: 'black_tuxedo',
    label: 'Black Tuxedo',
    description: 'Born formal. Has never once been invited anywhere appropriate.',
    palette: ['#141414', '#F2F2F2', '#FF9E9A'],
    pattern: 'bicolor',
    rarity: 'uncommon',
    tier: 4,
  },
  {
    id: 'grey_tuxedo',
    label: 'Grey Tuxedo',
    description: 'Slate sophistication with a white cravat. Effortlessly distinguished.',
    palette: ['#5A5D64', '#F2F2F2', '#3A3D42'],
    pattern: 'bicolor',
    rarity: 'uncommon',
    tier: 4,
  },
  {
    id: 'cow_cat',
    label: 'Cow Cat',
    description: 'The genome went rogue. The cat is art now.',
    palette: ['#F5F5F5', '#101010', '#808080'],
    pattern: 'bicolor',
    rarity: 'uncommon',
    tier: 4,
  },
];

// ─── Tier 5 — Sex-Linked Multi-Colors ────────────────────────────────────────

const TIER_5: SpriteDefinition[] = [
  {
    id: 'tortoiseshell',
    label: 'Tortoiseshell',
    description: 'Two X-chromosomes, infinite personality. Never white, never neutral.',
    palette: ['#B84A20', '#181210', '#C87820'],
    pattern: 'tortie',
    rarity: 'uncommon',
    tier: 5,
  },
  {
    id: 'calico',
    label: 'Calico',
    description: 'Three colours, one impossible temperament. Statistically female.',
    palette: ['#F5F5F5', '#E8782A', '#181A1E'],
    pattern: 'tortie',
    rarity: 'uncommon',
    tier: 5,
  },
  {
    id: 'dilute_calico',
    label: 'Dilute Calico',
    description: 'The pastel remix. Black fades to slate, orange fades to cream.',
    palette: ['#F0F0F0', '#909090', '#EDD0A0'],
    pattern: 'tortie',
    rarity: 'uncommon',
    tier: 5,
  },
  {
    id: 'torbie',
    label: 'Torbie',
    description: 'Tabby stripes inside a tortie coat. Genetically improbable, visually unreasonable.',
    palette: ['#B05A20', '#241810', '#D09060'],
    pattern: 'tortie',
    rarity: 'rare',
    tier: 5,
  },
];

// ─── Tier 6 — Recessive Special Variants ─────────────────────────────────────

const TIER_6: SpriteDefinition[] = [
  {
    id: 'seal_point',
    label: 'Seal Point',
    description: 'Heat maps written in fur. Cream body, espresso extremities.',
    palette: ['#ECE0C8', '#3C2018', '#C8A870'],
    pattern: 'pointed',
    rarity: 'rare',
    tier: 6,
  },
  {
    id: 'lynx_point',
    label: 'Lynx Point',
    description: 'Temperature-sensitive albinism meets the tabby gene. Worth every recessive coin.',
    palette: ['#EEE8D8', '#C4B090', '#806040'],
    pattern: 'pointed',
    rarity: 'rare',
    tier: 6,
  },
  {
    id: 'black_smoke',
    label: 'Black Smoke',
    description: 'Appears solid black. Reveals stark white undercoat mid-stretch. You\'re welcome.',
    palette: ['#202028', '#303038', '#D0D0D8'],
    pattern: 'smoke',
    rarity: 'rare',
    tier: 6,
  },
];

// ─── Full library (canonical order matches tier structure) ────────────────────

export const SPRITE_LIBRARY: SpriteDefinition[] = [
  ...TIER_1,
  ...TIER_2,
  ...TIER_3,
  ...TIER_4,
  ...TIER_5,
  ...TIER_6,
];

export function getSpriteById(id: string): SpriteDefinition {
  return SPRITE_LIBRARY.find((s) => s.id === id) ?? SPRITE_LIBRARY[0]!;
}

export function getSpritesByTier(tier: SpriteDefinition['tier']): SpriteDefinition[] {
  return SPRITE_LIBRARY.filter((s) => s.tier === tier);
}

// ─── Palette-to-sprite matching ───────────────────────────────────────────────

function paletteDistance(extractedColors: HexColor[], spritePalette: HexColor[]): number {
  // For each extracted color, find the minimum Delta-E to any sprite palette color.
  // Average across valid extracted colors — lower score = better match.
  let total = 0;
  let count = 0;

  for (const ec of extractedColors) {
    const rgb1 = hexToRgb(ec);
    if (!rgb1) continue;
    const lab1 = rgbToLab(rgb1);

    let minDist = Infinity;
    for (const sc of spritePalette) {
      const rgb2 = hexToRgb(sc);
      if (!rgb2) continue;
      minDist = Math.min(minDist, deltaE76(lab1, rgbToLab(rgb2)));
    }

    if (minDist < Infinity) {
      total += minDist;
      count++;
    }
  }

  return count === 0 ? Infinity : total / count;
}

/**
 * Given palette colors extracted from a photo, returns the sprite ID whose
 * palette is perceptually closest (lowest average Delta-E76 distance).
 */
export function matchSpriteToColors(extractedColors: HexColor[]): string {
  if (extractedColors.length === 0) return SPRITE_LIBRARY[0]!.id;

  let bestId   = SPRITE_LIBRARY[0]!.id;
  let bestScore = Infinity;

  for (const sprite of SPRITE_LIBRARY) {
    const score = paletteDistance(extractedColors, sprite.palette);
    if (score < bestScore) {
      bestScore = score;
      bestId    = sprite.id;
    }
  }

  return bestId;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const RARITY_STARS: Record<SpriteRarity, string> = {
  common:   '⭐',
  uncommon: '⭐⭐',
  rare:     '⭐⭐⭐',
};

export const RARITY_LABELS: Record<SpriteRarity, string> = {
  common:   'Common',
  uncommon: 'Uncommon',
  rare:     'Rare',
};

export const PATTERN_LABELS: Record<SpritePattern, string> = {
  tabby:         'Mackerel',
  classic_tabby: 'Classic',
  solid:         'Solid',
  bicolor:       'Bi-colour',
  pointed:       'Pointed',
  tortie:        'Tortie',
  smoke:         'Smoke',
  spotted:       'Spotted',
};

export const TIER_NAMES: Record<SpriteDefinition['tier'], string> = {
  1: 'Wild-Type',
  2: 'White-Spotted',
  3: 'Solid',
  4: 'Solid Bicolour',
  5: 'Sex-Linked',
  6: 'Recessive Variant',
};
