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
    });
  }
});
