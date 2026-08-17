import { buildFrameInterpolation } from '../spriteFrames';
import { ANIMATIONS } from '../../assets/sprites';

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

  for (const [name, anim] of Object.entries(ANIMATIONS)) {
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

        const validOffsets = new Set(anim.frames.map((f) => -f * SIZE));
        for (let t = 0; t <= total; t += 1000 / 60) {
          expect(validOffsets.has(sample(t))).toBe(true);
        }
      });
    });
  }
});
