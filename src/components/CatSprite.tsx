/**
 * Renders one animated cat from a generated sprite sheet.
 *
 * Sheets are a horizontal strip of frames; we show a single frame by sizing a
 * clipping View to one frame and translating the full-width Image behind it.
 *
 * Frames are shipped pre-scaled 4x (128px each). That is deliberate: a ~44pt
 * sprite on a 3x-density phone is ~132 physical pixels, so the shipped art
 * lands almost 1:1 and the renderer barely resamples it. Displaying much
 * smaller than 44pt will soften the pixels, because React Native's <Image>
 * filters bilinearly on Android with no way to request nearest-neighbour.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Image, type ViewStyle } from 'react-native';
import {
  ANIMATIONS,
  FRAME_COUNT,
  FRAME_SIZE,
  getSpriteSheet,
  type SpriteAnimation,
} from '../assets/sprites';

export interface CatSpriteProps {
  /** Sprite template id, e.g. "brown_mackerel_tabby". */
  spriteId: string;
  /** Rendered edge length in points. Defaults to the sheet's native 44pt. */
  size?: number;
  /** Which loop to play. */
  animation?: keyof typeof ANIMATIONS;
  /** Pause on the first frame — useful for list rows and static portraits. */
  paused?: boolean;
  style?: ViewStyle;
}

/**
 * Advances through an animation's frames using its per-frame durations.
 * Asymmetric timings are what carry the ease, so a single interval won't do.
 */
function useFrameLoop(anim: SpriteAnimation, paused: boolean): number {
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused) {
      setStep(0);
      return;
    }
    const hold = anim.durations[step % anim.durations.length] ?? 400;
    timer.current = setTimeout(() => setStep((s) => (s + 1) % anim.frames.length), hold);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step, paused, anim]);

  return paused ? 0 : step;
}

export function CatSprite({
  spriteId,
  size = FRAME_SIZE / 4,
  animation = 'idle',
  paused = false,
  style,
}: CatSpriteProps) {
  const anim = ANIMATIONS[animation];
  const step = useFrameLoop(anim, paused);
  const frame = anim.frames[step % anim.frames.length] ?? anim.frames[0]!;
  const scale = size / FRAME_SIZE;

  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <Image
        source={getSpriteSheet(spriteId)}
        style={{
          width: FRAME_SIZE * FRAME_COUNT * scale,
          height: size,
          transform: [{ translateX: -frame * size }],
        }}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );
}
