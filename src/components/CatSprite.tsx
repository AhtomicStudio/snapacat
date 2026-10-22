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
import {
  Animated,
  Easing,
  PixelRatio,
  View,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';
import {
  ACT_ANIMATIONS,
  ACT_FRAME_COUNT,
  ACT_ROW_COUNT,
  ANIMATIONS,
  DIRECTIONS,
  DIR_ANIMATIONS,
  DIR_FRAME_COUNT,
  FRAME_COUNT,
  FRAME_SIZE,
  SOURCE_FRAME_SIZE,
  getActSpriteSheet,
  getDirSpriteSheet,
  getSpriteSheet,
  type ActAnimation,
  type SpriteAnimation,
  type SpriteDirection,
} from '../assets/sprites';
import { buildFrameInterpolation } from './spriteFrames';

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
 * `stagger` offsets the START TIME by a per-sprite amount, so sprites that free
 * run forever do not breathe in lockstep. It is deliberately NOT applied to
 * sprites whose animation is chosen by a scheduler — see below.
 */
function useFrameTranslate(
  anim: SpriteAnimation,
  size: number,
  paused: boolean,
  phase: number,
  stagger: boolean,
) {
  const t = useRef(new Animated.Value(0)).current;
  /** Whether this sprite has already paid its one-time stagger. */
  const staggered = useRef(false);

  const { inputRange, outputRange, total } = useMemo(
    () => buildFrameInterpolation(anim, size),
    [anim, size],
  );

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

    /**
     * The stagger is a MOUNT-time offset, and it must fire at most once.
     *
     * `total` is in this effect's deps because the interpolation depends on it,
     * so the effect re-runs whenever the animation changes. When nothing ever
     * changed a cat's animation that was harmless. Now that a scheduler swaps
     * flavour idles every couple of seconds, re-applying the delay held the
     * sprite on frame 0 for up to 519ms EVERY TIME — a cat sliding across the
     * ground with its legs frozen mid-stride, and a groom cut off before the
     * head came back up, which quietly broke the "every idle starts and ends
     * at rest" invariant the whole flavour-idle design rests on.
     */
    if (!stagger || staggered.current) {
      loop.start();
      return () => loop.stop();
    }
    staggered.current = true;

    // Spread across the whole cycle, not a fixed 400ms window — at six perches
    // a 400ms spread put slots 0 and 5 within four display frames of each
    // other, which still reads as simultaneous.
    const delay = (phase * 173) % total;
    const timer = setTimeout(() => loop.start(), delay);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [t, total, paused, phase, stagger]);

  return useMemo(
    () => t.interpolate({ inputRange, outputRange, extrapolate: 'clamp' }),
    [t, inputRange, outputRange],
  );
}

/**
 * Renders one frame of a sprite sheet, animated.
 *
 * Sheets come in two shapes. The whole-frame and action sheets are a single row
 * of frames; the directional sheet is a grid, eight rows of eight compass
 * facings. Both are handled the same way — size a clipping View to one frame
 * and translate the full sheet behind it — with the row selected by a static
 * translateY alongside the animated translateX.
 *
 * The row offset is deliberately NOT animated. A cat changes facing a handful
 * of times a minute and never mid-frame, so paying for a second native value
 * (and the interpolation to drive it) would buy nothing. Mixing a plain number
 * into a transform array beside an Animated value is supported and stays on the
 * native driver, because only the animated member needs lifting.
 */
function SheetSprite({
  source,
  anim,
  frameCount,
  rowCount = 1,
  row = 0,
  size,
  paused,
  phase,
  stagger = true,
  style,
}: {
  source: ImageSourcePropType;
  anim: SpriteAnimation;
  frameCount: number;
  rowCount?: number;
  row?: number;
  size: number;
  paused: boolean;
  phase: number;
  /** False when something else already decides when this sprite starts. */
  stagger?: boolean;
  style?: ViewStyle;
}) {
  const snapped = useMemo(() => snapSize(size), [size]);
  const translateX = useFrameTranslate(anim, snapped, paused, phase, stagger);

  return (
    <View style={[{ width: snapped, height: snapped, overflow: 'hidden' }, style]}>
      <Animated.Image
        source={source}
        style={{
          width: snapped * frameCount,
          height: snapped * rowCount,
          transform: [{ translateX }, { translateY: -row * snapped }],
        }}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );
}

function CatSpriteInner({
  spriteId,
  size = SOURCE_FRAME_SIZE,
  animation = 'idle',
  paused = false,
  phase = 0,
  style,
}: CatSpriteProps) {
  return (
    <SheetSprite
      source={getSpriteSheet(spriteId)}
      anim={ANIMATIONS[animation]}
      frameCount={FRAME_COUNT}
      size={size}
      paused={paused}
      phase={phase}
      style={style}
    />
  );
}

/**
 * Memoised because the Hood re-renders on unrelated state — opening the Shop,
 * toggling night, placing an item — and every one of those otherwise walked
 * all six sprites. Props are fully stable now that the loop lives natively.
 */
export const CatSprite = React.memo(CatSpriteInner);

// ---------------------------------------------------------------------------
// Scene sprites
// ---------------------------------------------------------------------------

export interface SceneCatSpriteProps {
  spriteId: string;
  size?: number;
  /** Stagger seed — normally the perch index. See CatSpriteProps.phase. */
  phase?: number;
  style?: ViewStyle;
}

/**
 * A settled cat: front-facing, and capable of the whole flavour-idle
 * repertoire.
 *
 * Reads the action sheet, which is one row rather than eight. That is what lets
 * a cat blink, groom, yawn, glance around and flick its tail for roughly a
 * megabyte and a half per breed — the same six animations on the directional
 * sheet would cost eight times that, and a settled cat has no use for seven of
 * those directions.
 */
export const SettledCatSprite = React.memo(function SettledCatSprite({
  spriteId,
  animation,
  size = SOURCE_FRAME_SIZE,
  phase = 0,
  paused = false,
  style,
}: SceneCatSpriteProps & { animation: ActAnimation; paused?: boolean }) {
  return (
    // The action sheet is wrapped into bands so the texture stays well
    // inside what every device can hold. No animation straddles two, so
    // the band is a static offset and only the column is animated.
    <SheetSprite
      source={getActSpriteSheet(spriteId)}
      anim={ACT_ANIMATIONS[animation]}
      frameCount={ACT_FRAME_COUNT}
      rowCount={ACT_ROW_COUNT}
      row={ACT_ANIMATIONS[animation].row ?? 0}
      size={size}
      paused={paused}
      phase={phase}
      /**
       * No stagger. useCatLife holds each flavour idle for exactly its own
       * cycle length and then picks the next one, so the art has to run in
       * phase with that scheduler — any offset here truncates the tail of
       * every animation and leaves the cat mid-groom when it switches. Cats
       * are already desynchronised from each other by their scheduler start
       * offsets and by choosing different idles.
       */
      stagger={false}
      style={style}
    />
  );
});

/**
 * A cat on the move: any of eight facings, walking, idling or dozing.
 *
 * Reads the directional sheet. Kept separate from SettledCatSprite rather than
 * merged behind a flag because the two draw from different textures, and which
 * texture a cat holds open is the single biggest memory decision in the scene.
 * Making it a prop would hide that; making it a component makes it obvious at
 * every call site.
 */
export const WalkingCatSprite = React.memo(function WalkingCatSprite({
  spriteId,
  direction,
  animation,
  size = SOURCE_FRAME_SIZE,
  phase = 0,
  style,
}: SceneCatSpriteProps & {
  direction: SpriteDirection;
  animation: keyof typeof DIR_ANIMATIONS;
}) {
  const row = Math.max(0, DIRECTIONS.indexOf(direction));

  return (
    <SheetSprite
      source={getDirSpriteSheet(spriteId)}
      anim={DIR_ANIMATIONS[animation]}
      frameCount={DIR_FRAME_COUNT}
      rowCount={DIRECTIONS.length}
      row={row}
      size={size}
      paused={false}
      phase={phase}
      // A walk has to begin the instant the cat does. Holding frame 0 while
      // the body translates is the single most obvious animation fault there
      // is — the legs plant and the cat skates.
      stagger={false}
      style={style}
    />
  );
});
