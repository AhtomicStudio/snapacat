import { buildFrameInterpolation } from '../spriteFrames';
import {
  ACT_ANIMATIONS,
  ACT_FRAME_COUNT,
  ANIMATIONS,
  DIR_ANIMATIONS,
  DIR_FRAME_COUNT,
  FRAME_COUNT,
  type SpriteAnimation,
} from '../../assets/sprites';

/**
 * Every sheet the app renders from, with the number of columns it actually
 * has. All three go through the same interpolation, so all three get the same
 * assertions — the action sheet in particular is generated from a different
 * ordering than the directional one, and an off-by-one in that layout would
 * show up as a cat playing someone else's animation.
 */
const SHEETS: Array<{
  sheet: string;
  anims: Record<string, SpriteAnimation>;
  columns: number;
}> = [
  { sheet: 'whole-frame', anims: ANIMATIONS, columns: FRAME_COUNT },
  { sheet: 'directional', anims: DIR_ANIMATIONS, columns: DIR_FRAME_COUNT },
  { sheet: 'action', anims: ACT_ANIMATIONS, columns: ACT_FRAME_COUNT },
];

describe('sheet manifests', () => {
  for (const { sheet, anims, columns } of SHEETS) {
    describe(sheet, () => {
      it('never references a column the sheet does not have', () => {
        // An out-of-range index does not throw. It translates the sheet past
        // its own edge and renders empty, so the cat simply vanishes for that
        // frame — which looks like a flicker, not like a bug with a cause.
        const outOfRange = Object.entries(anims).flatMap(([name, anim]) =>
          anim.frames
            .filter((frame) => frame < 0 || frame >= columns)
            .map((frame) => `${name} frame ${frame} (sheet has ${columns} columns)`),
        );
        expect(outOfRange).toEqual([]);
      });

      it('visits more than one column, so something actually animates', () => {
        for (const anim of Object.values(anims)) {
          expect(new Set(anim.frames).size).toBeGreaterThan(1);
        }
      });
    });
  }
});

/**
 * The interpolation table is what maps elapsed time to a frame offset, and it
 * is the one part of the native-driven renderer that can be asserted without a
 * device. The properties below are the ones that break silently:
 *
 * - a non-flat segment means translateX SLIDES between frames, which renders
 *   half of one pose beside half of the next
 * - a frames/durations length mismatch desyncs timing from display with no error
 */
describe('buildFrameInterpolation', () => {
  const SIZE = 44;

  // Every animation on every sheet, not just the whole-frame ones. The flavour
  // idles have the most lopsided duration tables in the project — a 60ms blink
  // beside a 900ms rest — and lopsided timings are exactly what the 60Hz
  // sampling assertion below exists to police.
  const everyAnimation = SHEETS.flatMap(({ sheet, anims }) =>
    Object.entries(anims).map(([name, anim]) => [`${sheet}/${name}`, anim] as const),
  );

  for (const [name, anim] of everyAnimation) {
    describe(name, () => {
      const { inputRange, outputRange, total } = buildFrameInterpolation(anim, SIZE);

      it('emits two stops per frame', () => {
        expect(inputRange).toHaveLength(anim.frames.length * 2);
        expect(outputRange).toHaveLength(anim.frames.length * 2);
      });

      it('never steps backwards in time', () => {
        for (let i = 1; i < inputRange.length; i++) {
          expect(inputRange[i]!).toBeGreaterThanOrEqual(inputRange[i - 1]!);
        }
      });

      it('holds each frame flat, so frames cut rather than slide', () => {
        for (let k = 0; k < anim.frames.length; k++) {
          expect(outputRange[2 * k]).toBe(outputRange[2 * k + 1]);
        }
      });

      it('shares a boundary between adjacent frames, leaving no ramp', () => {
        for (let k = 1; k < anim.frames.length; k++) {
          expect(inputRange[2 * k]).toBe(inputRange[2 * k - 1]);
        }
      });

      it('offsets each frame by its index in the sheet', () => {
        anim.frames.forEach((frameIndex, k) => {
          expect(outputRange[2 * k]).toBe(-frameIndex * SIZE);
        });
      });

      it('runs exactly as long as its durations sum to', () => {
        expect(total).toBe(anim.durations.reduce((a, b) => a + b, 0));
      });

      it('has one duration per frame', () => {
        expect(anim.durations).toHaveLength(anim.frames.length);
      });

      it('produces a range Animated will accept', () => {
        // Every assertion above is indexed off frames.length, so an animation
        // with no frames satisfies all of them vacuously. checkValidInputRange's
        // >= 2 invariant is __DEV__-only; a release build hands an empty range
        // straight to the native driver.
        expect(inputRange.length).toBeGreaterThanOrEqual(2);
        expect(total).toBeGreaterThan(0);
      });

      it('gives every frame a strictly positive hold', () => {
        // A 0ms hold on the FIRST or LAST frame is the one case where range
        // lookup can select a zero-width segment — interior ones are
        // unreachable — and iOS's old-architecture interpolation divides by the
        // input width without guarding, yielding NaN.
        for (let k = 0; k < anim.frames.length; k++) {
          expect(inputRange[2 * k + 1]! - inputRange[2 * k]!).toBeGreaterThan(0);
        }
      });

      it('lands on an exact frame offset at every 60Hz sample, never between two', () => {
        // Mirrors AnimatedInterpolation's findRange + interpolate. This is the
        // property the design actually depends on; the structural assertions
        // above only describe the shape that delivers it.
        const sample = (t: number) => {
          let i = 1;
          for (; i < inputRange.length - 1; i++) if (inputRange[i]! >= t) break;
          const r = i - 1;
          const [iMin, iMax] = [inputRange[r]!, inputRange[r + 1]!];
          const [oMin, oMax] = [outputRange[r]!, outputRange[r + 1]!];
          if (oMin === oMax) return oMin;
          return oMin + ((oMax - oMin) * (t - iMin)) / (iMax - iMin);
        };

        // Sampled every 0.25ms, NOT every 60Hz tick. The 1ms ramp this test
        // exists to catch was invisible to 16.67ms sampling — with these exact
        // durations no display frame ever landed inside one, which is precisely
        // how it survived into a release. A 60Hz step here would pass cleanly
        // on the very defect it replaced.
        const validOffsets = new Set(anim.frames.map((f) => -f * SIZE));
        const between: number[] = [];
        for (let t = 0; t <= total; t += 0.25) {
          if (!validOffsets.has(sample(t))) between.push(t);
        }
        expect(between).toEqual([]);
      });
    });
  }
});
