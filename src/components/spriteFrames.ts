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
 * Duplicate adjacent stops are safe: range lookup takes the first index whose
 * input is >= the value, so the degenerate zero-width segment is never selected
 * and never divided by.
 */
export function buildFrameInterpolation(
  anim: SpriteAnimation,
  size: number,
): FrameInterpolation {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  let at = 0;

  anim.frames.forEach((frameIndex, i) => {
    const hold = anim.durations[i] ?? 400;
    inputRange.push(at, at + hold);
    outputRange.push(-frameIndex * size, -frameIndex * size);
    at += hold;
  });

  return { inputRange, outputRange, total: at };
}
