/**
 * The things in a Hood that nobody placed and nobody can tap.
 *
 * Sky, weather and light. None of it is interactive and none of it carries
 * state, but between them they are most of the difference between a backdrop
 * and a place — the scene had a parallax skyline and a flat colour field above
 * it, and the only thing moving in the top third of the display was a single
 * emoji cloud on a 96-second loop.
 *
 * ONE DRIVER FOR MANY PARTICLES
 *
 * Every particle here reads from a single looping Animated.Value rather than
 * owning one. Fourteen motes with fourteen loops is fourteen native animation
 * nodes doing the same arithmetic out of phase; instead each particle takes its
 * own window of one shared cycle and is transparent outside it. That also
 * solves the wrap problem for free — a particle that fades out before the value
 * resets never shows the jump.
 *
 * Everything is translateX/translateY/opacity, so it all stays on the native
 * driver and the JS thread does nothing per frame.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { SoftBlob } from './SoftBlob';


// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

function noise(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 0x9e3779b9, 2654435761)) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}

/** A value that loops 0 → 1 forever on the native driver. */
function useCycle(periodMs: number, enabled = true): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return undefined;
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: periodMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, periodMs, enabled]);

  return value;
}

// ---------------------------------------------------------------------------
// Clouds
// ---------------------------------------------------------------------------

/**
 * A cloud, drawn as stacked blocks.
 *
 * It used to be the ☁️ emoji, which is the one thing on screen rendered by the
 * system font — a smooth vector blob with a drop shadow floating over hand-
 * authored 32px pixel art. No amount of opacity made it belong.
 *
 * The row widths are a span table, the same way every other shape in this
 * project is authored, and the block size is quantised so the cloud sits on
 * the same pixel grid the sprites do.
 */
const CLOUD_ROWS: ReadonlyArray<readonly [start: number, width: number]> = [
  [3, 4],
  [1, 8],
  [0, 11],
  [1, 9],
];

function Cloud({ block, colour, opacity }: { block: number; colour: string; opacity: number }) {
  return (
    <View pointerEvents="none" style={{ opacity }}>
      {CLOUD_ROWS.map(([start, width], row) => (
        <View
          key={row}
          style={{
            marginLeft: start * block,
            width: width * block,
            height: block,
            backgroundColor: colour,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Clouds crossing the sky, at different heights and speeds.
 *
 * Three rather than one, because a single cloud on a long loop reads as the
 * same cloud coming round again — which it is. Different speeds also give the
 * sky its own internal parallax, on top of the layer parallax the scene already
 * applies when panning.
 */
export function Clouds({
  width,
  horizonY,
  seed,
  dark,
}: {
  width: number;
  horizonY: number;
  seed: number;
  dark: boolean;
}) {
  const specs = useMemo(
    () =>
      [0, 1, 2].map((i) => ({
        // Slower, higher clouds are further away, so they are also smaller and
        // fainter — the same depth cue the ground plane uses.
        block: 3 + Math.round(noise(seed, i * 13) * 3),
        top: horizonY * (0.12 + noise(seed, i * 29) * 0.42),
        periodMs: 70000 + Math.round(noise(seed, i * 41) * 90000),
        opacity: (dark ? 0.1 : 0.5) + noise(seed, i * 53) * 0.2,
      })),
    [seed, horizonY, dark],
  );

  return (
    <>
      {specs.map((spec, i) => (
        <DriftingCloud key={i} spec={spec} width={width} dark={dark} />
      ))}
    </>
  );
}

function DriftingCloud({
  spec,
  width,
  dark,
}: {
  spec: { block: number; top: number; periodMs: number; opacity: number };
  width: number;
  dark: boolean;
}) {
  const cycle = useCycle(spec.periodMs);
  const span = spec.block * 11;

  const translateX = cycle.interpolate({
    inputRange: [0, 1],
    outputRange: [-span - 20, width + span],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: spec.top, transform: [{ translateX }] }}
    >
      <Cloud block={spec.block} colour={dark ? '#C9D2F0' : '#FFFFFF'} opacity={spec.opacity} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

/**
 * A night sky.
 *
 * Most stars are static Views; only a handful twinkle. Animating all of them
 * would be forty native loops for an effect nobody can follow, and a sky where
 * everything pulses at once reads as a fault rather than as depth.
 *
 * Density falls off toward the horizon, which is both true of real skies —
 * atmosphere near the ground washes them out — and useful here, because it
 * keeps stars from crowding the skyline silhouette.
 */
export function StarField({
  width,
  horizonY,
  seed,
}: {
  width: number;
  horizonY: number;
  seed: number;
}) {
  const stars = useMemo(() => {
    const out: { x: number; y: number; size: number; opacity: number; twinkles: boolean }[] = [];
    for (let i = 0; i < 44; i++) {
      const vertical = noise(seed, i * 7 + 1);
      out.push({
        x: noise(seed, i * 7 + 2) * width,
        // Squared keeps them up high where the sky is darkest.
        y: vertical * vertical * horizonY * 0.9,
        size: noise(seed, i * 7 + 3) > 0.82 ? 2 : 1,
        opacity: 0.35 + noise(seed, i * 7 + 4) * 0.5,
        twinkles: i % 6 === 0,
      });
    }
    return out;
  }, [seed, width, horizonY]);

  const cycle = useCycle(4200);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: horizonY }}>
      {stars.map((star, i) =>
        star.twinkles ? (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: star.x,
              top: star.y,
              width: star.size,
              height: star.size,
              backgroundColor: '#FFFFFF',
              opacity: cycle.interpolate({
                // Phase-shifted per star so the twinklers do not pulse together.
                inputRange: [0, 0.5, 1],
                outputRange:
                  i % 12 === 0
                    ? [star.opacity, star.opacity * 0.25, star.opacity]
                    : [star.opacity * 0.3, star.opacity, star.opacity * 0.3],
              }),
            }}
          />
        ) : (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: star.x,
              top: star.y,
              width: star.size,
              height: star.size,
              backgroundColor: '#FFFFFF',
              opacity: star.opacity,
            }}
          />
        ),
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Motes
// ---------------------------------------------------------------------------

export type MoteStyle = 'dust' | 'petals' | 'embers' | 'none';

/**
 * What drifts through the air in each environment.
 *
 * This is set dressing in the same sense sceneDressing.ts is: it is most of
 * what distinguishes standing in a garden from standing in a car park, and it
 * costs nothing but a handful of coloured rectangles.
 */
export function moteStyleFor(envId: string | null | undefined, dark: boolean): MoteStyle {
  switch (envId) {
    case 'env_garden':
      return 'petals';
    case 'env_night_market':
      return 'embers';
    case 'env_alley':
    case 'env_rooftop':
    case 'env_laundromat':
      return 'dust';
    default:
      return dark ? 'none' : 'dust';
  }
}

const MOTE_LOOKS: Record<Exclude<MoteStyle, 'none'>, { colours: string[]; rise: boolean; size: number }> = {
  // Dust hangs and sinks slowly; you see it because it catches the light.
  dust: { colours: ['#FFF6E0', '#EADFC8'], rise: false, size: 2 },
  petals: { colours: ['#FFD9E8', '#F7C9DC', '#E9F2C9'], rise: false, size: 3 },
  // Embers go up. A night market with falling embers is a night market on fire.
  embers: { colours: ['#FFB25C', '#FF8A4C', '#FFD79A'], rise: true, size: 2 },
};

/**
 * Drifting particles across the whole scene.
 *
 * All of them share one 24-second cycle and each occupies its own window of it,
 * fading in and out at the window's edges. That buys independent-looking motion
 * from a single native value, and means a particle is never visible at the
 * moment the value wraps.
 */
export function Motes({
  style,
  width,
  height,
  seed,
  count = 14,
}: {
  style: MoteStyle;
  width: number;
  height: number;
  seed: number;
  count?: number;
}) {
  const cycle = useCycle(24000, style !== 'none');

  const motes = useMemo(() => {
    if (style === 'none') return [];
    const look = MOTE_LOOKS[style];
    return Array.from({ length: count }, (_, i) => {
      const start = noise(seed, i * 11 + 1);
      // Each mote is alive for between a third and two thirds of the cycle.
      const span = 0.3 + noise(seed, i * 11 + 2) * 0.35;
      return {
        start,
        end: Math.min(1, start + span),
        x: noise(seed, i * 11 + 3) * width,
        y: noise(seed, i * 11 + 4) * height,
        driftX: (noise(seed, i * 11 + 5) - 0.5) * width * 0.25,
        driftY: (look.rise ? -1 : 1) * (0.1 + noise(seed, i * 11 + 6)) * height * 0.3,
        colour: look.colours[i % look.colours.length]!,
        size: look.size,
        peak: 0.25 + noise(seed, i * 11 + 7) * 0.45,
      };
    });
  }, [style, width, height, seed, count]);

  if (style === 'none' || motes.length === 0) return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {motes.map((mote, i) => {
        // Clamped to the mote's own window; outside it the interpolation holds
        // at zero opacity and the particle is simply not there.
        const range = [0, mote.start, (mote.start + mote.end) / 2, mote.end, 1];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: mote.x,
              top: mote.y,
              width: mote.size,
              height: mote.size,
              borderRadius: mote.size / 2,
              backgroundColor: mote.colour,
              opacity: cycle.interpolate({
                inputRange: range,
                outputRange: [0, 0, mote.peak, 0, 0],
              }),
              transform: [
                {
                  translateX: cycle.interpolate({
                    inputRange: range,
                    outputRange: [0, 0, mote.driftX / 2, mote.driftX, mote.driftX],
                  }),
                },
                {
                  translateY: cycle.interpolate({
                    inputRange: range,
                    outputRange: [0, 0, mote.driftY / 2, mote.driftY, mote.driftY],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fireflies
// ---------------------------------------------------------------------------

/**
 * Slow wandering lights, after dark, outdoors.
 *
 * Distinct from motes because they behave differently: a mote drifts in a
 * straight line and fades, a firefly wanders and PULSES. The pulse is the whole
 * read — a steady dot at this size is a dead pixel.
 */
export function Fireflies({
  width,
  height,
  seed,
  count = 7,
}: {
  width: number;
  height: number;
  seed: number;
  count?: number;
}) {
  const cycle = useCycle(16000);

  const flies = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: noise(seed, i * 17 + 1) * width,
        y: height * (0.15 + noise(seed, i * 17 + 2) * 0.7),
        driftX: (noise(seed, i * 17 + 3) - 0.5) * 90,
        driftY: (noise(seed, i * 17 + 4) - 0.5) * 50,
        phase: noise(seed, i * 17 + 5),
      })),
    [width, height, seed, count],
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {flies.map((fly, i) => {
        // Each firefly blinks on its own offset within the shared cycle.
        const p = fly.phase;
        const blink = [0, p * 0.5, p * 0.5 + 0.08, p * 0.5 + 0.2, 0.55 + p * 0.4, 1];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: fly.x,
              top: fly.y,
              width: 3,
              height: 3,
              borderRadius: 2,
              backgroundColor: '#D8FF9B',
              opacity: cycle.interpolate({
                inputRange: blink,
                outputRange: [0, 0, 0.85, 0, 0.55, 0],
              }),
              transform: [
                {
                  translateX: cycle.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, fly.driftX, 0],
                  }),
                },
                {
                  translateY: cycle.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, fly.driftY, 0],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Light pools
// ---------------------------------------------------------------------------

/**
 * The glow a lit prop casts on the ground around it.
 *
 * Three concentric circles at falling opacity rather than a radial gradient:
 * this project ships no gradient library on purpose, and at these sizes the
 * banding is invisible against a dark ground. The flicker is a slow opacity
 * breath on the whole stack, which is enough to suggest a flame without
 * drawing one.
 */
export function LightPool({
  size,
  colour,
  spread,
  flicker,
  phase,
}: {
  size: number;
  colour: string;
  spread: number;
  flicker: number;
  phase: number;
}) {
  // Coprime-ish per prop so two lanterns never pulse together.
  const cycle = useCycle(2600 + (phase % 5) * 370, flicker > 0);
  const diameter = size * spread;

  const opacity = flicker
    ? cycle.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1 - flicker, 1, 1 - flicker],
      })
    : 1;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: -diameter * 0.1,
        alignSelf: 'center',
        width: diameter,
        height: diameter * 0.75,
        opacity,
      }}
    >
      {/* Three rings put an 8% step at the outer edge, which on a flat
          ground plane reads as a rim — and a pool of lamplight with a rim
          around it is a painted circle. Same light, spread over enough
          rings that no single edge is findable. */}
      <SoftBlob
        left={0}
        top={0}
        width={diameter}
        height={diameter * 0.75}
        colour={colour}
        peak={0.34}
        rings={8}
      />
    </Animated.View>
  );
}
