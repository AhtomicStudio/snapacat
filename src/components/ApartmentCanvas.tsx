/**
 * ApartmentCanvas — the Studio Apartment interior, drawn entirely with flat
 * React Native views (no image assets).
 *
 * WHY THIS LOOKS THE WAY IT DOES
 *
 * The room used to be six flat shapes on two flat slabs, and it read as a
 * wireframe of a room rather than a room. Flat shading is not the problem —
 * the Hood is flat too — the problem is that a real surface is never one
 * value. Three things do almost all the work here, and they are the same
 * three that fixed the outdoor backdrop:
 *
 *   1. Every large surface carries a gradient. Plaster is darker where it
 *      curves away from the light; boards darken into the skirting. A
 *      single-value wall is the most amateur thing a scene can contain,
 *      because nothing in a photographed room is ever a single value.
 *   2. Variation at low frequency, not just high. Fine speckle on a slab
 *      still reads as a slab with dust on it. Boards are tinted per board,
 *      and the wall is mottled in patches far wider than the viewport.
 *   3. Objects are connected to the floor. A contact shadow under every piece
 *      of furniture is what stops it hovering, and it costs one view.
 *
 * Light direction is fixed: in through the window, high on the right, falling
 * left and down. Every shade and highlight in here agrees with that.
 *
 * Level layer: six placement slots from APARTMENT_SLOTS render as tappable
 * spots — dashed "+" when empty, the placed item's emoji when filled.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, Text, type DimensionValue } from 'react-native';
import { Touchable } from './Touchable';
import { APARTMENT_SLOTS } from '../config/apartment';
import { WORLD_WIDTHS as APARTMENT_WIDTHS } from '../config/scene';
import { PLACEABLE_ITEMS, MAX_HOOD_CATS } from '../utils/spawnCalculator';
import { mixHex, shade, tint, hashIndex } from '../utils/colour';
import { SoftBlob } from './SoftBlob';
import { CatSprite } from './CatSprite';
import { font, color, space, radius, fontSize } from '../theme';

// ---------------------------------------------------------------------------
// CatSlot
// ---------------------------------------------------------------------------

/**
 * One perch in the room.
 *
 * Previously imported from HoodCanvas, which has been retired — the outdoor
 * Hood renders through HoodScene now, and HoodCanvas existed only to serve
 * these two consumers. Rather than keep a whole module alive for one component,
 * the perch lives with the only canvas that still uses it.
 */
function CatSlotInner({
  index,
  isOccupied,
  offset,
  sleeping = false,
  spriteId,
  pending = false,
}: {
  index: number;
  isOccupied: boolean;
  /** Perch position, percent from left/bottom. */
  offset?: { left: number; bottom: number };
  sleeping?: boolean;
  spriteId?: string;
  /** Sprite ids are still resolving — hold the empty perch, don't flash. */
  pending?: boolean;
}) {
  const { left, bottom } = offset ?? { left: 0, bottom: 0 };
  const bob = useRef(new Animated.Value(0)).current;

  // Sprites carry their own breathing loop; bobbing them as well reads as a hop
  // rather than a breath, so the transform is detached entirely when a real
  // sprite is present.
  const usesBob = isOccupied && !sleeping && !spriteId && !pending;

  useEffect(() => {
    if (!usesBob) {
      bob.stopAnimation();
      bob.setValue(0);
      return;
    }
    let loop: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: -5, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.delay(600 + index * 100),
        ]),
      );
      loop.start();
    }, index * 280);

    return () => {
      clearTimeout(timer);
      // Stopping the loop directly, rather than relying on stopAnimation to
      // propagate through it, is what actually halts the iteration.
      loop?.stop();
      bob.stopAnimation();
    };
    // bob is a stable ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesBob, index]);

  const showCat = isOccupied && !pending;

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: `${left}%`, bottom: `${bottom}%`, alignItems: 'center' },
        usesBob ? { transform: [{ translateY: bob }] } : null,
      ]}
    >
      {showCat ? (
        <View
          style={{ alignItems: 'center' }}
          // Decorative. importantForAccessibility is Android-only, so iOS needs
          // the companion prop or its screen reader still announces the 💤.
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {sleeping && (
            <Text style={{ position: 'absolute', top: -12, right: -14, fontSize: 13, opacity: 0.85 }}>
              💤
            </Text>
          )}
          {/* Cats stand on the floor, so they cast too. Without this they
              float exactly the way the furniture used to. */}
          <SoftBlob left={7} top={34} width={34} height={11} colour="#2A211A" peak={0.18} />
          {spriteId ? (
            <CatSprite spriteId={spriteId} size={44} animation={sleeping ? 'sleep' : 'idle'} phase={index} />
          ) : (
            <Text style={{ fontSize: 36 }}>🐱</Text>
          )}
        </View>
      ) : (
        // Vacant perch: a warm dashed ring, never a cold grey one.
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: color.gingerLight,
            opacity: 0.3,
          }}
        />
      )}
    </Animated.View>
  );
}

/** Memoised — the room re-renders on every placement and lighting change. */
const CatSlot = React.memo(CatSlotInner);

/**
 * Cat perches, percent from left / bottom. Order is fill order, so the first
 * cat to arrive takes the most natural spot.
 *
 * Retuned when the room went full-bleed. Two constraints that were not there
 * when this was a 300pt card: the floor line is now at 42% rather than 30%, so
 * anything "on the floor" sits higher; and the bottom fifth of the screen
 * belongs to the drawer peek and the floating buttons, so a cat below about
 * 24% is behind the chrome and might as well not be rendered.
 */
const APARTMENT_PERCHES = [
  { left: 46, bottom: 26 },  // on the rug, front and centre
  { left: 20, bottom: 44 },  // sofa seat
  { left: 63, bottom: 57 },  // windowsill
  { left: 84, bottom: 29 },  // floor, right corner
  { left: 6,  bottom: 47 },  // sofa arm — the arm tops out at ~47.5%
  { left: 32, bottom: 24 },  // floor, front left
] as const;

/** Same compile-time coupling check as CAT_OFFSETS in HoodCanvas. */
type ApartmentPerchCountMatches = typeof APARTMENT_PERCHES['length'] extends typeof MAX_HOOD_CATS
  ? true
  : never;
const _apartmentPerchCountMatches: ApartmentPerchCountMatches = true;
void _apartmentPerchCountMatches;

// Palette — day / night pairs for the interior
const COLORS = {
  wallDay: '#F6EEE3',   wallNight: '#3A3550',
  floorDay: '#DDBE90',  floorNight: '#7E6850',
  plankDay: '#C9A874',  plankNight: '#6B573F',
  // Not #FFFFFF. Pure white skirting and pure white cushions were the two
  // loudest things in the room once everything else had been shaded, and a
  // painted surface in a warm room reflects that warmth back.
  baseboardDay: '#F4EDE2', baseboardNight: '#4A4462',
  sofaDay: '#E9D7C3',   sofaNight: '#8F8070',
  cushionDay: '#F8F1E7', cushionNight: '#B9AE9E',
  rugDay: '#FFE8DC',
  // Was #6E5D62, a cool mauve, which on the warm night floor read as a damp
  // patch rather than a textile. A pale rug under a lamp stays warm and stays
  // lighter than the boards around it.
  rugNight: '#9B7F6F',
  woodLeg: '#A8845A',
  shelfDay: '#C9A874',  shelfNight: '#6B573F',
  frame: '#FFFFFF',     frameNight: '#55506E',
  skyDayFallback: '#A9D9F2', skyNight: '#1A1C29',
  curtainDay: '#E8CDB4', curtainNight: '#4E4660',
};

/** The floor occupies the bottom this-much of the room, in both zones. */
const FLOOR_PCT = 42;

// ---------------------------------------------------------------------------
// Room shell — wall, floor, skirting
// ---------------------------------------------------------------------------

/**
 * Bands used to fake the plaster falloff.
 *
 * Eighteen was not enough. The step between neighbouring bands worked out at
 * about four 8-bit levels on this cream, and a four-level step across a wide
 * flat area is visible as a contour even though the same step is invisible on
 * a busy surface. Forty puts it under two levels, which nothing resolves.
 */
const WALL_BANDS = 40;

/**
 * The plaster wall.
 *
 * A wall lit by one window is brightest a little above the sill and falls away
 * toward the ceiling and toward the floor. The old flat fill is what made the
 * upper half of this screen read as unpainted canvas — there was simply
 * nothing up there for the eye to land on.
 *
 * The mottling is deliberately enormous: patches wider than the viewport, so
 * only their gradient is ever on screen. The first attempt at this trick on
 * the outdoor ground used small patches and rendered as a field of visible
 * discs — there is no blur without a dependency, so the only way to get a soft
 * edge is to put the edge off screen.
 */
const Wall = React.memo(function Wall({
  base, isNight, width,
}: { base: string; isNight: boolean; width: number }) {
  // Night light is lamplight: a tighter, steeper pool than daylight.
  const falloff = isNight ? 0.34 : 0.16;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      {Array.from({ length: WALL_BANDS }, (_, i) => {
        const t = i / (WALL_BANDS - 1);
        const d = Math.abs(t - 0.42);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              top: `${(i / WALL_BANDS) * 100}%`,
              // The half-point overlap hides seams left by sub-pixel rounding.
              height: `${(100 / WALL_BANDS) + 0.5}%`,
              backgroundColor: shade(base, d * falloff * 2),
            }}
          />
        );
      })}

      {/* Low-frequency patchiness, the kind old plaster actually has. Each
          patch is a stack of rings rather than one shape — see SoftBlob for
          why a single rounded View cannot do this. */}
      {[
        { l: -0.30, t: -0.15, w: 1.15, h: 0.75, c: '#FFFFFF', p: 0.055 },
        { l: 0.42, t: 0.02, w: 0.95, h: 0.60, c: '#FFFFFF', p: 0.040 },
        { l: 0.02, t: 0.40, w: 1.05, h: 0.55, c: '#2A211A', p: 0.030 },
        { l: 0.60, t: 0.52, w: 0.85, h: 0.48, c: '#2A211A', p: 0.026 },
      ].map((m, i) => (
        <SoftBlob
          key={i}
          left={m.l * width}
          top={`${m.t * 100}%`}
          width={m.w * width}
          height={m.h * width}
          colour={m.c}
          peak={m.p}
        />
      ))}

      {/* Picture rail. A horizontal break near the ceiling is the cheapest
          way to stop a wall reading as an empty expanse, and rooms of this
          period really do have one. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: '15%', height: 3, backgroundColor: shade(base, 0.22) }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '15.9%', height: 1.5, backgroundColor: tint(base, 0.5), opacity: 0.7 }} />
    </View>
  );
});

/**
 * Floorboards.
 *
 * Four seam lines on a tan rectangle is a diagram of a floor. What makes wood
 * read as wood is that no two boards are the same colour, and that they are
 * cut — the short butt joints matter more than the long seams, because long
 * seams on their own read as a striped rug.
 */
const Floor = React.memo(function Floor({
  base, plank, width, isNight,
}: { base: string; plank: string; width: number; isNight: boolean }) {
  const count = Math.max(4, Math.round(width / 24));
  const boardW = width / count;

  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${FLOOR_PCT}%`, backgroundColor: base, overflow: 'hidden' }}>
      {Array.from({ length: count }, (_, i) => {
        const v = hashIndex(i, 3);
        return (
          <View
            key={i}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: i * boardW, width: boardW,
              backgroundColor: mixHex(base, plank, 0.03 + v * 0.13),
            }}
          >
            {/* Seam on the right edge of each board. */}
            <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 1.5, backgroundColor: shade(plank, 0.3), opacity: 0.5 }} />
            {/* Butt joint — one cut per board, each at its own height. */}
            <View
              style={{
                position: 'absolute', left: 0, right: 0,
                top: `${14 + hashIndex(i, 7) * 62}%`, height: 1.5,
                backgroundColor: shade(plank, 0.4), opacity: 0.8,
              }}
            />
          </View>
        );
      })}

      {/* Light falling across the boards from the window side. Without this
          the floor is evenly lit, which no floor beside a window is.

          Ramped in and out across ten bands rather than drawn as one
          rectangle: a block of 10% white has two hard horizontal edges, and
          a straight bright line across a floor is a thing nobody has ever
          seen. The profile is a half sine, so both edges reach zero. */}
      {Array.from({ length: 10 }, (_, i) => {
        const t = (i + 0.5) / 10;
        return (
          <View
            key={`lit${i}`}
            style={{
              position: 'absolute', left: 0, right: 0,
              top: `${22 + i * 4.2}%`, height: '4.6%',
              backgroundColor: '#FFF4DC',
              opacity: (isNight ? 0.04 : 0.13) * Math.sin(Math.PI * t),
            }}
          />
        );
      })}

      {/* Ambient occlusion into the skirting: the floor is darkest right
          where it meets the wall, and that one gradient is most of what makes
          the two planes read as meeting rather than as abutting. */}
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute', left: 0, right: 0,
            top: i * 4, height: 5,
            backgroundColor: '#2A211A',
            opacity: 0.16 - i * 0.04,
          }}
        />
      ))}
    </View>
  );
});

/** Skirting board, with a top highlight and the shadow it throws on the floor. */
function Skirting({ face, isNight }: { face: string; isNight: boolean }) {
  return (
    <View style={{ position: 'absolute', bottom: `${FLOOR_PCT}%`, left: 0, right: 0, height: 8, backgroundColor: face, opacity: isNight ? 0.82 : 0.95 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1.5, backgroundColor: tint(face, 0.6), opacity: 0.8 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: '#2A211A', opacity: 0.12 }} />
    </View>
  );
}

/**
 * A soft patch of light or shade sitting on the room, placed from the
 * bottom edge the way the furniture is.
 *
 * Everything soft in here goes through this. The rule the room is built on
 * is that a rounded View has a hard edge, so anything meant to read as
 * LIGHT — a lamp glow, the pool it throws, the shadow under a sofa — has to
 * be a ring stack. The night pass made the cost of ignoring that obvious:
 * the lamp had a flat disc behind it that read as a circle painted on the
 * wall, which is the one thing a glow must never look like.
 */
function Glow({
  left, bottom, width, height, colour, peak,
}: {
  left: DimensionValue; bottom: DimensionValue;
  width: number; height: number; colour: string; peak: number;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, bottom, width, height }}>
      <SoftBlob left={0} top={0} width={width} height={height} colour={colour} peak={peak} />
    </View>
  );
}

/** The shadow a piece of furniture casts where it meets the floor. */
function ContactShadow({
  left, bottom, width, height = 12, peak = 0.22,
}: { left: DimensionValue; bottom: DimensionValue; width: number; height?: number; peak?: number }) {
  return <Glow left={left} bottom={bottom} width={width} height={height} colour="#2A211A" peak={peak} />;
}

/** A framed picture. Mount board plus art — a frame with no mat reads as a sticker. */
function WallArt({
  left, top, w, h, art, frameCol, isNight,
}: { left: DimensionValue; top: DimensionValue; w: number; h: number; art: string; frameCol: string; isNight: boolean }) {
  return (
    <View
      style={{
        position: 'absolute', left, top, width: w, height: h,
        backgroundColor: frameCol, padding: 3, borderRadius: 2,
      }}
    >
      <View style={{ flex: 1, backgroundColor: isNight ? '#D9D2C4' : '#FFFDF8', padding: 4 }}>
        <View style={{ flex: 1, backgroundColor: art, opacity: isNight ? 0.5 : 0.9 }} />
      </View>
      {/* The frame throws a small shadow down and to the left, with the light. */}
      <View style={{ position: 'absolute', left: -2, top: 3, bottom: -3, width: 3, backgroundColor: '#2A211A', opacity: 0.10 }} />
      <View style={{ position: 'absolute', left: -2, right: 3, bottom: -3, height: 3, backgroundColor: '#2A211A', opacity: 0.10 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const GLASS_BANDS = 14;

/**
 * The window, which is the only thing in the room that looks out.
 *
 * It was a blue rectangle, and it was the single biggest giveaway: a window
 * with nothing behind it is a painted-on window. It now gets the same
 * treatment the outdoor backdrop got — a banded sky, a hazed skyline, and
 * glass that catches the light — plus a frame with real depth, which comes
 * entirely from darkening the inner reveal on the two sides the light cannot
 * reach.
 */
const WindowView = React.memo(function WindowView({
  frameCol, skyTop, isNight,
}: { frameCol: string; skyTop: string; isNight: boolean }) {
  const horizon = isNight ? mixHex(skyTop, '#3A3550', 0.6) : mixHex(skyTop, '#FFE9C4', 0.62);
  const far = isNight ? '#262436' : mixHex('#8C9BAE', skyTop, 0.35);

  return (
    <>
      {/* Curtain rod, overhanging the casing at both ends like a real one. */}
      <View style={{ position: 'absolute', left: '55%', top: '12.2%', width: '42%', height: 4, borderRadius: 2, backgroundColor: isNight ? '#5C5470' : '#B79A78' }} />

      <View
        style={{
          position: 'absolute', left: '62%', top: '15%', width: '30%', height: '26%',
          backgroundColor: frameCol, borderRadius: 4, padding: 6,
        }}
      >
        <View style={{ flex: 1, backgroundColor: horizon, overflow: 'hidden' }}>
          {/* Sky */}
          {Array.from({ length: GLASS_BANDS }, (_, i) => {
            const t = i / (GLASS_BANDS - 1);
            return (
              <View
                key={i}
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${(i / GLASS_BANDS) * 100}%`,
                  height: `${(100 / GLASS_BANDS) + 0.6}%`,
                  backgroundColor: mixHex(skyTop, horizon, t),
                }}
              />
            );
          })}

          {/* A skyline, hazed toward the horizon colour. Distance is what
              turns a coloured pane into a view. */}
          {[
            { l: 2, w: 16, h: 30 }, { l: 20, w: 11, h: 46 }, { l: 33, w: 19, h: 24 },
            { l: 54, w: 13, h: 52 }, { l: 69, w: 16, h: 33 }, { l: 87, w: 14, h: 41 },
          ].map((b, i) => (
            <View
              key={i}
              style={{
                position: 'absolute', bottom: 0, left: `${b.l}%`, width: `${b.w}%`, height: `${b.h}%`,
                backgroundColor: mixHex(far, horizon, 0.42),
              }}
            />
          ))}

          {isNight ? (
            <>
              <Text style={{ position: 'absolute', top: 6, left: 10, fontSize: 8, color: '#FFFFFF', opacity: 0.8 }}>✦</Text>
              <Text style={{ position: 'absolute', top: 18, right: 14, fontSize: 6, color: '#FFFFFF', opacity: 0.6 }}>✧</Text>
              <Text style={{ position: 'absolute', top: 30, left: 26, fontSize: 7, color: '#FFFFFF', opacity: 0.7 }}>✦</Text>
              <View style={{ position: 'absolute', top: 8, right: 24, width: 15, height: 15, borderRadius: 8, backgroundColor: '#F4EED8', opacity: 0.9 }} />
              {/* Lit windows in the far blocks — the city is awake. */}
              {[{ l: 22, b: 30 }, { l: 24.5, b: 22 }, { l: 56, b: 36 }, { l: 71, b: 18 }, { l: 90, b: 26 }].map((w, i) => (
                <View key={i} style={{ position: 'absolute', left: `${w.l}%`, bottom: `${w.b}%`, width: 2, height: 3, backgroundColor: '#FFD9A8', opacity: 0.75 }} />
              ))}
            </>
          ) : (
            <>
              <View style={{ position: 'absolute', top: 10, left: 8, width: 30, height: 10, borderRadius: 6, backgroundColor: '#FFFFFF', opacity: 0.7 }} />
              <View style={{ position: 'absolute', top: 6, left: 18, width: 18, height: 9, borderRadius: 5, backgroundColor: '#FFFFFF', opacity: 0.6 }} />
              <View style={{ position: 'absolute', top: 20, right: 6, width: 22, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF', opacity: 0.45 }} />
            </>
          )}

          {/* Glass. A diagonal streak is the whole reason a pane reads as
              glazed rather than as a hole in the wall. */}
          <View
            style={{
              position: 'absolute', left: -14, top: -24, width: 20, height: 120,
              backgroundColor: '#FFFFFF', opacity: 0.13, transform: [{ rotate: '24deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute', left: 10, top: -24, width: 9, height: 120,
              backgroundColor: '#FFFFFF', opacity: 0.09, transform: [{ rotate: '24deg' }],
            }}
          />

          {/* Inner reveal: the frame is thick, so it shades the glass along
              the top and the left. This is the entire depth cue. */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: '#2A211A', opacity: 0.22 }} />
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#2A211A', opacity: 0.14 }} />
        </View>

        {/* Mullions, each with a shaded edge on the side away from the light. */}
        <View style={{ position: 'absolute', top: 6, bottom: 6, left: '50%', width: 5, backgroundColor: frameCol }} />
        <View style={{ position: 'absolute', top: 6, bottom: 6, left: '50%', width: 1.5, backgroundColor: '#2A211A', opacity: 0.12 }} />
        <View style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 5, backgroundColor: frameCol }} />
        <View style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 1.5, backgroundColor: '#2A211A', opacity: 0.12 }} />
      </View>

      {/* Sill, with the shadow it throws down the wall. */}
      <View style={{ position: 'absolute', left: '60%', top: '41%', width: '34%', height: 9, backgroundColor: frameCol, borderRadius: 2 }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: tint(frameCol, 0.8), opacity: 0.5 }} />
      </View>
      <View style={{ position: 'absolute', left: '60.5%', top: '43.1%', width: '33%', height: 5, backgroundColor: '#2A211A', opacity: 0.13, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
    </>
  );
});

/** A curtain panel: folds are vertical bands of alternating tone, nothing more. */
function Curtain({ left, isNight }: { left: DimensionValue; isNight: boolean }) {
  const base = isNight ? COLORS.curtainNight : COLORS.curtainDay;
  return (
    <View style={{ position: 'absolute', left, top: '12.5%', width: '8%', height: '31%' }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${i * 25}%`, width: '25.5%',
            backgroundColor: i % 2 ? shade(base, 0.14) : base,
          }}
        />
      ))}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: '#2A211A', opacity: 0.10 }} />
    </View>
  );
}

/**
 * Daylight through the glass, landing on the wall and the floor.
 *
 * Two overlapping rotated rectangles rather than one, because a real shaft
 * widens as it travels and a single rect of constant width reads as a ruler
 * laid against the wall. It is kept faint: the moment a light shaft is clearly
 * a shape, it stops being light.
 */
function LightShaft() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      {/* Each shaft is three rectangles sharing a centre line, widest and
          faintest on the outside. The ring trick in one dimension: a single
          rect of even opacity has two hard sides, and a hard-sided shaft
          reads as a pale stripe painted on the wall. */}
      {([{ l: '40%', t: '17%', w: 96 }, { l: '56%', t: '15%', w: 64 }] as const).map((sh, k) => (
        <React.Fragment key={k}>
          {[1, 0.62, 0.3].map((f, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: sh.l,
                top: sh.t,
                marginLeft: (sh.w * (1 - f)) / 2,
                width: sh.w * f,
                height: 360,
                backgroundColor: '#FFF4DC',
                opacity: 0.045,
                transform: [{ rotate: '19deg' }],
              }}
            />
          ))}
        </React.Fragment>
      ))}
    </View>
  );
}

/** A placed item that springs into the room on mount (keyed per slot+item). */
function PlacedItem({
  x, y, emoji, isNight, disabled, onPress,
}: {
  x: number; y: number; emoji: string; isNight: boolean;
  disabled: boolean; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, tension: 140, friction: 7, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <Touchable
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.9}
      style={{ position: 'absolute', left: `${x}%`, top: `${y}%` }}
    >
      <Animated.View
        style={{
          width: 38, height: 38, borderRadius: 12,
          backgroundColor: isNight ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.85)',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#2C2A29', shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
          transform: [{ scale }],
        }}
      >
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </Animated.View>
    </Touchable>
  );
}

export interface ApartmentCanvasProps {
  /** slot_id → item_id arrangement. */
  placements: Record<string, string>;
  expectedCats: number;
  isNight: boolean;
  /**
   * Sprite template ids to perch, in fill order. Slots past the end of this
   * list fall back to the 🐱 emoji, so omitting it keeps the old behaviour.
   */
  spriteIds?: string[];
  /** Sprite ids still resolving — perches stay empty rather than flashing emoji. */
  spritesLoading?: boolean;
  /** Hide empty slots and disable all interaction (friend view). */
  readOnly?: boolean;
  /** Theme sky colours show through the window. */
  themeColors?: { skyTop: string; skyBottom: string; ground: string; accent: string };
  onPressEmptySlot?: (slotId: string) => void;
  onPressPlacedItem?: (slotId: string) => void;
}

export function ApartmentCanvas({
  placements,
  expectedCats,
  isNight,
  spriteIds,
  spritesLoading = false,
  readOnly = false,
  themeColors,
  onPressEmptySlot,
  onPressPlacedItem,
}: ApartmentCanvasProps) {
  const wall = isNight ? COLORS.wallNight : COLORS.wallDay;
  const floor = isNight ? COLORS.floorNight : COLORS.floorDay;
  const plank = isNight ? COLORS.plankNight : COLORS.plankDay;
  const sofa = isNight ? COLORS.sofaNight : COLORS.sofaDay;
  const cushion = isNight ? COLORS.cushionNight : COLORS.cushionDay;
  const rug = isNight ? COLORS.rugNight : COLORS.rugDay;
  const shelf = isNight ? COLORS.shelfNight : COLORS.shelfDay;
  const frame = isNight ? COLORS.frameNight : COLORS.frame;
  const skirting = isNight ? COLORS.baseboardNight : COLORS.baseboardDay;
  const windowSky = isNight
    ? COLORS.skyNight
    : themeColors?.skyTop ?? COLORS.skyDayFallback;

  // Gentle pulse on empty slots — "tap me"
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (readOnly) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 1100, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, readOnly]);

  const slotOccupancy = Array.from(
    { length: MAX_HOOD_CATS },
    (_, i) => i < expectedCats,
  );

  /**
   * The room is wider than the window, like every other Hood.
   *
   * This used to be a 300pt card with margins and rounded corners floating in
   * the middle of the screen — a diorama you looked at, where every other
   * environment is a place you are standing in and can pan around. That made
   * the one purchasable interior feel like a lesser screen.
   *
   * The existing furniture is laid out in percentages that assume a
   * single-screen-wide room, and rewriting all of it to span a wider world is
   * how you warp a room. So it is not rewritten: the whole original layout is
   * wrapped in a box exactly one viewport wide, where its percentages resolve
   * to precisely what they always did, and the extra width is a second zone
   * authored beside it.
   */
  const [box, setBox] = useState({ width: 0, height: 0 });
  const scrollX = useRef(new Animated.Value(0)).current;
  const viewW = box.width;
  const worldW = viewW * APARTMENT_WIDTHS;
  const zoneTwoW = worldW - viewW;

  return (
    <View
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }}
      style={{
        flex: 1,
        backgroundColor: wall,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {viewW > 0 && (
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        contentContainerStyle={{ width: worldW, height: '100%' }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
      >
      {/* ── Zone one: the original room, at exactly its original width ──── */}
      <View style={{ width: viewW, height: '100%' }}>
        <Wall base={wall} isNight={isNight} width={viewW} />
        <Floor base={floor} plank={plank} width={viewW} isNight={isNight} />
        <Skirting face={skirting} isNight={isNight} />

        {/* Pictures above the sofa, hung off the rail. */}
        <WallArt left="9%" top="17.5%" w={34} h={42} art={isNight ? '#6A7FA8' : '#8FB4D9'} frameCol={isNight ? '#4A4462' : '#C9A874'} isNight={isNight} />
        <WallArt left="23%" top="19.5%" w={28} h={30} art={isNight ? '#A8756A' : '#E0A98F'} frameCol={isNight ? '#4A4462' : '#8F7A5C'} isNight={isNight} />

        {/* ── Rug ──────────────────────────────────────────────────────
            An oval, not a rounded rectangle: the curve is what stops it
            reading as a square of carpet tile. Lifted well clear of the
            bottom chrome, where the old one was entirely hidden. */}
        <View
          style={{
            position: 'absolute', left: '32%', bottom: '21%', width: '42%', height: 58,
            borderRadius: 999, backgroundColor: rug, opacity: isNight ? 0.75 : 0.95,
          }}
        >
          <View style={{ position: 'absolute', left: 4, right: 4, top: 3, bottom: 3, borderRadius: 999, borderWidth: 2, borderColor: isNight ? 'rgba(255,255,255,0.16)' : 'rgba(230,112,53,0.22)' }} />
          <View style={{ position: 'absolute', left: 14, right: 14, top: 11, bottom: 11, borderRadius: 999, backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : 'rgba(230,112,53,0.10)' }} />
          <View style={{ position: 'absolute', left: 26, right: 26, top: 19, bottom: 19, borderRadius: 999, borderWidth: 1.5, borderColor: isNight ? 'rgba(255,255,255,0.14)' : 'rgba(230,112,53,0.18)' }} />
        </View>

        <WindowView frameCol={frame} skyTop={windowSky} isNight={isNight} />
        <Curtain left="56%" isNight={isNight} />
        <Curtain left="89%" isNight={isNight} />
        {!isNight && <LightShaft />}

        {/* ── Wall shelf (upper left) ────────────────────────────────── */}
        <View style={{ position: 'absolute', left: '6%', top: '27%', width: '24%', height: 8, backgroundColor: shelf, borderRadius: 2 }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: tint(shelf, 0.4), opacity: 0.7 }} />
        </View>
        <View style={{ position: 'absolute', left: '6%', top: '28.7%', width: '24%', height: 4, backgroundColor: '#2A211A', opacity: 0.12 }} />
        <View style={{ position: 'absolute', left: '10%', top: '29.3%', width: 4, height: 10, backgroundColor: shade(shelf, 0.25) }} />
        <View style={{ position: 'absolute', left: '25%', top: '29.3%', width: 4, height: 10, backgroundColor: shade(shelf, 0.25) }} />

        {/* ── Floor lamp (mid-back, glows at night) ──────────────────── */}
        <View style={{ position: 'absolute', left: '45%', bottom: '41%', alignItems: 'center' }}>
          {isNight && (
            <SoftBlob left={-24} top={-26} width={82} height={82} colour="#FFD9A8" peak={0.30} />
          )}
          {/* The shade is lit from inside, so it is brightest at the hem. */}
          <View style={{ width: 32, height: 22, borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: isNight ? '#E8B878' : '#DFC49F', overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 11, backgroundColor: isNight ? '#FFE3BC' : '#F3DDBE' }} />
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: isNight ? '#FFF1D8' : '#FBEDD9' }} />
          </View>
          <View style={{ width: 3, height: 62, backgroundColor: COLORS.woodLeg }} />
          <View style={{ width: 22, height: 4, borderRadius: 2, backgroundColor: shade(COLORS.woodLeg, 0.2) }} />
        </View>
        <ContactShadow left="41%" bottom="39%" width={viewW * 0.13} height={11} peak={0.18} />
        {/* The pool of light the lamp actually throws. */}
        <Glow left="32%" bottom="24%" width={viewW * 0.32} height={56} colour="#FFD9A8" peak={isNight ? 0.20 : 0.08} />

        {/* ── Sofa (left) ────────────────────────────────────────────── */}
        <ContactShadow left="1%" bottom="37%" width={viewW * 0.40} height={16} peak={0.24} />
        <View style={{ position: 'absolute', left: '4%', bottom: '39%', width: '34%' }}>
          {/* Backrest, with the seam where the upholstery is tufted. */}
          <View style={{ height: 46, backgroundColor: sofa, borderTopLeftRadius: 14, borderTopRightRadius: 14, marginHorizontal: 5, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, backgroundColor: tint(sofa, 0.35), opacity: 0.6 }} />
            <View style={{ position: 'absolute', left: '50%', top: 6, bottom: 0, width: 1.5, backgroundColor: shade(sofa, 0.2), opacity: 0.5 }} />
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 7, backgroundColor: shade(sofa, 0.18), opacity: 0.5 }} />
          </View>
          {/* Seat cushions, with piping along the front edge. */}
          <View style={{ flexDirection: 'row', gap: 3, marginTop: -8, paddingHorizontal: 5 }}>
            {[0, 1].map((i) => (
              <View key={i} style={{ flex: 1, height: 23, backgroundColor: cushion, borderRadius: 7, opacity: 0.95, overflow: 'hidden' }}>
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: shade(cushion, 0.16), opacity: 0.55 }} />
              </View>
            ))}
          </View>
          {/* Base */}
          <View style={{ height: 14, backgroundColor: shade(sofa, 0.1), borderRadius: 5, marginTop: -4 }} />
          {/* Arms, drawn in front of the seat so they read as nearer. */}
          <View style={{ position: 'absolute', left: 0, bottom: 14, width: 11, height: 54, borderRadius: 6, backgroundColor: tint(sofa, 0.12) }} />
          <View style={{ position: 'absolute', right: 0, bottom: 14, width: 11, height: 54, borderRadius: 6, backgroundColor: shade(sofa, 0.08) }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 }}>
            <View style={{ width: 4, height: 9, backgroundColor: COLORS.woodLeg, borderRadius: 1 }} />
            <View style={{ width: 4, height: 9, backgroundColor: COLORS.woodLeg, borderRadius: 1 }} />
          </View>
        </View>

      {/* ── Placement slots ────────────────────────────────────────────── */}
      {APARTMENT_SLOTS.map((slot) => {
        const itemId = placements[slot.slot_id];
        const def = itemId ? PLACEABLE_ITEMS.find((i) => i.item_id === itemId) : undefined;

        if (def) {
          return (
            <PlacedItem
              key={`${slot.slot_id}-${def.item_id}`}
              x={slot.x}
              y={slot.y}
              emoji={def.emoji}
              isNight={isNight}
              disabled={readOnly}
              onPress={() => onPressPlacedItem?.(slot.slot_id)}
            />
          );
        }

        if (readOnly) return null;

        return (
          <Touchable
            key={slot.slot_id}
            onPress={() => onPressEmptySlot?.(slot.slot_id)}
            scaleTo={0.9}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            <Animated.View
              style={{
                width: 38, height: 38, borderRadius: 12,
                borderWidth: 2, borderStyle: 'dashed',
                borderColor: isNight ? 'rgba(255,255,255,0.55)' : '#FF8E53',
                backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : 'rgba(255,232,220,0.45)',
                alignItems: 'center', justifyContent: 'center',
                opacity: pulse,
              }}
            >
              <Text style={{ fontSize: 17, color: isNight ? 'rgba(255,255,255,0.8)' : '#E67035', fontFamily: font.medium}}>+</Text>
            </Animated.View>
          </Touchable>
        );
      })}

      {/* ── Cats ───────────────────────────────────────────────────────── */}
      {slotOccupancy.map((occupied, i) => (
        <CatSlot
          key={i}
          index={i}
          isOccupied={occupied}
          offset={APARTMENT_PERCHES[i]}
          sleeping={isNight && occupied && i % 2 === 1}
          spriteId={spriteIds?.[i]}
          pending={spritesLoading}
        />
      ))}

      </View>

      {/* ── Zone two: the rest of the flat ───────────────────────────────
          Authored against its own width rather than the room's, so nothing
          here can disturb the layout next door. The cat tree is the anchor:
          it is the tallest thing in the apartment and the one object that
          rewards panning over to look. */}
      <View style={{ width: zoneTwoW, height: '100%' }}>
        <Wall base={wall} isNight={isNight} width={zoneTwoW} />
        <Floor base={floor} plank={plank} width={zoneTwoW} isNight={isNight} />
        <Skirting face={skirting} isNight={isNight} />

        {/* Doorway through to the hall. The hall is darker than the room and
            its floor keeps going, which is what sells it as somewhere rather
            than as a dark rectangle. */}
        <View style={{ position: 'absolute', left: '6%', bottom: `${FLOOR_PCT}%`, width: '18%', height: '34%' }}>
          <View style={{ position: 'absolute', left: -4, right: -4, top: -4, bottom: 0, backgroundColor: frame, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: isNight ? '#15161F' : '#4A4254', overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%', backgroundColor: isNight ? '#1E1F2B' : '#5E5366' }} />
            {/* Light spilling in from the hall, along the floor. */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: '#FFE3BC', opacity: isNight ? 0.12 : 0.22 }} />
          </View>
          {/* The reveal: the frame is deep, so the near jamb shades the opening. */}
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#2A211A', opacity: 0.25 }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, backgroundColor: '#2A211A', opacity: 0.3 }} />
        </View>

        <WallArt left="27%" top="18%" w={30} h={38} art={isNight ? '#7A8A6A' : '#A9BE8F'} frameCol={isNight ? '#4A4462' : '#8F7A5C'} isNight={isNight} />

        {/* Bookshelf */}
        <ContactShadow left="27%" bottom={`${FLOOR_PCT - 1.5}%`} width={zoneTwoW * 0.24} height={13} peak={0.24} />
        <View style={{ position: 'absolute', left: '30%', bottom: `${FLOOR_PCT}%`, width: '18%', height: '30%', backgroundColor: shelf, borderRadius: 2, overflow: 'hidden' }}>
          {/* The carcass interior is in shadow; the shelf fronts catch light. */}
          <View style={{ position: 'absolute', left: 2, right: 2, top: 2, bottom: 0, backgroundColor: shade(shelf, 0.28) }} />
          {[0.18, 0.46, 0.74].map((t) => (
            <View key={t} style={{ position: 'absolute', left: 2, right: 2, top: `${t * 100}%`, height: 3, backgroundColor: tint(shelf, 0.25) }} />
          ))}
          {[
            { t: 0.04, l: 0.08, w: 0.09, c: '#C96A5A' }, { t: 0.04, l: 0.19, w: 0.07, c: '#6A8CC9' },
            { t: 0.04, l: 0.28, w: 0.10, c: '#D8A85C' }, { t: 0.04, l: 0.40, w: 0.06, c: '#7FA86A' },
            { t: 0.04, l: 0.48, w: 0.09, c: '#B06AA8' }, { t: 0.04, l: 0.59, w: 0.07, c: '#C96A5A' },
            { t: 0.04, l: 0.68, w: 0.11, c: '#6A8CC9' },
            { t: 0.32, l: 0.09, w: 0.08, c: '#7FA86A' }, { t: 0.32, l: 0.19, w: 0.09, c: '#B06AA8' },
            { t: 0.32, l: 0.30, w: 0.06, c: '#C96A5A' }, { t: 0.32, l: 0.38, w: 0.10, c: '#D8A85C' },
            { t: 0.32, l: 0.50, w: 0.07, c: '#6A8CC9' }, { t: 0.32, l: 0.59, w: 0.08, c: '#7FA86A' },
            { t: 0.60, l: 0.08, w: 0.11, c: '#C96A5A' }, { t: 0.60, l: 0.21, w: 0.07, c: '#6A8CC9' },
            { t: 0.60, l: 0.30, w: 0.08, c: '#D8A85C' }, { t: 0.60, l: 0.40, w: 0.09, c: '#B06AA8' },
            { t: 0.60, l: 0.51, w: 0.06, c: '#7FA86A' }, { t: 0.60, l: 0.59, w: 0.10, c: '#C96A5A' },
          ].map((b, i) => (
            <View key={i} style={{ position: 'absolute', left: `${b.l * 100}%`, top: `${b.t * 100}%`, width: `${b.w * 100}%`, height: '15%', backgroundColor: b.c, opacity: isNight ? 0.5 : 0.9, borderRadius: 1 }}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF', opacity: 0.25 }} />
            </View>
          ))}
        </View>

        {/* Cat tree — the tall anchor of this half of the room */}
        <ContactShadow left="55%" bottom={`${FLOOR_PCT - 1.5}%`} width={zoneTwoW * 0.28} height={14} peak={0.24} />
        <View style={{ position: 'absolute', left: '56%', bottom: `${FLOOR_PCT}%`, width: '26%', height: '46%' }}>
          {/* Post. Runs from just under the top perch all the way into the
              base, so there is no way for the two to drift apart. */}
          <View style={{ position: 'absolute', left: '40%', top: 20, bottom: 9, width: '20%', backgroundColor: isNight ? '#6B5A48' : '#C2A480', overflow: 'hidden' }}>
            {/* Sisal wrap, as banding. */}
            {Array.from({ length: 16 }, (_, i) => (
              <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 14, height: 6, backgroundColor: '#2A211A', opacity: 0.10 }} />
            ))}
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2.5, backgroundColor: '#FFFFFF', opacity: 0.20 }} />
            <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2.5, backgroundColor: '#2A211A', opacity: 0.16 }} />
          </View>

          {/* Base */}
          <View style={{ position: 'absolute', left: '10%', right: '10%', bottom: 0, height: 12, borderRadius: 2, backgroundColor: isNight ? '#5C4C3C' : '#AD9070' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, backgroundColor: '#FFFFFF', opacity: 0.22 }} />
          </View>

          {/* Mid platform, wide enough to overlap the post by a good margin. */}
          <View style={{ position: 'absolute', left: 0, top: '50%', width: '66%', height: 11, borderRadius: 2, backgroundColor: isNight ? '#5C4C3C' : '#AD9070' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2.5, backgroundColor: '#FFFFFF', opacity: 0.22 }} />
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#2A211A', opacity: 0.18 }} />
          </View>

          {/* Top perch, then the cushion resting on it — both in points from
              the top edge, overlapping, so they read as one assembly. */}
          <View style={{ position: 'absolute', left: '12%', right: '2%', top: 11, height: 12, borderRadius: 2, backgroundColor: isNight ? '#5C4C3C' : '#AD9070' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#2A211A', opacity: 0.18 }} />
          </View>
          <View style={{ position: 'absolute', left: '24%', right: '10%', top: 1, height: 13, borderRadius: 6, backgroundColor: cushion, opacity: isNight ? 0.75 : 1 }}>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: '#2A211A', opacity: 0.12 }} />
          </View>
        </View>

        <WallArt left="85%" top="21%" w={26} h={32} art={isNight ? '#8A7AA8' : '#C3B2DA'} frameCol={isNight ? '#4A4462' : '#C9A874'} isNight={isNight} />

        {/* Radiator under the far wall */}
        <View style={{ position: 'absolute', left: '84%', bottom: `${FLOOR_PCT}%`, width: '13%', height: '15%' }}>
          {/* Feet, so it stands off the skirting the way a real one does. */}
          <View style={{ position: 'absolute', left: '14%', bottom: 0, width: 4, height: 6, backgroundColor: isNight ? '#45405A' : '#B8B1A3' }} />
          <View style={{ position: 'absolute', right: '14%', bottom: 0, width: 4, height: 6, backgroundColor: isNight ? '#45405A' : '#B8B1A3' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 5, backgroundColor: isNight ? '#5A5468' : '#D9D2C4', borderRadius: 2, overflow: 'hidden' }}>
            {/* Fins */}
            {Array.from({ length: 7 }, (_, i) => (
              <View key={i} style={{ position: 'absolute', top: 3, bottom: 3, left: `${4 + i * 13.4}%`, width: '9%', backgroundColor: '#2A211A', opacity: 0.12 }} />
            ))}
            {/* Rails, top and bottom */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, backgroundColor: isNight ? '#6A6480' : '#E6E0D4' }} />
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: isNight ? '#4A4560' : '#C6BFB1' }} />
          </View>
        </View>
      </View>
      </Animated.ScrollView>
      )}

      {/* ── Top-right badge ────────────────────────────────────────────── */}
      <View
        style={{
          position: 'absolute',
          top: space.sm,
          right: space.sm,
          borderRadius: radius.full,
          paddingHorizontal: space.sm + 2,
          paddingVertical: space.xs + 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs,
          backgroundColor: 'rgba(250,246,240,0.92)',
          borderWidth: 1,
          borderColor: 'rgba(234,227,218,0.5)',
        }}
      >
        {readOnly ? (
          <>
            <Text style={{ fontSize: 12 }}>👁</Text>
            <Text style={{ fontSize: fontSize.xs, fontFamily: font.bold, color: color.textSecondary }}>
              View only
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 12 }}>🐱</Text>
            <Text style={{ fontSize: fontSize.xs, fontFamily: font.bold, color: color.textPrimary }}>
              {expectedCats}/{MAX_HOOD_CATS}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
