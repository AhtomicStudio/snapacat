import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Hood, UserProgression } from '../types';
import {
  PLACEABLE_ITEMS,
  addItem,
  removeItem,
  calculateSpawnChances,
  canAddItem,
  getAttractionProfile,
  type PlaceableItemDef,
} from '../utils/spawnCalculator';
import { usePerchSprites } from '../hooks/usePerchSprites';
import { HoodCanvas, SpawnMeter } from '../components/HoodCanvas';
import { ApartmentCanvas } from '../components/ApartmentCanvas';
import { APARTMENT_SLOTS, autoAssignPlacements, getSlotById } from '../config/apartment';
import { CARD_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';
import { ShopScreen } from './ShopScreen';
import { getThemeById, DEFAULT_THEME } from '../config/themes';
import { getEnvironmentById, DEFAULT_ENVIRONMENT } from '../config/environments';
import { isItemUnlocked, setActiveTheme } from '../utils/progressionEngine';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HoodScreenProps {
  hoodId: string;
  hood: Hood;
  onUpdateHood: (hoodId: string, updated: Hood) => void;
  onBack: () => void;
  /** Current user's progression — for Shop integration. */
  progression: UserProgression;
  /** Called when the user makes a purchase or activates a theme/env. */
  onUpdateProgression: (updated: UserProgression) => void;
  /** UID of the current user, used to scope progression saves. */
  userId: string;
}

// ---------------------------------------------------------------------------
// ItemPill
// ---------------------------------------------------------------------------

function ItemPill({
  def,
  stackCount,
  canAdd,
  canRemove,
  isLocked,
  onAdd,
  onRemove,
  onPressLocked,
}: {
  def: PlaceableItemDef;
  stackCount: number;
  canAdd: boolean;
  canRemove: boolean;
  /** True when the user hasn't purchased this item from the Shop yet. */
  isLocked: boolean;
  onAdd: () => void;
  onRemove: () => void;
  /** Called when the user taps a locked item — navigate to Shop. */
  onPressLocked: () => void;
}) {
  const interactive = !isLocked && canAdd;

  return (
    <View className="items-center gap-xs mr-md">
      {/* Main add button — 56×56, scale on press */}
      <Pressable
        onPress={isLocked ? onPressLocked : onAdd}
        disabled={!isLocked && !canAdd}
        style={({ pressed }) => [
          interactive && pressScale(pressed, 0.93),
          {
            width: 56,
            height: 56,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            backgroundColor: isLocked ? '#F5F3F0' : canAdd ? '#FFE8DC' : '#FAF6F0',
            borderColor: isLocked
              ? 'rgba(234,227,218,0.8)'
              : canAdd
              ? '#FF8E53'
              : 'rgba(234,227,218,0.8)',
            opacity: isLocked ? 0.7 : canAdd ? 1 : 0.4,
            ...(!isLocked && canAdd && {
              shadowColor: '#FF8E53',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.12,
              shadowRadius: 6,
              elevation: 2,
            }),
          },
        ]}
      >
        {isLocked ? (
          <Text style={{ fontSize: 20 }}>🔒</Text>
        ) : (
          <Text style={{ fontSize: 26 }}>{def.emoji}</Text>
        )}
      </Pressable>

      {/* Label */}
      <Text
        className="text-xs text-text-secondary font-sans text-center"
        style={{ maxWidth: 56 }}
        numberOfLines={2}
      >
        {def.label}
      </Text>

      {/* Count badge + remove — both meet 28×28 minimum (28 is appropriate for
          secondary inline controls; primary remove action is ≥44 via hitSlop) */}
      {stackCount > 0 && (
        <View className="flex-row items-center gap-xs">
          <View
            className="rounded-full items-center justify-center"
            style={{ width: 22, height: 22, backgroundColor: '#FF8E53' }}
          >
            <Text className="text-milk text-xs font-bold">{stackCount}</Text>
          </View>
          <Pressable
            onPress={onRemove}
            disabled={!canRemove}
            hitSlop={HIT_SLOP_MD}
            style={({ pressed }) => [
              pressScale(pressed, 0.9),
              {
                width: 22,
                height: 22,
                borderRadius: 11,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: 'rgba(247,158,137,0.18)',
              },
            ]}
          >
            <Text style={{ color: '#F79E89', fontSize: 13, fontWeight: '700' }}>−</Text>
          </Pressable>
        </View>
      )}

      {/* Bonus */}
      <Text className="text-xs text-ginger font-semibold">+{def.spawn_bonus}%</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// useHoodItems
// ---------------------------------------------------------------------------

function useHoodItems(
  hood: Hood,
  hoodId: string,
  onUpdateHood: (hoodId: string, updated: Hood) => void,
) {
  const handleAdd = useCallback(
    (itemId: string) => {
      onUpdateHood(hoodId, { ...hood, placed_items: addItem(hood, itemId) });
    },
    [hood, hoodId, onUpdateHood],
  );

  const handleRemove = useCallback(
    (itemId: string) => {
      onUpdateHood(hoodId, { ...hood, placed_items: removeItem(hood, itemId) });
    },
    [hood, hoodId, onUpdateHood],
  );

  const stackCounts = useMemo(
    () =>
      hood.placed_items.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [hood.placed_items],
  );

  return { stackCounts, handleAdd, handleRemove };
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function HoodScreen({ hoodId, hood, onUpdateHood, onBack, progression, onUpdateProgression, userId }: HoodScreenProps) {
  const [isNight, setIsNight] = useState(false);
  const [showShop, setShowShop] = useState(false);
  // The cats that visit your Hood are the ones in your own Cat-a-log.
  const { perchSprites, loading: spritesLoading } = usePerchSprites(userId);

  // Resolve active theme and environment from Hood settings
  const activeTheme = useMemo(
    () => getThemeById(hood.active_theme_id ?? '') ?? DEFAULT_THEME,
    [hood.active_theme_id],
  );
  const activeEnv = useMemo(
    () => getEnvironmentById(hood.active_environment_id ?? '') ?? DEFAULT_ENVIRONMENT,
    [hood.active_environment_id],
  );

  // Environment may force a time-of-day
  const effectiveIsNight = useMemo(() => {
    if (activeEnv.forced_time_of_day === 'night') return true;
    if (activeEnv.forced_time_of_day === 'day') return false;
    return isNight;
  }, [activeEnv, isNight]);

  const themeColors = useMemo(() => ({
    skyTop: activeTheme.sky_colors[0],
    skyBottom: activeTheme.sky_colors[1],
    ground: activeTheme.ground_color,
    accent: activeTheme.accent_color,
  }), [activeTheme]);

  const { stackCounts, handleAdd, handleRemove } = useHoodItems(
    hood,
    hoodId,
    onUpdateHood,
  );

  // ── Apartment (slot-based) mode ─────────────────────────────────────────
  const isApartment = activeEnv.env_id === 'env_apartment';
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);

  // Existing hoods without an arrangement get a derived first-fit layout;
  // it's only persisted once the user actually places/removes something.
  const placements = useMemo(
    () => hood.item_placements ?? autoAssignPlacements(hood.placed_items),
    [hood.item_placements, hood.placed_items],
  );

  // In apartment mode the slots are the source of truth for what's active.
  const effectiveItems = useMemo(
    () => (isApartment ? Object.values(placements) : hood.placed_items),
    [isApartment, placements, hood.placed_items],
  );

  const writePlacements = useCallback(
    (next: Record<string, string>) => {
      onUpdateHood(hoodId, {
        ...hood,
        item_placements: next,
        placed_items: Object.values(next),
      });
    },
    [hood, hoodId, onUpdateHood],
  );

  const handlePlaceItem = useCallback(
    (slotId: string, itemId: string) => {
      writePlacements({ ...placements, [slotId]: itemId });
      setPickerSlotId(null);
    },
    [placements, writePlacements],
  );

  const handlePressPlacedItem = useCallback(
    (slotId: string) => {
      const itemId = placements[slotId];
      const def = PLACEABLE_ITEMS.find((i) => i.item_id === itemId);
      if (!def) return;
      Alert.alert(`${def.emoji} ${def.label}`, 'Remove it from this spot?', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const next = { ...placements };
            delete next[slotId];
            writePlacements(next);
          },
        },
      ]);
    },
    [placements, writePlacements],
  );

  const pickerSlot = pickerSlotId ? getSlotById(pickerSlotId) : undefined;
  const attraction = useMemo(() => getAttractionProfile(effectiveItems), [effectiveItems]);

  const spawnResult = useMemo(
    () => calculateSpawnChances(effectiveItems, activeEnv.spawn_multiplier),
    [effectiveItems, activeEnv.spawn_multiplier],
  );

  // Shop handlers
  const handleSelectTheme = useCallback((themeId: string) => {
    const updated = setActiveTheme(progression, themeId);
    onUpdateProgression(updated);
    onUpdateHood(hoodId, { ...hood, active_theme_id: themeId });
  }, [progression, onUpdateProgression, onUpdateHood, hoodId, hood]);

  const handleSelectEnvironment = useCallback((envId: string) => {
    onUpdateHood(hoodId, { ...hood, active_environment_id: envId });
  }, [onUpdateHood, hoodId, hood]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Shop modal */}
      <Modal
        visible={showShop}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowShop(false)}
      >
        <ShopScreen
          progression={progression}
          activeHoodThemeId={hood.active_theme_id}
          activeHoodEnvId={hood.active_environment_id}
          onUpdateProgression={onUpdateProgression}
          onSelectTheme={handleSelectTheme}
          onSelectEnvironment={handleSelectEnvironment}
          onClose={() => setShowShop(false)}
        />
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View className="flex-row justify-between items-center px-lg py-md border-b border-border bg-card-bg">
        <View className="flex-row items-center gap-md">
          {/* Back — 44×44 minimum via hitSlop + scale feedback */}
          <Pressable
            onPress={onBack}
            hitSlop={HIT_SLOP_MD}
            style={({ pressed }) => [
              pressScale(pressed),
              { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
            ]}
          >
            <Text className="text-ginger font-bold text-lg">←</Text>
          </Pressable>

          <View>
            <Text className="text-xl font-bold text-text-primary font-display">
              {hood.name}
            </Text>
            <Text className="text-xs text-text-secondary font-sans">
              {activeEnv.icon} {activeEnv.name}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Shop button */}
          <Pressable
            onPress={() => setShowShop(true)}
            style={({ pressed }) => [
              pressScale(pressed, 0.94),
              {
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 99,
                minHeight: 36,
                backgroundColor: '#FFE8DC',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              },
            ]}
          >
            <Text style={{ fontSize: 13 }}>🛍</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#E67035' }}>Shop</Text>
          </Pressable>

          {/* Day / Night toggle — hidden when env forces time */}
          {!activeEnv.forced_time_of_day && (
            <Pressable
              onPress={() => setIsNight((v) => !v)}
              style={({ pressed }) => [
                pressScale(pressed, 0.94),
                {
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 99,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  backgroundColor: isNight ? '#2C2A29' : '#F8D49B',
                },
              ]}
            >
              <Text style={{ fontSize: 14 }}>{isNight ? '🌙' : '☀️'}</Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: isNight ? '#FFFFFF' : '#2C2A29',
                }}
              >
                {isNight ? 'Night' : 'Day'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Canvas — slot-based apartment interior or free-form outdoor scene */}
        {isApartment ? (
          <ApartmentCanvas
            placements={placements}
            expectedCats={spawnResult.expectedCats}
            isNight={effectiveIsNight}
            spriteIds={perchSprites}
            spritesLoading={spritesLoading}
            themeColors={themeColors}
            onPressEmptySlot={setPickerSlotId}
            onPressPlacedItem={handlePressPlacedItem}
          />
        ) : (
          <HoodCanvas
            placedItems={hood.placed_items}
            expectedCats={spawnResult.expectedCats}
            isNight={effectiveIsNight}
            spriteIds={perchSprites}
            spritesLoading={spritesLoading}
            themeColors={themeColors}
          />
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Spawn meter — shadow depth, no hard border ring                  */}
        {/* ---------------------------------------------------------------- */}
        <View
          style={[
            CARD_SHADOW,
            { backgroundColor: '#FFFFFF', borderRadius: 20, marginHorizontal: 24, marginTop: 12, padding: 16 },
          ]}
        >
          <SpawnMeter result={spawnResult} />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Who's coming by — attraction profile from the item mix           */}
        {/* ---------------------------------------------------------------- */}
        {attraction.length > 0 && (
          <View
            style={[
              CARD_SHADOW,
              { backgroundColor: '#FFFFFF', borderRadius: 20, marginHorizontal: 24, marginTop: 12, padding: 16 },
            ]}
          >
            <Text className="text-sm font-bold text-text-primary font-display" style={{ marginBottom: 10 }}>
              Who's coming by
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {attraction.map((note) => (
                <View
                  key={note.category}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: '#FAF6F0', borderRadius: 99,
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderWidth: 1, borderColor: 'rgba(234,227,218,0.8)',
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{note.emoji}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#706B67' }}>
                    {note.blurb}
                    {note.count > 1 ? ` ×${note.count}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Item tray (free-form envs) / placement hint (apartment)          */}
        {/* ---------------------------------------------------------------- */}
        {isApartment ? (
          <View
            style={[
              CARD_SHADOW,
              { backgroundColor: '#FFFFFF', borderRadius: 20, marginHorizontal: 24, marginTop: 12, marginBottom: 32, padding: 16 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text className="text-base font-bold text-text-primary font-display">
                Arrange the Room
              </Text>
              <View style={{ backgroundColor: '#FFE8DC', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#E67035' }}>
                  {Object.keys(placements).length}/{APARTMENT_SLOTS.length} spots filled
                </Text>
              </View>
            </View>
            <Text className="text-xs text-text-secondary font-sans mt-xs" style={{ lineHeight: 18 }}>
              Tap a glowing spot in the room to place an item — each spot only fits
              certain kinds. Tap a placed item to remove it.
            </Text>
          </View>
        ) : (
          <View
            style={[
              CARD_SHADOW,
              { backgroundColor: '#FFFFFF', borderRadius: 20, marginHorizontal: 24, marginTop: 12, marginBottom: 32 },
            ]}
          >
            <View
              className="px-md pt-md pb-sm"
              style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(234,227,218,0.6)' }}
            >
              <Text className="text-base font-bold text-text-primary font-display">
                Place Items
              </Text>
              <Text className="text-xs text-text-secondary font-sans mt-xs">
                Items attract more cats to your Hood
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
            >
              {PLACEABLE_ITEMS.map((def) => {
                const count = stackCounts[def.item_id] ?? 0;
                const locked = !isItemUnlocked(progression, def.item_id);
                return (
                  <ItemPill
                    key={def.item_id}
                    def={def}
                    stackCount={count}
                    isLocked={locked}
                    canAdd={!locked && canAddItem(hood, def.item_id)}
                    canRemove={count > 0}
                    onAdd={() => handleAdd(def.item_id)}
                    onRemove={() => handleRemove(def.item_id)}
                    onPressLocked={() => setShowShop(true)}
                  />
                );
              })}
            </ScrollView>

            {hood.placed_items.length === 0 && (
              <View className="pb-md px-md items-center">
                <Text className="text-xs text-text-secondary font-sans text-center">
                  Tap an item above to place it in your Hood 🐾
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ------------------------------------------------------------------ */}
      {/* Slot item-picker sheet (apartment mode)                             */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        visible={pickerSlot != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerSlotId(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(20,14,8,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setPickerSlotId(null)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: '#FAF6F0',
              borderTopLeftRadius: 26, borderTopRightRadius: 26,
              padding: 20, paddingBottom: 30, maxHeight: 420,
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#EAE3DA', alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C2A29' }}>
              {pickerSlot?.label ?? ''}
            </Text>
            <Text style={{ fontSize: 12, color: '#706B67', marginTop: 3, marginBottom: 14 }}>
              This spot fits: {pickerSlot?.accepts.join(' · ')}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 6 }}>
                {pickerSlot &&
                  PLACEABLE_ITEMS.filter((i) => pickerSlot.accepts.includes(i.category)).map((def) => {
                    const unlocked = isItemUnlocked(progression, def.item_id);
                    const placedCount = effectiveItems.filter((id) => id === def.item_id).length;
                    const atCap = placedCount >= def.max_stack;
                    const disabled = unlocked && atCap;

                    return (
                      <Pressable
                        key={def.item_id}
                        disabled={disabled}
                        onPress={() =>
                          unlocked
                            ? handlePlaceItem(pickerSlot.slot_id, def.item_id)
                            : (setPickerSlotId(null), setShowShop(true))
                        }
                        style={({ pressed }) => [
                          pressScale(pressed, 0.95),
                          {
                            width: 96, borderRadius: 14, paddingVertical: 10,
                            alignItems: 'center', gap: 2,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1.5,
                            borderColor: unlocked ? 'rgba(234,227,218,0.9)' : 'rgba(234,227,218,0.6)',
                            opacity: disabled ? 0.4 : unlocked ? 1 : 0.65,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 24 }}>{unlocked ? def.emoji : '🔒'}</Text>
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 10, fontWeight: '700', color: '#2C2A29', maxWidth: 86 }}
                        >
                          {def.label}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: unlocked ? '#E67035' : '#B0ABA6' }}>
                          {disabled ? 'Max placed' : unlocked ? `+${def.spawn_bonus}%` : `${def.cost} 🐾 in Shop`}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
