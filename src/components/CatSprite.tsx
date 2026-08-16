/**
 * Renders one animated cat from a generated sprite sheet.
 *
 * Sheets are a horizontal strip of frames; we show a single frame by sizing a
 * clipping View to one frame and translating the full-width Image behind it.
 *
 * The frame loop runs entirely on the native driver — one JS call at mount and
 * none afterwards. A setState-per-frame loop costs ~19 unbatched React commits
 * a second at six sprites, keeps running while a full-screen modal covers the
 * Hood, and stutters whenever the JS thread is busy. Interpolating a single
 * Animated.Value into translateX has none of those properties and lets the
 * 6-sprite cap rise for free.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PixelRatio, View, type ViewStyle } from 'react-native';
import {
  ANIMATIONS,
  FRAME_COUNT,
  FRAME_SIZE,
  SOURCE_FRAME_SIZE,
  getSpriteSheet,
  type SpriteAnimation,
} from '../assets/sprites';

export interface CatSpriteProps {
  /** Sprite template id, e.g. "brown_mackerel_tabby". */
  spriteId: string;
  /**
   * Desired edge length in points. Snapped so each source pixel maps to a whole
   * number of device pixels — see snapSize.
   */
  size?: number;
  /** Which loop to play. */
  animation?: keyof typeof ANIMATIONS;
  /** Pause on the first frame — useful for list rows and static portraits. */
  paused?: boolean;
  /**
   * Stagger seed, normally the perch index. Sprites that mount in the same
   * commit otherwise breathe in perfect unison, which reads as one organism
   * rather than several cats — especially when a small Cat-a-log puts the same
   * breed on every perch.
   */
  phase?: number;
  style?: ViewStyle;
}

/**
 * Rounds a requested size so one source pixel covers a whole number of device
 * pixels.
 *
 * The art is 32x32 upscaled 4x into the sheet. What governs sharpness is
 * device-pixels-per-SOURCE-pixel: at 44pt on a 3x screen that is 132/32 =
 * 4.125, so four of the 32 columns render a pixel wider than the rest and
 * React Native's bilinear filtering — which has no nearest-neighbour option on
 * Android — smears the seams. Snapping to a whole number of device pixels per
 * source pixel puts every sample point well inside its source texel, which
 * makes bilinear degenerate to exact nearest-neighbour.
 */
export function snapSize(desiredDp: number): number {
  const density = PixelRatio.get();
  const blocks = Math.max(2, Math.round((desiredDp * density) / SOURCE_FRAME_SIZE));
  return (blocks * SOURCE_FRAME_SIZE) / density;
}

/**
 * Drives frame selection from a single native-driven value.
 *
 * Each frame contributes a flat segment to the interpolation, with a 1ms step
 * between segments so frames cut rather than slide.
 */
function useFrameTranslate(anim: SpriteAnimation, size: number, paused: boolean, phase: number) {
  const t = useRef(new Animated.Value(0)).current;

  const { inputRange, outputRange, total } = useMemo(() => {
    const input: number[] = [];
    const output: number[] = [];
    let at = 0;
    anim.frames.forEach((frameIndex, i) => {
      const hold = Math.max(2, anim.durations[i] ?? 400);
      input.push(at, at + hold - 1);
      output.push(-frameIndex * size, -frameIndex * size);
      at += hold;
    });
    return { inputRange: input, outputRange: output, total: at };
  }, [anim, size]);

  useEffect(() => {
    t.setValue(0);
    if (paused) return;

    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: total,
        duration: total,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Offsetting the start time rather than the start value keeps every cycle
    // complete; seeding the value instead would clip the frames before it.
    const delay = (phase * 173) % 400;
    const timer = setTimeout(() => loop.start(), delay);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [t, total, paused, phase]);

  return t.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

function CatSpriteInner({
  spriteId,
  size = SOURCE_FRAME_SIZE,
  animation = 'idle',
  paused = false,
  phase = 0,
  style,
}: CatSpriteProps) {
  const snapped = useMemo(() => snapSize(size), [size]);
  const anim = ANIMATIONS[animation];
  const translateX = useFrameTranslate(anim, snapped, paused, phase);

  return (
    <View style={[{ width: snapped, height: snapped, overflow: 'hidden' }, style]}>
      <Animated.Image
        source={getSpriteSheet(spriteId)}
        style={{
          width: snapped * FRAME_COUNT,
          height: snapped,
          transform: [{ translateX }],
        }}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );
}

/**
 * Memoised because the Hood re-renders on unrelated state — opening the Shop,
 * toggling night, placing an item — and every one of those otherwise walked
 * all six sprites. Props are fully stable now that the loop lives natively.
 */
export const CatSprite = React.memo(CatSpriteInner);

// FRAME_SIZE is the shipped (4x) frame; exported for callers that need to
// reason about the sheet rather than the display size.
export { FRAME_SIZE };
