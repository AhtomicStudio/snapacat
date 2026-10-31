/**
 * Pure frame-timing maths for CatSprite.
 *
 * Kept out of the component so it can be tested without pulling in React
 * Native, and because it is the one part of the native-driven renderer that is
 * assertable off-device.
 */
import type { SpriteAnimation } from '../assets/sprites';

export interface FrameInterpolation {
  inputRange: number[];
  outputRange: number[];
  /** Full cycle length in ms. */
  total: number;
}

/**
 * Builds the time → translateX interpolation for an animation.
 *
 * Each frame contributes a FLAT segment, and adjacent segments share a boundary
 * value so the transition has zero width. An earlier version ended each segment
 * one millisecond early, which left a 1ms sloped ramp where translateX slid
 * between two frame positions — sampling one would render the right half of one
 * pose beside the left half of the next. With the current duration tables no
 * 60Hz sample happens to land inside those ramps, but that is an accident of
 * these particular numbers and would break the moment a duration is retuned.
 *
 * Duplicate adjacent stops are safe, but for a narrower reason than it first
 * appears. Range lookup breaks at the first index whose input is >= the value,
 * which requires `range[i-1] < value <= range[i]` — impossible when the two are
 * equal. That rules out every *interior* segment. It does not rule out the
 * first or last, which the lookup reaches via its immediate-break and
 * loop-exhaustion paths. A zero-width segment there would be evaluated, and
 * iOS's old-architecture interpolation has no guard against dividing by a
 * zero-width input range — it yields NaN. Hence the clamp on `hold` below:
 * `durations[i] ?? 400` passes a literal 0 straight through, since `0 ?? 400`
 * is 0.
 */
export function buildFrameInterpolation(
  anim: SpriteAnimation,
  size: number,
): FrameInterpolation {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  let at = 0;

  anim.frames.forEach((frameIndex, i) => {
    const hold = Math.max(1, anim.durations[i] ?? 400);
    inputRange.push(at, at + hold);
    outputRange.push(-frameIndex * size, -frameIndex * size);
    at += hold;
  });

  return { inputRange, outputRange, total: at };
}
