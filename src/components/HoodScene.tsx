/**
 * The Hood scene — a pannable, full-bleed 2.5D stage.
 *
 * This replaces the old 260px HoodCanvas strip. The change is not cosmetic:
 * when the scene is a preview window with cards stacked under it, the app is a
 * config screen with a picture on it. When the scene fills the display and the
 * controls retreat into a sheet, the scene is the app.
 *
 * THE WORLD IS WIDER THAN THE WINDOW
 *
 * Everything lives on a world WORLD_WIDTHS screens across, and the player drags
 * to look around. One screen felt cramped — six cats and a dozen goodies packed
 * shoulder to shoulder with no lateral room on the perspective plane. Widening
 * the world buys space without shrinking anything, and gives dragging a payoff.
 *
 * Layers, back to front, and how fast each one tracks the camera:
 *
 *   sky        static   banded gradient standing in for a real gradient
 *   moon/cloud  0.20×   near-fixed, the way distant things behave
 *   skyline     0.55×   seeded silhouette; the parallax against the ground is
 *                       what actually sells depth while panning
 *   ground      1.00×   the plane, its actors, and everything you can touch
 *   wash       static   a single tint tying the palette together
 *
 * ONE ART MEDIUM
 *
 * Props are pixel art from scripts/sprites/props.js, drawn to the same 32×32
 * frame and keyline conventions as the cats. They used to be system emoji,
 * which no amount of layout could make sit with a hand-authored sprite.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Text, View, type ViewStyle } from 'react-native';
import { SettledCatSprite, WalkingCatSprite } from './CatSprite';
import { useCatLife } from '../hooks/useCatLife';
import { Touchable } from './Touchable';
import { PLACEABLE_ITEMS, MAX_HOOD_CATS } from '../utils/spawnCalculator';
import { getPropSheet } from '../assets/props';
import {
  HORIZON,
  WORLD_WIDTHS,
  hashSeed,
  layoutScene,
  paintOrder,
  type CatPlacement,
  type ItemPlacement,
} from '../config/scene';
import { skyPalette, isDark, type TimeOfDay } from '../utils/timeOfDay';
import { getDressing, type SceneDressing } from '../config/sceneDressing';
import { propLight, propMotion } from '../config/propMotion';
import { Clouds, Fireflies, LightPool, Motes, StarField, moteStyleFor } from './SceneAmbience';

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

/**
 * Nominal sprite edge length at the near edge of the plane, before depth
 * scaling. The old canvas drew every cat at 44px; at that size on a full screen
 * they read as stickers.
 *
 * Props use the SAME nominal size, because they are authored at true relative
 * scale inside their own 32×32 frame — a kibble bowl occupies about 13 of those
 * 32 pixels. That means the size relationship between a cat and a bowl comes
 * out of the art rather than out of a per-item fudge factor here.
 */
const ACTOR_BASE_SIZE = 104;

/** How fast each parallax layer tracks the camera. 1 = locked to the ground. */
const PARALLAX_SKY = 0.20;
/** The distant row — slower, so it slides behind the nearer one as you pan. */
const PARALLAX_FAR = 0.38;
const PARALLAX_BACKDROP = 0.55;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Linear blend between two hex colours. Used to fake a gradient in bands. */
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${to2(ar + (br - ar) * t)}${to2(ag + (bg - ag) * t)}${to2(ab + (bb - ab) * t)}`;
}

/**
 * Bands used to approximate the sky gradient.
 *
 * Twelve left visible steps across a 400pt sky — about 33pt per band, which is
 * wide enough to read as stripes rather than as a gradient, and it was the
 * single most amateur thing on the screen. Thirty-two puts each step at a
 * value difference the eye cannot resolve against this palette.
 */
const SKY_BANDS = 32;

/**
 * How much a distant layer is washed toward the sky behind it.
 *
 * Atmospheric perspective: air between you and a thing desaturates it and
 * pulls it toward the sky's colour, and its absence is why the skyline read as
 * a sticker laid on top rather than as something a mile away. The backdrop is
 * pushed a third of the way to the horizon colour, the mid layer a tenth.
 */
const HAZE_FAR = 0.34;
const HAZE_MID = 0.12;

// ---------------------------------------------------------------------------
// Backdrop — seeded silhouette at the horizon
// ---------------------------------------------------------------------------

interface BuildingSpec {
  left: number;
  width: number;
  height: number;
  windows: number;
  /** What sits on top. A flat row of rectangles is what reads as a placeholder. */
  roof: 'flat' | 'parapet' | 'pitched' | 'stepped';
  /** Rooftop furniture — the thing that makes a skyline look drawn rather than generated. */
  tower: boolean;
  antenna: boolean;
  vents: number;
}

/**
 * Derives a skyline from the Hood id.
 *
 * Deterministic so a Hood always has the same skyline — the backdrop is part of
 * what makes "Back Alley" feel like a specific place rather than a template.
 */
function buildSkyline(seed: number): BuildingSpec[] {
  const specs: BuildingSpec[] = [];
  let cursor = -0.03;
  let i = 0;
  // The world is wide, so the skyline has to run the whole way across it.
  while (cursor < 1.02 && i < 40) {
    const r1 = ((seed ^ Math.imul(i + 1, 0x27d4eb2d)) >>> 8) / 0xffffff;
    const r2 = ((seed ^ Math.imul(i + 7, 0x165667b1)) >>> 8) / 0xffffff;
    const width = 0.035 + r1 * 0.055;
    // Buildings have to clear the mid-ground wall or the whole skyline hides
    // behind it — which is exactly what happened at 26–110px against a 74px
    // wall: one tall block poked out and the rest of the sky read as empty.
    const height = 96 + r2 * 150;
    const r3 = ((seed ^ Math.imul(i + 13, 0x9e3779b1)) >>> 8) / 0xffffff;
    const r4 = ((seed ^ Math.imul(i + 23, 0xc2b2ae35)) >>> 8) / 0xffffff;

    /**
     * Roof shape and furniture.
     *
     * A row of plain rectangles reads as a placeholder no matter how well the
     * heights are randomised, because every silhouette meets the sky at the
     * same angle. What a real skyline has is variety at the TOP edge — that is
     * the only part of a distant building you actually see — so the shape and
     * what stands on it are rolled per building, and weighted so that plain
     * flat roofs stay the majority and the water towers stay rare enough to
     * be worth noticing.
     */
    const roof: BuildingSpec['roof'] =
      r3 < 0.52 ? 'flat' : r3 < 0.74 ? 'parapet' : r3 < 0.89 ? 'stepped' : 'pitched';

    specs.push({
      left: cursor,
      width,
      height,
      windows: 3 + Math.floor(r1 * 8),
      roof,
      tower: r4 > 0.82 && roof !== 'pitched',
      antenna: r4 < 0.2,
      vents: r3 > 0.6 ? 1 + Math.floor(r4 * 2) : 0,
    });
    // Overlap slightly so the roofline reads as a continuous block, not a fence.
    cursor += width - 0.005;
    i++;
  }
  return specs;
}

function Backdrop({
  seed,
  width,
  horizonY,
  colour,
  lit,
}: {
  seed: number;
  width: number;
  horizonY: number;
  colour: string;
  lit: boolean;
}) {
  const skyline = useMemo(() => buildSkyline(seed), [seed]);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, width, top: 0, height: horizonY }}
    >
      {skyline.map((b, i) => {
        const bw = b.width * width;
        return (
        <React.Fragment key={i}>
          {/* ── Roof furniture, drawn behind the block so it rises out of it ── */}
          {b.tower && (
            // Water tower: a barrel on legs. The most recognisable rooftop
            // silhouette there is, and the reason an American skyline reads as
            // one at a glance.
            <View style={{ position: 'absolute', left: b.left * width + bw * 0.42, bottom: b.height - 2, alignItems: 'center' }}>
              <View style={{ width: 14, height: 11, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: colour }} />
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <View style={{ width: 2, height: 7, backgroundColor: colour }} />
                <View style={{ width: 2, height: 7, backgroundColor: colour }} />
              </View>
            </View>
          )}
          {b.antenna && (
            <View style={{ position: 'absolute', left: b.left * width + bw * 0.7, bottom: b.height - 1, width: 2, height: 16, backgroundColor: colour }} />
          )}
          {Array.from({ length: b.vents }, (_, v) => (
            <View
              key={`v${v}`}
              style={{
                position: 'absolute',
                left: b.left * width + bw * (0.12 + v * 0.3),
                bottom: b.height - 1,
                width: 7, height: 5, backgroundColor: colour,
              }}
            />
          ))}
          {b.roof === 'pitched' && (
            // Faked with a rotated square: a true triangle needs borderWidth
            // tricks that fight the parallax transform on the parent.
            <View
              style={{
                position: 'absolute',
                left: b.left * width + bw / 2 - bw * 0.3,
                bottom: b.height - bw * 0.21,
                width: bw * 0.6, height: bw * 0.6,
                backgroundColor: colour,
                transform: [{ rotate: '45deg' }],
              }}
            />
          )}

        <View
          style={{
            position: 'absolute',
            left: b.left * width,
            width: bw,
            height: b.height,
            bottom: 0,
            backgroundColor: colour,
            borderTopLeftRadius: b.roof === 'stepped' ? 3 : 0,
            borderTopRightRadius: b.roof === 'stepped' ? 3 : 0,
          }}
        >
          {b.roof === 'parapet' && (
            // A lip along the roofline, slightly proud of the block. Catches
            // the eye as a built edge rather than a cut.
            <View style={{ position: 'absolute', top: -3, left: -2, right: -2, height: 4, backgroundColor: colour }} />
          )}
          {lit && (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                paddingTop: 9,
                paddingHorizontal: 5,
                gap: 4,
              }}
            >
              {Array.from({ length: b.windows }, (_, w) => (
                <View
                  key={w}
                  style={{
                    width: 4,
                    height: 5,
                    backgroundColor: '#FFD98A',
                    // Uneven so the block doesn't look like a switchboard.
                    opacity: (seed + i * 5 + w * 3) % 5 === 0 ? 0.15 : 0.7,
                  }}
                />
              ))}
            </View>
          )}
        </View>
        </React.Fragment>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Mid-ground wall
// ---------------------------------------------------------------------------

/**
 * The wall the Hood backs onto.
 *
 * Without it the ground plane runs straight into a distant skyline and the
 * scene has no middle — everything is either at your feet or on the horizon.
 * A wall gives the plane something to end against, and its pattern is most of
 * what distinguishes a back alley from a garden.
 *
 * Sits inside the 1× scroll layer so it pans with the ground, which is what
 * puts it in front of the 0.55× skyline.
 */
function MidWall({
  dressing,
  width,
  topY,
  dark,
}: {
  dressing: SceneDressing;
  width: number;
  topY: number;
  dark: boolean;
}) {
  const { wall, seam, wallStyle, wallHeight } = dressing;
  if (wallStyle === 'none' || wallHeight <= 0) return null;

  const top = topY - wallHeight;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        width,
        top,
        height: wallHeight,
        backgroundColor: wall,
        overflow: 'hidden',
      }}
    >
      {wallStyle === 'brick' &&
        // Courses offset by half a brick on alternate rows. At this size the
        // mortar lines are the whole read — the individual bricks are not.
        Array.from({ length: Math.ceil(wallHeight / 12) }, (_, row) => (
          <View key={row} style={{ position: 'absolute', left: 0, right: 0, top: row * 12 }}>
            <View style={{ height: 1.5, backgroundColor: seam, opacity: 0.85 }} />
            {Array.from({ length: Math.ceil(width / 26) + 1 }, (_, col) => {
              /**
               * Shade the odd brick darker or lighter.
               *
               * Uniform brick is the giveaway: a real wall is laid from bricks
               * that were fired in different batches, and the eye reads that
               * variation long before it reads the mortar pattern. One in
               * three or so gets a tint, deterministically, so a Hood keeps
               * the same wall every visit.
               */
              const n = (row * 31 + col * 17) % 9;
              const tint = n === 0 ? '#000000' : n === 4 ? '#FFFFFF' : null;
              return (
                <React.Fragment key={col}>
                  {tint && (
                    <View
                      style={{
                        position: 'absolute',
                        left: col * 26 + (row % 2 ? 13 : 0) + 1.5,
                        top: 1.5,
                        width: 24.5,
                        height: 10,
                        backgroundColor: tint,
                        opacity: tint === '#000000' ? 0.07 : 0.05,
                      }}
                    />
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      left: col * 26 + (row % 2 ? 13 : 0),
                      top: 1,
                      width: 1.5,
                      height: 11,
                      backgroundColor: seam,
                      opacity: 0.7,
                    }}
                  />
                </React.Fragment>
              );
            })}
          </View>
        ))}

      {wallStyle === 'planks' &&
        Array.from({ length: Math.ceil(width / 22) + 1 }, (_, col) => (
          <View
            key={col}
            style={{
              position: 'absolute',
              left: col * 22,
              top: 0,
              width: 1.5,
              height: wallHeight,
              backgroundColor: seam,
              opacity: 0.7,
            }}
          />
        ))}

      {wallStyle === 'tile' &&
        Array.from({ length: Math.ceil(wallHeight / 20) }, (_, row) => (
          <View key={row} style={{ position: 'absolute', left: 0, right: 0, top: row * 20 }}>
            <View style={{ height: 1.5, backgroundColor: seam, opacity: 0.6 }} />
            {Array.from({ length: Math.ceil(width / 20) + 1 }, (_, col) => (
              <View
                key={col}
                style={{
                  position: 'absolute',
                  left: col * 20,
                  top: 1,
                  width: 1.5,
                  height: 19,
                  backgroundColor: seam,
                  opacity: 0.5,
                }}
              />
            ))}
          </View>
        ))}

      {wallStyle === 'concrete' && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 2, backgroundColor: seam, opacity: 0.5 }} />
      )}

      {wallStyle === 'hedge' &&
        // Lumpy top edge, drawn as overlapping discs, so a hedge doesn't read
        // as a painted fence.
        Array.from({ length: Math.ceil(width / 18) + 1 }, (_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: i * 18 - 6,
              top: -8 + (i % 3) * 3,
              width: 24,
              height: 22,
              borderRadius: 12,
              backgroundColor: wall,
            }}
          />
        ))}

      {/* Coping along the top and a grimy band at the base — the two cues that
          make a flat rectangle read as a built surface. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 4,
          backgroundColor: seam,
          opacity: 0.9,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 10,
          backgroundColor: dark ? '#000000' : '#2C2A29',
          opacity: 0.16,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Ground dressing
// ---------------------------------------------------------------------------

/**
 * Scatter across the plane — tufts, grit, a stray leaf.
 *
 * A flat colour field with three opacity bands over it reads as a placeholder,
 * and the hard edges of those bands read as a bug. Deterministic scatter costs
 * nothing and is the difference between "a green rectangle" and "ground".
 */
function GroundDressing({
  seed,
  width,
  height,
  tint,
  dark,
}: {
  seed: number;
  width: number;
  height: number;
  tint: string;
  dark: boolean;
}) {
  const bits = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; o: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const r1 = ((seed ^ Math.imul(i + 3, 0x9e3779b1)) >>> 8) / 0xffffff;
      const r2 = ((seed ^ Math.imul(i + 11, 0x85ebca6b)) >>> 8) / 0xffffff;
      const r3 = ((seed ^ Math.imul(i + 23, 0xc2b2ae35)) >>> 8) / 0xffffff;
      // Denser toward the viewer, matching how detail resolves with distance.
      const d = r2 * r2;
      out.push({
        x: r1 * width,
        y: d * height,
        w: 2 + Math.round(r3 * 5 * (0.4 + d)),
        h: 2 + Math.round(r3 * 2),
        o: 0.05 + r3 * 0.12,
      });
    }
    return out;
  }, [seed, width, height]);

  /**
   * Broad tonal patches, under the grit.
   *
   * Fine speckle alone cannot fix a large flat colour field — it adds detail at
   * one frequency and leaves the low frequency untouched, so the ground still
   * reads as one slab with dust on it. Real asphalt varies in big soft areas:
   * where it was patched, where it stays wet, where the sun has bleached it.
   * These are deliberately huge and nearly invisible individually; what they
   * do is stop any two parts of the ground being the same colour.
   */
  const patches = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; o: number; light: boolean }[] = [];
    for (let i = 0; i < 16; i++) {
      const r1 = ((seed ^ Math.imul(i + 31, 0x2545f491)) >>> 8) / 0xffffff;
      const r2 = ((seed ^ Math.imul(i + 47, 0x9e3779b9)) >>> 8) / 0xffffff;
      const r3 = ((seed ^ Math.imul(i + 59, 0x7feb352d)) >>> 8) / 0xffffff;
      /**
       * Very large and very faint, and that combination is the whole point.
       *
       * The first attempt used patches about a fifth of the world wide at 2-7%
       * opacity, which rendered as a field of distinct grey discs — worse than
       * the flat colour it replaced, because a visible hard-edged circle is a
       * shape the eye names. There is no blur available without a dependency,
       * so the edge has to be hidden by scale instead: at a third to four
       * fifths of the world across, most of each patch's boundary is off the
       * viewport at any pan position, and what remains is a gradient too
       * gradual to resolve.
       */
      const w = width * (0.34 + r3 * 0.46);
      out.push({
        x: r1 * width - w / 2,
        y: r2 * height - height * 0.25,
        w,
        h: height * (0.55 + r3 * 0.5),
        o: 0.012 + r3 * 0.022,
        light: r1 > 0.5,
      });
    }
    return out;
  }, [seed, width, height]);

  /**
   * Seams and cracks. Thin, long, mostly horizontal — asphalt joints run with
   * the road, and a crack is the one piece of ground detail the eye reads as
   * surface rather than as dirt.
   */
  const seams = useMemo(() => {
    const out: { x: number; y: number; w: number; tilt: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const r1 = ((seed ^ Math.imul(i + 71, 0x85ebca77)) >>> 8) / 0xffffff;
      const r2 = ((seed ^ Math.imul(i + 83, 0xc2b2ae3d)) >>> 8) / 0xffffff;
      out.push({
        x: r1 * width,
        y: 0.18 * height + r2 * height * 0.72,
        w: width * (0.06 + r2 * 0.14),
        tilt: `${(r1 - 0.5) * 7}deg`,
      });
    }
    return out;
  }, [seed, width, height]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      {/* Low frequency first, so grit and cracks sit on top of the mottling. */}
      {patches.map((p, i) => (
        <View
          key={`p${i}`}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            borderRadius: p.w / 2,
            backgroundColor: p.light ? '#FFFFFF' : '#000000',
            opacity: dark ? p.o * 0.65 : p.o,
          }}
        />
      ))}
      {seams.map((s, i) => (
        <View
          key={`s${i}`}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.w,
            height: 1.5,
            backgroundColor: '#000000',
            opacity: dark ? 0.10 : 0.13,
            transform: [{ rotate: s.tilt }],
          }}
        />
      ))}
      {bits.map((b, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            borderRadius: 1,
            backgroundColor: tint,
            opacity: dark ? b.o * 0.7 : b.o,
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contact shadow
// ---------------------------------------------------------------------------

/**
 * A soft ellipse where a sprite meets the ground.
 *
 * Does more work than it looks like: without it, a depth-scaled sprite reads as
 * floating at an arbitrary size rather than standing further away. It is the
 * cheapest possible grounding cue and the one the old canvas was missing.
 */
function ContactShadow({ size, dark }: { size: number; dark: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: size * 0.06,
        alignSelf: 'center',
        width: size * 0.5,
        height: size * 0.11,
        borderRadius: size * 0.25,
        backgroundColor: dark ? 'rgba(6,8,20,0.38)' : 'rgba(48,40,30,0.17)',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

/**
 * One visiting cat, with a life of its own.
 *
 * The actor box is positioned from the scene's static placement and then
 * translated by whatever useCatLife is doing, so the layout stays pure and the
 * wandering is a presentation concern laid over it. That separation is worth
 * keeping: layoutScene remains testable without a clock, and a cat that walks
 * off somewhere unexpected is a bug in exactly one module.
 */
function SceneCat({
  placement,
  spriteId,
  size,
  left,
  top,
  dark,
  asleep,
  seed,
  worldWidth,
  sceneHeight,
  alive,
  onPress,
}: {
  placement: CatPlacement;
  spriteId?: string;
  size: number;
  left: number;
  top: number;
  dark: boolean;
  asleep: boolean;
  seed: number;
  worldWidth: number;
  sceneHeight: number;
  /** Friend Hoods and unmeasured scenes hold still. */
  alive: boolean;
  onPress: () => void;
}) {
  const { activity, transform, depth } = useCatLife({
    seed,
    slot: placement.slot,
    baseDepth: placement.z,
    worldWidth,
    sceneHeight,
    asleep,
    enabled: alive,
  });

  return (
    /**
     * Two boxes, because two different things want to transform this cat.
     *
     * The outer one carries the drift, natively driven. The inner one carries
     * the press feedback. Putting both on one box means whichever writes
     * `transform` last wins — and since the press style is applied on top, a
     * tap would snap a walking cat back to its starting spot for as long as
     * the finger was down.
     */
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        zIndex: Math.round(depth * 1000),
        transform,
      }}
    >
      <Touchable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="A visiting cat"
        // Scales UP, not down. The whole actor including its shadow, so the
        // press reads as the cat reacting rather than the sprite detaching
        // from the ground — and up rather than in, because a cat you poke
        // should perk toward you, not shrink away.
        scaleTo={1.07}
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <ContactShadow size={size} dark={dark} />
        {spriteId ? (
          activity.kind === 'walking' ? (
            <WalkingCatSprite
              spriteId={spriteId}
              size={size}
              direction={activity.direction}
              animation={activity.animation}
              phase={placement.slot}
            />
          ) : (
            <SettledCatSprite
              spriteId={spriteId}
              size={size}
              animation={activity.animation}
              phase={placement.slot}
            />
          )
        ) : (
          <Text style={{ fontSize: size * 0.78, textAlign: 'center' }}>🐱</Text>
        )}
        {asleep && (
          <Text
            style={{
              position: 'absolute',
              top: -size * 0.02,
              right: -size * 0.02,
              fontSize: size * 0.2,
              opacity: 0.9,
            }}
          >
            💤
          </Text>
        )}
      </Touchable>
    </Animated.View>
  );
}

/**
 * Idle motion for a goodie that is meant to move — a chime swaying, a laser
 * dot hovering.
 *
 * Returns a transform array rather than wrapping the prop, so the caller keeps
 * control of where the prop sits and this only ever contributes movement.
 * `still` props get an empty array and no animation is started at all, which
 * matters because most of the twenty-five are still.
 */
function usePropDrift(itemId: string, phase: number) {
  const motion = useMemo(() => propMotion(itemId), [itemId]);
  const t = useRef(new Animated.Value(0)).current;
  const animated = motion.kind !== 'still';

  useEffect(() => {
    if (!animated) return undefined;
    // Start part-way through so two of the same prop in one Hood are never in
    // step. Seeding the value rather than delaying the start is fine here —
    // unlike a sprite's frame loop, a sine has no frames to clip.
    t.setValue((phase % 7) / 7);
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: motion.periodMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t, animated, motion, phase]);

  return useMemo(() => {
    if (motion.kind === 'still') return [];
    // Four stops make a round trip that eases at the extremes, which is what a
    // pendulum does; a two-stop ramp reads as a conveyor belt.
    const swing = [0, motion.amplitude, 0, -motion.amplitude, 0];
    const value = t.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: swing,
    });
    return motion.kind === 'sway' ? [{ translateX: value }] : [{ translateY: value }];
  }, [motion, t]);
}

function SceneItem({
  placement,
  size,
  left,
  top,
  dark,
  onPress,
}: {
  placement: ItemPlacement;
  size: number;
  left: number;
  top: number;
  dark: boolean;
  /** Absent on read-only Hoods. */
  onPress?: () => void;
}) {
  const drift = usePropDrift(placement.itemId, Math.round(placement.x * 100));
  const light = useMemo(() => propLight(placement.itemId), [placement.itemId]);
  const def = PLACEABLE_ITEMS.find((i) => i.item_id === placement.itemId);
  if (!def) return null;

  const art = getPropSheet(placement.itemId);

  const body = (
    <>
      {/* Under the prop and under its shadow, so the prop reads as the source
          of the light rather than as something sitting in it. */}
      {dark && light && (
        <LightPool
          size={size}
          colour={light.color}
          spread={light.spread}
          flicker={light.flicker}
          phase={Math.round(placement.x * 100)}
        />
      )}
      <ContactShadow size={size} dark={dark} />
      {art ? (
        <Animated.Image
          source={art}
          // Nearest-neighbour is the whole point: the sheets ship pre-upscaled
          // 4×, and letting the GPU smooth them would blur the keyline that
          // makes props sit with the cats.
          resizeMode="contain"
          fadeDuration={0}
          style={{ width: size, height: size, transform: drift }}
        />
      ) : (
        // Only reachable if an item ships without authored art.
        <Text style={{ fontSize: size * 0.4 }}>{def.emoji}</Text>
      )}
    </>
  );

  const frame: ViewStyle = {
    position: 'absolute',
    left,
    top,
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: Math.round(placement.z * 1000),
  };

  // Picking an item back up by tapping it in the scene is what let the item
  // tray drop its +/− steppers. Acting on the object itself is both more direct
  // and one less widget on screen.
  if (!onPress) {
    return (
      <View pointerEvents="none" style={frame}>
        {body}
      </View>
    );
  }

  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${def.label} — tap to put away`}
      // Presses in and dims — it is about to be picked up and put away.
      scaleTo={0.9}
      pressedStyle={{ opacity: 0.75 }}
      style={frame}
    >
      {body}
    </Touchable>
  );
}

// ---------------------------------------------------------------------------
// Ambience
// ---------------------------------------------------------------------------

/**
 * The sun or moon, with the glow it throws into the sky around it.
 *
 * The glow is what stops it reading as a sticker. A flat disc on a banded
 * gradient is the single most obviously-drawn thing in a sky; two faint rings
 * behind it cost nothing and make it sit in the air instead of on top of it.
 */
function Luminary({ dark, left, top }: { dark: boolean; left: number; top: number }) {
  const size = dark ? 38 : 52;
  const colour = dark ? '#EFF1FF' : '#FFF0BE';

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top }}>
      {[2.4, 1.6].map((ring, i) => (
        <View
          key={ring}
          style={{
            position: 'absolute',
            left: -(size * (ring - 1)) / 2,
            top: -(size * (ring - 1)) / 2,
            width: size * ring,
            height: size * ring,
            borderRadius: size * ring,
            backgroundColor: colour,
            opacity: dark ? 0.07 - i * 0.02 : 0.13 - i * 0.04,
          }}
        />
      ))}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colour,
          opacity: dark ? 0.92 : 0.85,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// HoodScene
// ---------------------------------------------------------------------------

export interface HoodSceneProps {
  /** Seeds the anchor lattice and the skyline. Same Hood ⇒ same scene. */
  hoodId: string;
  placedItems: string[];
  /** How many cats are visiting. Clamped to MAX_HOOD_CATS here as a backstop. */
  expectedCats: number;
  time: TimeOfDay;
  /** Sprite template ids for the visiting cats, newest first. */
  spriteIds?: string[];
  /** Sprite ids are still resolving — hold the scene empty rather than flash. */
  spritesLoading?: boolean;
  /** Theme overrides for sky and ground. Time of day still tints the result. */
  themeColors?: { skyTop: string; skyBottom: string; ground: string; accent: string };
  /**
   * Which environment's set dressing to draw — ground material and the wall
   * along the horizon. This is what makes a Back Alley read differently from a
   * Garden rather than being the same field with a different label.
   */
  envId?: string | null;
  /** Tapping a cat opens its Field Note. */
  onPressCat?: (slot: number, spriteId: string | undefined, atItemId: string | null) => void;
  /** Tapping a placed item picks it back up. */
  onPressItem?: (itemId: string) => void;
  /** Read-only friend Hoods suppress interaction. */
  readOnly?: boolean;
}

export function HoodScene({
  hoodId,
  placedItems,
  expectedCats,
  time,
  spriteIds,
  spritesLoading = false,
  themeColors,
  envId,
  onPressCat,
  onPressItem,
  readOnly = false,
}: HoodSceneProps) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const dark = isDark(time);
  const palette = skyPalette(time);
  const dressing = useMemo(() => getDressing(envId), [envId]);
  const seed = useMemo(() => hashSeed(hoodId), [hoodId]);

  /** Camera position, driven natively by the pan so parallax costs no JS. */
  const scrollX = useRef(new Animated.Value(0)).current;

  // The architectural cap is enforced in the layout call, not just upstream:
  // this component is reachable from the friend viewer too, and a bad document
  // should not be able to put 30 sprites on screen.
  const catCount = Math.max(0, Math.min(MAX_HOOD_CATS, expectedCats));

  const layout = useMemo(
    () => layoutScene({ hoodId, placedItems, catCount: spritesLoading ? 0 : catCount }),
    [hoodId, placedItems, catCount, spritesLoading],
  );

  const actors = useMemo(() => paintOrder(layout), [layout]);

  // Theme wins on the two colours it defines; the rest of the palette still
  // comes from the clock, so a themed Hood reads differently at night.
  const skyTop = themeColors?.skyTop ?? palette.top;
  const skyLow = dark ? palette.low : themeColors?.skyBottom ?? palette.low;
  // A purchased Theme still wins — it is the thing the player paid for. With no
  // Theme, the ground comes from the environment's material rather than from a
  // single shared green.
  const ground = themeColors?.ground ?? dressing.ground;

  const handlePressCat = useCallback(
    (placement: CatPlacement) => {
      if (readOnly) return;
      onPressCat?.(placement.slot, spriteIds?.[placement.slot], placement.atItemId);
    },
    [onPressCat, readOnly, spriteIds],
  );

  const { width: viewW, height } = box;
  const worldW = viewW * WORLD_WIDTHS;
  const horizonY = height * HORIZON;
  const panRange = Math.max(1, worldW - viewW);

  /** Layer offset for a given tracking rate. 1 would sit still relative to ground. */
  const parallax = (rate: number) =>
    scrollX.interpolate({
      inputRange: [0, panRange],
      outputRange: [0, -panRange * rate],
      extrapolate: 'clamp',
    });

  return (
    <View
      style={{ flex: 1, overflow: 'hidden', backgroundColor: skyTop }}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }}
    >
      {viewW > 0 && (
        <>
          {/* ── Sky: static, no detail to parallax ──────────────────────── */}
          {Array.from({ length: SKY_BANDS }, (_, i) => {
            const t = i / (SKY_BANDS - 1);
            // Two-stop through the mid colour, so dusk keeps its warm horizon
            // instead of averaging into mud.
            const colour =
              t < 0.5
                ? mixHex(skyTop, palette.mid, t * 2)
                : mixHex(palette.mid, skyLow, (t - 0.5) * 2);
            return (
              <View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: (horizonY / SKY_BANDS) * i,
                  height: horizonY / SKY_BANDS + 1,
                  backgroundColor: colour,
                }}
              />
            );
          })}

          {/* ── Far layer: sun/moon and drifting cloud ──────────────────── */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: worldW,
              height: horizonY,
              transform: [{ translateX: parallax(PARALLAX_SKY) }],
            }}
          >
            {dark && <StarField width={worldW} horizonY={horizonY} seed={seed} />}
            {/* Parked below the top chrome, not behind it — at 0.16 of the
                horizon the moon sat under the Hood-name pill. */}
            <Luminary dark={dark} left={viewW * 0.66} top={horizonY * 0.4} />
            <Clouds width={worldW} horizonY={horizonY} seed={seed} dark={dark} />
          </Animated.View>

          {/* ── Far layer: the distant skyline, washed toward the sky.     */}
          {/*    Two rows of buildings rather than one, at different rates: */}
          {/*    a single silhouette parallaxing against the ground gives   */}
          {/*    depth, but only one step of it, which is what made the     */}
          {/*    backdrop read as a painted flat rather than as distance.   */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: worldW,
              height: horizonY,
              transform: [{ translateX: parallax(PARALLAX_FAR) }],
            }}
          >
            <Backdrop
              seed={seed ^ 0x5bf03635}
              width={worldW}
              horizonY={horizonY * 0.88}
              colour={mixHex(palette.backdrop, palette.low, HAZE_FAR)}
              lit={false}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: worldW,
              height: horizonY,
              transform: [{ translateX: parallax(PARALLAX_BACKDROP) }],
            }}
          >
            <Backdrop
              seed={seed}
              width={worldW}
              horizonY={horizonY}
              colour={mixHex(palette.backdrop, palette.low, HAZE_MID)}
              lit={dark}
            />
          </Animated.View>

          {/* ── Ground layer: pans 1:1, and carries everything touchable ── */}
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // The world starts centred so there is somewhere to go in both
            // directions — opening hard against the left edge makes half the
            // Hood feel like an accident.
            contentOffset={{ x: panRange / 2, y: 0 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            contentContainerStyle={{ width: worldW, height: '100%' }}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: true,
            })}
          >
            <View style={{ width: worldW, height: '100%' }}>
              {/* Wall first — the ground plane is painted over its base, which
                  is what makes the two meet rather than merely abut. */}
              <MidWall dressing={dressing} width={worldW} topY={horizonY} dark={dark} />

              {/* Ground plane */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  width: worldW,
                  top: horizonY,
                  bottom: 0,
                  backgroundColor: ground,
                }}
              >
                {/* A single soft gradient toward the viewer instead of three
                    banded strips — the bands' hard edges read as a bug. */}
                {Array.from({ length: 8 }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: ((height - horizonY) / 8) * i,
                      height: (height - horizonY) / 8 + 1,
                      backgroundColor: dark ? '#000000' : '#2C2A29',
                      opacity: 0.055 * (1 - i / 8),
                    }}
                  />
                ))}
                <GroundDressing
                  seed={seed}
                  width={worldW}
                  height={height - horizonY}
                  tint={dressing.speckle}
                  dark={dark}
                />
                {/* Kerb where the ground meets the wall, plus the shadow the
                    wall casts onto it. */}
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 3,
                    backgroundColor: dressing.seam,
                    opacity: 0.8,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 3,
                    height: 16,
                    backgroundColor: dark ? '#000000' : '#2C2A29',
                    opacity: 0.14,
                  }}
                />
              </View>

              {/* Air between the wall and the actors. Drawn before them so a
                  cat always reads in front of the weather, and inside the 1x
                  layer so motes pan with the ground they are settling onto. */}
              <Motes
                style={moteStyleFor(envId, dark)}
                width={worldW}
                height={height}
                seed={seed}
              />
              {dark && dressing.wallStyle !== 'none' && (
                <Fireflies width={worldW} height={height * 0.72} seed={seed} />
              )}

              {/* Actors, back to front */}
              {actors.map((actor) => {
                const p = actor.placement;
                const size = ACTOR_BASE_SIZE * p.scale;
                // x is a fraction of the WORLD; y is the sprite's BASE, so the
                // box top sits one height above it.
                const left = p.x * worldW - size / 2;
                const top = p.y * height - size;

                if (actor.kind === 'item') {
                  const item = actor.placement;
                  return (
                    <SceneItem
                      key={p.key}
                      placement={item}
                      size={size}
                      left={left}
                      top={top}
                      dark={dark}
                      onPress={
                        readOnly || !onPressItem ? undefined : () => onPressItem(item.itemId)
                      }
                    />
                  );
                }

                const cat = actor.placement;
                return (
                  <SceneCat
                    key={p.key}
                    placement={cat}
                    spriteId={spriteIds?.[cat.slot]}
                    size={size}
                    left={left}
                    top={top}
                    dark={dark}
                    // Some cats doze after dark. Alternating by slot rather than
                    // at random keeps it stable across re-renders — a cat that
                    // flicks between awake and asleep looks broken, not sleepy.
                    asleep={dark && cat.slot % 2 === 1}
                    seed={seed}
                    worldWidth={worldW}
                    sceneHeight={height}
                    // Someone else's Hood is a photograph, not a place you are
                    // in: its cats breathe but do not wander off where the
                    // viewer has no say in it.
                    alive={!readOnly}
                    onPress={() => handlePressCat(cat)}
                  />
                );
              })}
            </View>
          </Animated.ScrollView>

          {/* ── Wash ────────────────────────────────────────────────────── */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: palette.wash,
              opacity: palette.washOpacity,
            }}
          />
        </>
      )}
    </View>
  );
}
