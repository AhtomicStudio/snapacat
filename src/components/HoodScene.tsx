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
import { CatSprite } from './CatSprite';
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

/** Number of bands used to approximate the sky gradient. */
const SKY_BANDS = 12;

// ---------------------------------------------------------------------------
// Backdrop — seeded silhouette at the horizon
// ---------------------------------------------------------------------------

interface BuildingSpec {
  left: number;
  width: number;
  height: number;
  windows: number;
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
    specs.push({ left: cursor, width, height, windows: 3 + Math.floor(r1 * 8) });
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
      {skyline.map((b, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: b.left * width,
            width: b.width * width,
            height: b.height,
            bottom: 0,
            backgroundColor: colour,
            borderTopLeftRadius: i % 3 === 0 ? 3 : 0,
            borderTopRightRadius: i % 4 === 0 ? 3 : 0,
          }}
        >
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
      ))}
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
            {Array.from({ length: Math.ceil(width / 26) + 1 }, (_, col) => (
              <View
                key={col}
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
            ))}
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

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
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

function SceneCat({
  placement,
  spriteId,
  size,
  left,
  top,
  dark,
  asleep,
  onPress,
}: {
  placement: CatPlacement;
  spriteId?: string;
  size: number;
  left: number;
  top: number;
  dark: boolean;
  asleep: boolean;
  onPress: () => void;
}) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="A visiting cat"
      // Scale on the whole actor, shadow included, so the press reads as the cat
      // reacting rather than the sprite detaching from the ground.
      pressedStyle={{ transform: [{ scale: 1.07 }] }}
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'flex-end',
        zIndex: Math.round(placement.z * 1000),
      }}
    >
      <ContactShadow size={size} dark={dark} />
      {spriteId ? (
        <CatSprite
          spriteId={spriteId}
          size={size}
          animation={asleep ? 'sleep' : 'idle'}
          phase={placement.slot}
        />
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
  );
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
  const def = PLACEABLE_ITEMS.find((i) => i.item_id === placement.itemId);
  if (!def) return null;

  const art = getPropSheet(placement.itemId);

  const body = (
    <>
      <ContactShadow size={size} dark={dark} />
      {art ? (
        <Image
          source={art}
          // Nearest-neighbour is the whole point: the sheets ship pre-upscaled
          // 4×, and letting the GPU smooth them would blur the keyline that
          // makes props sit with the cats.
          resizeMode="contain"
          fadeDuration={0}
          style={{ width: size, height: size }}
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
      pressedStyle={{ transform: [{ scale: 0.9 }], opacity: 0.75 }}
      style={frame}
    >
      {body}
    </Touchable>
  );
}

// ---------------------------------------------------------------------------
// Ambience
// ---------------------------------------------------------------------------

function Drifter({ width, dark, top }: { width: number; dark: boolean; top: number }) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 96000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-160, width + 160],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top, left: 0, transform: [{ translateX }] }}
    >
      <Text style={{ fontSize: 34, opacity: dark ? 0.22 : 0.45 }}>{dark ? '✧' : '☁️'}</Text>
    </Animated.View>
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
            {/* Parked below the top chrome, not behind it — at 0.16 of the
                horizon the moon sat under the Hood-name pill. */}
            <View
              style={{
                position: 'absolute',
                left: viewW * 0.66,
                top: horizonY * 0.40,
                width: dark ? 38 : 52,
                height: dark ? 38 : 52,
                borderRadius: 26,
                backgroundColor: dark ? '#EFF1FF' : '#FFF0BE',
                opacity: dark ? 0.92 : 0.85,
              }}
            />
            <Drifter width={worldW} dark={dark} top={horizonY * 0.34} />
          </Animated.View>

          {/* ── Mid layer: skyline. The parallax against the ground while  */}
          {/*    panning is what actually reads as depth.                   */}
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
              colour={palette.backdrop}
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
