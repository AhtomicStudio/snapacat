/**
 * Shared, render-only primitives for The Hood canvas.
 * Neither HoodScreen nor FriendHoodScreen should re-declare these.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { PLACEABLE_ITEMS, MAX_HOOD_CATS, type SpawnResult } from '../utils/spawnCalculator';
import { INNER_SHADOW } from '../utils/styles';
import { CatSprite } from './CatSprite';

// ---------------------------------------------------------------------------
// CatSlot
// ---------------------------------------------------------------------------

const CAT_OFFSETS: Array<{ left: number; bottom: number }> = [
  { left: 8,  bottom: 12 },
  { left: 28, bottom: 18 },
  { left: 52, bottom: 10 },
  { left: 72, bottom: 20 },
  { left: 18, bottom: 36 },
  { left: 62, bottom: 32 },
];

// Perch tables are indexed by slot, but the slot count comes from
// MAX_HOOD_CATS. Raising the cap without extending them would silently stack
// the extra cats in the bottom-left corner via the `?? { left: 0, bottom: 0 }`
// fallback below — a layout bug, and the first thing to break, well before
// framerate is a concern.
// `typeof` guard because __DEV__ is a React Native global and this module is
// also loaded by the Jest suite, which runs in a plain node environment.
if (typeof __DEV__ !== 'undefined' && __DEV__ && CAT_OFFSETS.length !== MAX_HOOD_CATS) {
  throw new Error(
    `CAT_OFFSETS defines ${CAT_OFFSETS.length} perches but MAX_HOOD_CATS is ${MAX_HOOD_CATS}.`,
  );
}

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
  /** Custom perch position (percent from left/bottom); defaults to the outdoor layout. */
  offset?: { left: number; bottom: number };
  /** Renders a dozing cat (💤, no bob) — used for some cats at night. */
  sleeping?: boolean;
  /** Sprite template id. Falls back to the 🐱 emoji when omitted. */
  spriteId?: string;
  /** Sprite ids are still resolving — hold the empty perch rather than flash a fallback. */
  pending?: boolean;
}) {
  const { left, bottom } = offset ?? CAT_OFFSETS[index] ?? { left: 0, bottom: 0 };
  const bobAnim = useRef(new Animated.Value(0)).current;

  // Sprites carry their own breathing loop; bobbing them as well reads as a hop
  // rather than a breath. Tracked as a value so the transform can be detached
  // entirely — leaving it attached kept six live native animation nodes alive
  // per canvas doing nothing.
  const usesBob = isOccupied && !sleeping && !spriteId && !pending;

  useEffect(() => {
    if (!usesBob) {
      bobAnim.stopAnimation();
      bobAnim.setValue(0);
      return;
    }

    // Stagger each slot so cats bob at different times (organic feel)
    let loop: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bobAnim, {
            toValue: -5,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bobAnim, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(600 + index * 100),
        ]),
      );
      loop.start();
    }, index * 280);

    return () => {
      clearTimeout(timer);
      // Stopping the loop directly, rather than relying on stopAnimation to
      // propagate a not-finished result up through it, is what actually
      // guarantees the iteration halts.
      loop?.stop();
      bobAnim.stopAnimation();
    };
  // bobAnim ref is stable — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesBob, index]);

  // While sprite ids resolve, hold the vacant perch. Rendering the emoji here
  // guaranteed a visible pop on every Hood entry, since the screen remounts
  // with empty state each time.
  const showCat = isOccupied && !pending;

  return (
    <Animated.View
      style={[
        { position: 'absolute', left: `${left}%`, bottom: `${bottom}%` },
        usesBob ? { transform: [{ translateY: bobAnim }] } : null,
      ]}
      className="items-center"
    >
      {showCat ? (
        <View style={{ alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
          {sleeping && (
            <Text style={{ position: 'absolute', top: -12, right: -14, fontSize: 13, opacity: 0.85 }}>
              💤
            </Text>
          )}
          {spriteId ? (
            <CatSprite
              spriteId={spriteId}
              size={44}
              animation={sleeping ? 'sleep' : 'idle'}
              phase={index}
            />
          ) : (
            <Text style={{ fontSize: 36 }}>🐱</Text>
          )}
        </View>
      ) : (
        /* Vacant slot: warm dashed ring, not a cold grey */
        <View
          className="w-10 h-10 rounded-full border-2 border-dashed opacity-30"
          style={{ borderColor: '#FFE8DC' }}
        />
      )}
    </Animated.View>
  );
}

/** Memoised — the Hood re-renders on Shop, night-toggle and item-placement state. */
export const CatSlot = React.memo(CatSlotInner);

// ---------------------------------------------------------------------------
// PlacedItemsOverlay
// ---------------------------------------------------------------------------

export function PlacedItemsOverlay({ placedItems }: { placedItems: string[] }) {
  const counts = useMemo(
    () =>
      placedItems.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [placedItems],
  );

  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  return (
    <View className="absolute bottom-0 left-0 right-0 flex-row justify-center pb-sm gap-sm">
      {entries.map(([id, count]) => {
        const def = PLACEABLE_ITEMS.find((i) => i.item_id === id);
        if (!def) return null;
        return (
          <View
            key={id}
            className="rounded-full px-sm py-xs flex-row items-center gap-xs"
            style={{
              backgroundColor: 'rgba(250,246,240,0.88)',
              borderWidth: 1,
              borderColor: 'rgba(234,227,218,0.6)',
            }}
          >
            <Text style={{ fontSize: 16 }}>{def.emoji}</Text>
            {count > 1 && (
              <Text className="text-xs font-bold text-text-primary">×{count}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SpawnMeter — animated fill bar
// ---------------------------------------------------------------------------

export function SpawnMeter({ result }: { result: SpawnResult }) {
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: result.finalChance,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      // width cannot use the native driver — this is expected
      useNativeDriver: false,
    }).start();
  }, [result.finalChance]);

  const animatedWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View className="gap-xs">
      {/* Labels row */}
      <View className="flex-row justify-between items-baseline">
        <Text className="text-sm font-semibold text-text-primary font-display">
          Spawn Chances
        </Text>
        <Text className="text-xs text-text-secondary font-sans">
          {result.finalChance}%
          {result.totalBonus > 0 && (
            <Text className="text-ginger"> (+{result.totalBonus} from items)</Text>
          )}
        </Text>
      </View>

      {/* Track — no border, soft inner shadow for depth */}
      <View
        className="h-3 rounded-full overflow-hidden"
        style={{ backgroundColor: '#F0EBE3', ...INNER_SHADOW }}
      >
        <Animated.View
          className="h-full rounded-full"
          /* Ginger fill with a subtle nose-pink highlight via a two-stop gradient
             approximated here with just the ginger token since RN gradients need
             a separate library. A LinearGradient wrapper can replace this once
             react-native-linear-gradient is wired up. */
          // eslint-disable-next-line react-native/no-inline-styles
          style={[
            { width: animatedWidth },
            { backgroundColor: '#FF8E53' },
          ]}
        />
      </View>

      {/* Cat count summary */}
      <Text className="text-xs text-text-secondary font-sans text-center">
        ~{result.expectedCats} of {MAX_HOOD_CATS} cat slots active
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// HoodCanvas — sky + ground + cats + items container
// ---------------------------------------------------------------------------

export interface HoodCanvasProps {
  placedItems: string[];
  expectedCats: number;
  isNight: boolean;
  /**
   * Sprite template ids to perch in the occupied slots, in order. Slots beyond
   * the end of this list fall back to the 🐱 emoji, so passing nothing keeps
   * the previous behaviour.
   */
  spriteIds?: string[];
  /** Sprite ids still resolving — perches stay empty rather than flashing emoji. */
  spritesLoading?: boolean;
  /** Render a read-only "lock" badge instead of the cat count chip. */
  readOnly?: boolean;
  /** Optional theme colour overrides — sky gradient top colour and ground colour. */
  themeColors?: {
    skyTop: string;
    skyBottom: string;
    ground: string;
    accent: string;
  };
}

export function HoodCanvas({
  placedItems,
  expectedCats,
  isNight,
  spriteIds,
  spritesLoading = false,
  readOnly = false,
  themeColors,
}: HoodCanvasProps) {
  // Theme overrides take priority; fall back to day/night defaults
  const canvasBg = themeColors?.skyTop ?? (isNight ? '#1A1C29' : '#87CEEB');
  const canvasBgBottom = themeColors?.skyBottom ?? (isNight ? '#2C304E' : '#E0F6FF');
  const groundBg = themeColors?.ground ?? (isNight ? '#2C304E' : '#A8D5A2');
  void canvasBgBottom; // used conceptually; single-colour bg approximates gradient

  const slotOccupancy = Array.from(
    { length: MAX_HOOD_CATS },
    (_, i) => i < expectedCats,
  );

  return (
    <View
      style={{
        height: 260,
        backgroundColor: canvasBg,
        overflow: 'hidden',
        // Canvas gets a stronger shadow than cards to feel like a real stage
        shadowColor: '#2C2A29',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
        elevation: 5,
      }}
      className="mx-lg mt-lg rounded-2xl relative"
    >
      {/* Stars */}
      {isNight && (
        <View className="absolute top-md left-0 right-0 flex-row justify-around px-xl">
          {['✦', '✧', '✦', '✧', '✦'].map((s, i) => (
            <Text key={i} style={{ color: '#FFFFFF', fontSize: 8, opacity: 0.7 }}>
              {s}
            </Text>
          ))}
        </View>
      )}

      {/* Ground */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          backgroundColor: groundBg,
        }}
      />

      {slotOccupancy.map((occupied, i) => (
        <CatSlot
          key={i}
          index={i}
          isOccupied={occupied}
          sleeping={isNight && occupied && i % 2 === 1}
          spriteId={spriteIds?.[i]}
          pending={spritesLoading}
        />
      ))}

      <PlacedItemsOverlay placedItems={placedItems} />

      {/* Top-right badge */}
      <View
        className="absolute top-sm right-sm rounded-full px-sm py-xs flex-row items-center gap-xs"
        style={{ backgroundColor: 'rgba(250,246,240,0.92)', borderWidth: 1, borderColor: 'rgba(234,227,218,0.5)' }}
      >
        {readOnly ? (
          <>
            <Text style={{ fontSize: 12 }}>👁</Text>
            <Text className="text-xs font-bold text-text-secondary">View only</Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 12 }}>🐱</Text>
            <Text className="text-xs font-bold text-text-primary">
              {expectedCats}/{MAX_HOOD_CATS}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
