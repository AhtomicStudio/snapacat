/**
 * ApartmentCanvas — the Studio Apartment interior, drawn entirely with flat
 * React Native views (no image assets). Clean, simple furniture in the brand
 * palette: plaster wall, wood floor, sofa, rug, wall shelf, floor lamp, and a
 * window that shows the themed sky (day/night aware).
 *
 * Level layer: six placement slots from APARTMENT_SLOTS render as tappable
 * spots — dashed "+" when empty, the placed item's emoji when filled.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, Pressable } from 'react-native';
import { APARTMENT_SLOTS } from '../config/apartment';
import { PLACEABLE_ITEMS, MAX_HOOD_CATS } from '../utils/spawnCalculator';
import { CatSlot } from './HoodCanvas';

// Cat perches arranged for the room (percent from left / bottom).
// Order = fill order: first cats appear in the most natural spots.
const APARTMENT_PERCHES = [
  { left: 46, bottom: 10 },  // on the rug, front and centre
  { left: 22, bottom: 36 },  // sofa seat
  { left: 63, bottom: 53 },  // windowsill
  { left: 86, bottom: 12 },  // floor, right corner
  { left: 5,  bottom: 47 },  // sofa arm
  { left: 30, bottom: 4  },  // floor, front left
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
  baseboardDay: '#FFFFFF', baseboardNight: '#4A4462',
  sofaDay: '#E9D7C3',   sofaNight: '#8F8070',
  cushionDay: '#FFFFFF', cushionNight: '#B9AE9E',
  rugDay: '#FFE8DC',    rugNight: '#6E5D62',
  woodLeg: '#A8845A',
  shelfDay: '#C9A874',  shelfNight: '#6B573F',
  frame: '#FFFFFF',     frameNight: '#55506E',
  skyDayFallback: '#A9D9F2', skyNight: '#1A1C29',
};

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
    <Pressable
      disabled={disabled}
      onPress={onPress}
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
    </Pressable>
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

  return (
    <View
      style={{
        height: 300,
        backgroundColor: wall,
        overflow: 'hidden',
        shadowColor: '#2C2A29',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
        elevation: 5,
      }}
      className="mx-lg mt-lg rounded-2xl relative"
    >
      {/* ── Floor (bottom 30%) ─────────────────────────────────────────── */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', backgroundColor: floor }}>
        {/* Plank seams */}
        {[18, 42, 66, 88].map((x) => (
          <View
            key={x}
            style={{ position: 'absolute', left: `${x}%`, top: 0, bottom: 0, width: 1.5, backgroundColor: plank, opacity: 0.45 }}
          />
        ))}
        {/* Floor/wall meeting line */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: plank, opacity: 0.6 }} />
      </View>

      {/* Baseboard */}
      <View
        style={{
          position: 'absolute', bottom: '30%', left: 0, right: 0, height: 7,
          backgroundColor: isNight ? COLORS.baseboardNight : COLORS.baseboardDay,
          opacity: isNight ? 0.8 : 0.9,
        }}
      />

      {/* ── Rug ────────────────────────────────────────────────────────── */}
      <View
        style={{
          position: 'absolute', left: '38%', bottom: '5%', width: '36%', height: 40,
          borderRadius: 20, backgroundColor: rug, opacity: isNight ? 0.7 : 0.9,
        }}
      >
        <View style={{ flex: 1, margin: 5, borderRadius: 15, borderWidth: 1.5, borderColor: isNight ? 'rgba(255,255,255,0.18)' : 'rgba(230,112,53,0.25)' }} />
      </View>

      {/* ── Window (right) ─────────────────────────────────────────────── */}
      <View
        style={{
          position: 'absolute', left: '62%', top: '11%', width: '30%', height: '34%',
          backgroundColor: frame, borderRadius: 10, padding: 5,
        }}
      >
        <View style={{ flex: 1, borderRadius: 6, backgroundColor: windowSky, overflow: 'hidden' }}>
          {isNight && (
            <>
              <Text style={{ position: 'absolute', top: 8, left: 12, fontSize: 8, color: '#FFFFFF', opacity: 0.8 }}>✦</Text>
              <Text style={{ position: 'absolute', top: 22, right: 16, fontSize: 6, color: '#FFFFFF', opacity: 0.6 }}>✧</Text>
              <Text style={{ position: 'absolute', top: 36, left: 30, fontSize: 7, color: '#FFFFFF', opacity: 0.7 }}>✦</Text>
              <View style={{ position: 'absolute', top: 10, right: 28, width: 16, height: 16, borderRadius: 8, backgroundColor: '#F4EED8', opacity: 0.85 }} />
            </>
          )}
          {!isNight && (
            /* Soft cloud */
            <View style={{ position: 'absolute', top: 14, left: 10, width: 34, height: 12, borderRadius: 8, backgroundColor: '#FFFFFF', opacity: 0.65 }} />
          )}
        </View>
        {/* Mullions */}
        <View style={{ position: 'absolute', top: 5, bottom: 5, left: '50%', width: 4, backgroundColor: frame }} />
        <View style={{ position: 'absolute', left: 5, right: 5, top: '50%', height: 4, backgroundColor: frame }} />
      </View>
      {/* Windowsill ledge */}
      <View
        style={{
          position: 'absolute', left: '60%', top: '45%', width: '34%', height: 8,
          backgroundColor: frame, borderRadius: 3,
          shadowColor: '#2C2A29', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
        }}
      />

      {/* ── Wall shelf (upper left) ────────────────────────────────────── */}
      <View style={{ position: 'absolute', left: '6%', top: '24%', width: '24%', height: 7, backgroundColor: shelf, borderRadius: 3 }} />
      <View style={{ position: 'absolute', left: '10%', top: '26%', width: 4, height: 9, backgroundColor: shelf, opacity: 0.8 }} />
      <View style={{ position: 'absolute', left: '25%', top: '26%', width: 4, height: 9, backgroundColor: shelf, opacity: 0.8 }} />

      {/* ── Floor lamp (mid-back, glows at night) ──────────────────────── */}
      <View style={{ position: 'absolute', left: '45%', bottom: '29%', alignItems: 'center' }}>
        {isNight && (
          <View style={{ position: 'absolute', top: -14, width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFD9A8', opacity: 0.22 }} />
        )}
        <View style={{ width: 30, height: 20, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: isNight ? '#FFD9A8' : '#F3D9B8' }} />
        <View style={{ width: 3, height: 62, backgroundColor: COLORS.woodLeg }} />
        <View style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: COLORS.woodLeg }} />
      </View>

      {/* ── Sofa (left) ────────────────────────────────────────────────── */}
      <View style={{ position: 'absolute', left: '4%', bottom: '27%', width: '30%' }}>
        {/* Backrest */}
        <View style={{ height: 44, backgroundColor: sofa, borderTopLeftRadius: 16, borderTopRightRadius: 16, marginHorizontal: 4 }} />
        {/* Seat cushions */}
        <View style={{ flexDirection: 'row', gap: 3, marginTop: -8, paddingHorizontal: 4 }}>
          <View style={{ flex: 1, height: 22, backgroundColor: cushion, borderRadius: 8, opacity: 0.9 }} />
          <View style={{ flex: 1, height: 22, backgroundColor: cushion, borderRadius: 8, opacity: 0.9 }} />
        </View>
        {/* Base + arms */}
        <View style={{ height: 14, backgroundColor: sofa, borderRadius: 6, marginTop: -4 }} />
        {/* Legs */}
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
          <Pressable
            key={slot.slot_id}
            onPress={() => onPressEmptySlot?.(slot.slot_id)}
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
              <Text style={{ fontSize: 17, color: isNight ? 'rgba(255,255,255,0.8)' : '#E67035', fontWeight: '600' }}>+</Text>
            </Animated.View>
          </Pressable>
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

      {/* ── Top-right badge ────────────────────────────────────────────── */}
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
