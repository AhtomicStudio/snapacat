import ImageColors from 'react-native-image-colors';
import type { HexColor } from './colorExtractor';
import { logError } from './errorCodes';

// Palettes returned for mock:// URIs — rotated to exercise different sprite matches.
// Each palette is a near-copy of the matching sprite's canonical palette from spriteLibrary.ts.
const MOCK_PALETTES: HexColor[][] = [
  ['#C8945A', '#4A2810', '#E4BC88'],  // → brown_mackerel_tabby  (tier 1)
  ['#141414', '#F2F2F2', '#FF9E9A'],  // → black_tuxedo           (tier 4)
  ['#E87830', '#B84010', '#FFD0A0'],  // → orange_mackerel_tabby  (tier 1)
  ['#B84A20', '#181210', '#C87820'],  // → tortoiseshell          (tier 5)
  ['#ECE0C8', '#3C2018', '#C8A870'],  // → seal_point             (tier 6)
];
let mockPaletteIndex = 0;

/**
 * Extracts dominant palette colors from a photo URI.
 *
 * Real photos (file:// URI): uses Android Palette API via react-native-image-colors.
 * Mock photos (mock:// URI): returns a rotating set of preset palettes for development.
 */
export async function extractPaletteFromPhoto(photoUri: string): Promise<HexColor[]> {
  if (photoUri.startsWith('mock://')) {
    // Rotate through palettes so different cat types are exercised each tap
    const palette = MOCK_PALETTES[mockPaletteIndex % MOCK_PALETTES.length]!;
    mockPaletteIndex++;
    return palette;
  }

  try {
    const result = await ImageColors.getColors(photoUri, {
      fallback: '#8A8A8A',
      cache: false,
    });

    if (result.platform === 'android') {
      const candidates: (string | undefined)[] = [
        result.dominant,
        result.vibrant,
        result.muted,
        result.darkVibrant,
      ];
      const palette = candidates
        .filter((c): c is string => !!c && c !== result.average)
        .slice(0, 3) as HexColor[];
      // Always have at least one colour
      if (palette.length === 0 && result.average) palette.push(result.average as HexColor);
      return palette;
    }

    // iOS / unknown platform fallback
    return ['#8A8A8A' as HexColor];
  } catch {
    // Deliberately does not log the caught error. In this build the throw comes
    // from the expo-modules-core shim and carries a file path; in a real build
    // it could carry a photo URI. The code identifies the path unambiguously
    // without putting either in a log that ships to release.
    logError('SNAP-CAM-02');
    return ['#8A8A8A' as HexColor];
  }
}
