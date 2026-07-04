import {
  hexToRgb,
  rgbToLab,
  deltaE76,
  matchColorToBrand,
  getSpriteTemplateColors,
  extractDominantColorsFromPixels,
  extractColorsForSighting,
  BRAND_COLORS,
  SPRITE_TEMPLATE_COLORS,
  RGB,
} from '../colorExtractor';
import { SPRITE_LIBRARY } from '../spriteLibrary';

describe('Color Extractor & Matching Engine', () => {
  describe('hexToRgb', () => {
    it('should parse 6-character hex string correctly', () => {
      expect(hexToRgb('#FF8E53')).toEqual({ r: 255, g: 142, b: 83 });
      expect(hexToRgb('FF8E53')).toEqual({ r: 255, g: 142, b: 83 });
    });

    it('should parse 3-character hex string correctly', () => {
      expect(hexToRgb('#F85')).toEqual({ r: 255, g: 136, b: 85 });
    });

    it('should return null for invalid hex strings', () => {
      expect(hexToRgb('#invalid')).toBeNull();
      expect(hexToRgb('ZZZZZZ')).toBeNull();
    });
  });

  describe('rgbToLab and deltaE76', () => {
    it('should convert RGB to Lab space without crash and preserve light/dark relationships', () => {
      const white = rgbToLab({ r: 255, g: 255, b: 255 });
      const black = rgbToLab({ r: 0, g: 0, b: 0 });
      const ginger = rgbToLab({ r: 255, g: 142, b: 83 });

      // L* of white should be close to 100, black close to 0
      expect(white.L).toBeCloseTo(100, 1);
      expect(black.L).toBeCloseTo(0, 1);

      // DeltaE between black and white should be high (~100)
      const diffBlackWhite = deltaE76(black, white);
      expect(diffBlackWhite).toBeGreaterThan(99);

      // DeltaE between ginger and orange-like colors should be small
      const diffGingerOrange = deltaE76(ginger, rgbToLab({ r: 255, g: 140, b: 80 }));
      const diffGingerBlue = deltaE76(ginger, rgbToLab({ r: 0, g: 0, b: 255 }));
      expect(diffGingerOrange).toBeLessThan(diffGingerBlue);
    });
  });

  describe('matchColorToBrand', () => {
    it('should match exact brand hex strings to themselves', () => {
      const match = matchColorToBrand(BRAND_COLORS.ginger);
      expect(match.name).toBe('ginger');
      expect(match.hex).toBe(BRAND_COLORS.ginger);
      expect(match.distance).toBe(0);
    });

    it('should perceptually match close colors to standard brand tokens', () => {
      // Light orange/peach should match ginger or gingerLight
      const matchPeach = matchColorToBrand('#FF9F68');
      expect(['ginger', 'gingerLight']).toContain(matchPeach.name);

      // Dark brown/gray should match charcoal
      const matchDark = matchColorToBrand('#1C1A19');
      expect(matchDark.name).toBe('charcoal');

      // Light pinkish red should match nosePink
      const matchPinkish = matchColorToBrand('#FFA1A0');
      expect(matchPinkish.name).toBe('nosePink');
    });
  });

  describe('getSpriteTemplateColors', () => {
    it('should return signature colors for known sprite templates', () => {
      expect(getSpriteTemplateColors('orange_mackerel_tabby')).toEqual(['#E87830', '#B84010', '#FFD0A0']);
      expect(getSpriteTemplateColors('black_tuxedo')).toEqual(['#141414', '#F2F2F2', '#FF9E9A']);
    });

    it('should return fallback colors for unknown templates', () => {
      const unknownColors = getSpriteTemplateColors('unknown_sprite');
      expect(unknownColors).toEqual([BRAND_COLORS.ginger, BRAND_COLORS.charcoal, BRAND_COLORS.nosePink]);
    });

    it('should stay in sync with the sprite library (drift guard)', () => {
      // Every sprite in SPRITE_LIBRARY must have a fallback palette entry that
      // exactly matches its canonical palette — and vice versa.
      for (const sprite of SPRITE_LIBRARY) {
        expect(SPRITE_TEMPLATE_COLORS[sprite.id]).toEqual(sprite.palette);
      }
      expect(Object.keys(SPRITE_TEMPLATE_COLORS).sort())
        .toEqual(SPRITE_LIBRARY.map((s) => s.id).sort());
    });
  });

  describe('extractDominantColorsFromPixels', () => {
    it('should extract and map dominant colors from a pixel list', () => {
      const pixels: RGB[] = [
        // Mostly ginger-like orange pixels
        { r: 255, g: 140, b: 80 },
        { r: 250, g: 138, b: 82 },
        { r: 255, g: 145, b: 85 },
        // Some black/charcoal pixels
        { r: 40, g: 40, b: 40 },
        { r: 45, g: 45, b: 45 },
      ];

      const dominant = extractDominantColorsFromPixels(pixels, 2);
      expect(dominant.length).toBeLessThanOrEqual(2);
      expect(dominant).toContain(BRAND_COLORS.ginger);
      expect(dominant).toContain(BRAND_COLORS.charcoal);
    });

    it('should return default fallback if pixel array is empty', () => {
      const dominant = extractDominantColorsFromPixels([]);
      expect(dominant).toEqual([BRAND_COLORS.ginger, BRAND_COLORS.charcoal, BRAND_COLORS.nosePink]);
    });
  });

  describe('extractColorsForSighting', () => {
    it('should prefer real photo pixels over the template palette', () => {
      const colors = extractColorsForSighting({
        spriteTemplateId: 'black_tuxedo',
        photoPixels: [{ r: 255, g: 255, b: 255 }], // observed white pixels win
      });
      expect(colors).toContain(BRAND_COLORS.milk);
      expect(colors).not.toEqual(SPRITE_TEMPLATE_COLORS.black_tuxedo);
    });

    it('should fall back to the template palette when no pixels are provided', () => {
      const colors = extractColorsForSighting({ spriteTemplateId: 'black_tuxedo' });
      expect(colors).toEqual(SPRITE_TEMPLATE_COLORS.black_tuxedo);
    });

    it('should use pixel extraction when the template is unknown', () => {
      const colors = extractColorsForSighting({
        spriteTemplateId: 'custom_or_unknown',
        photoPixels: [{ r: 255, g: 255, b: 255 }], // White
      });
      expect(colors).toContain(BRAND_COLORS.milk);
    });
  });
});
