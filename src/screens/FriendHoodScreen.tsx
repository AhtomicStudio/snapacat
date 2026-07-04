import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getFriendHoods } from '../services/dbService';
import { PLACEABLE_ITEMS, calculateSpawnChances } from '../utils/spawnCalculator';
import { HoodCanvas, SpawnMeter } from '../components/HoodCanvas';
import { ApartmentCanvas } from '../components/ApartmentCanvas';
import { autoAssignPlacements } from '../config/apartment';
import { getEnvironmentById } from '../config/environments';
import type { Hood } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FriendHoodScreenProps {
  friendUid: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

interface FriendData {
  username: string;
  hoods: Record<string, Hood>;
}

// ---------------------------------------------------------------------------
// Hood selector pill
// ---------------------------------------------------------------------------

function HoodPill({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className={`rounded-full px-md py-xs border mr-sm ${
        isActive
          ? 'bg-ginger border-ginger'
          : 'bg-background border-border'
      }`}
    >
      <Text
        className={`text-xs font-semibold font-sans ${
          isActive ? 'text-milk' : 'text-text-secondary'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Read-only item list — shows what's placed, no add/remove controls
// ---------------------------------------------------------------------------

function ReadOnlyItemList({ placedItems }: { placedItems: string[] }) {
  if (placedItems.length === 0) return null;

  // Deduplicate for display
  const unique = Array.from(new Set(placedItems));

  return (
    <View className="bg-card-bg rounded-2xl border border-border mx-lg mt-md shadow-card">
      <View className="px-md pt-md pb-sm border-b border-border flex-row items-center gap-xs">
        <Text className="text-base font-bold text-text-primary font-display">
          Placed Items
        </Text>
        <View className="bg-ginger-light rounded-full px-sm py-xs">
          <Text className="text-xs font-semibold text-ginger-dark">Read-only</Text>
        </View>
      </View>

      <View className="flex-row flex-wrap px-md py-md gap-sm">
        {unique.map((id) => {
          const def = PLACEABLE_ITEMS.find((i) => i.item_id === id);
          if (!def) return null;
          const count = placedItems.filter((p) => p === id).length;
          return (
            <View
              key={id}
              className="flex-row items-center gap-xs bg-background border border-border rounded-xl px-sm py-xs"
            >
              <Text style={{ fontSize: 16 }}>{def.emoji}</Text>
              <View>
                <Text className="text-xs font-semibold text-text-primary font-sans">
                  {def.label}
                  {count > 1 ? ` ×${count}` : ''}
                </Text>
                <Text className="text-xs text-ginger font-sans">+{def.spawn_bonus}% spawn</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function FriendHoodScreen({ friendUid, onBack }: FriendHoodScreenProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [friendData, setFriendData] = useState<FriendData | null>(null);
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(null);
  const [isNight, setIsNight] = useState(false);

  // ---- Fetch friend data ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      try {
        const result = await getFriendHoods(friendUid);
        if (cancelled) return;
        if (!result) {
          setLoadState('not_found');
          return;
        }
        setFriendData(result);
        // Auto-select the first Hood
        const firstId = Object.keys(result.hoods)[0] ?? null;
        setSelectedHoodId(firstId);
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    load();
    return () => { cancelled = true; };
  }, [friendUid]);

  // ---- Derived state ----
  const selectedHood = useMemo<Hood | null>(() => {
    if (!friendData || !selectedHoodId) return null;
    return friendData.hoods[selectedHoodId] ?? null;
  }, [friendData, selectedHoodId]);

  const isApartment = useMemo(
    () =>
      getEnvironmentById(selectedHood?.active_environment_id ?? '')?.env_id === 'env_apartment',
    [selectedHood],
  );

  const placements = useMemo(
    () =>
      selectedHood
        ? selectedHood.item_placements ?? autoAssignPlacements(selectedHood.placed_items)
        : {},
    [selectedHood],
  );

  const spawnResult = useMemo(
    () =>
      calculateSpawnChances(
        isApartment ? Object.values(placements) : selectedHood?.placed_items ?? [],
      ),
    [selectedHood, isApartment, placements],
  );

  const hoodEntries = useMemo(
    () => (friendData ? Object.entries(friendData.hoods) : []),
    [friendData],
  );

  // ---- Render states ----
  if (loadState === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color="#FF8E53" />
        <Text className="text-sm text-text-secondary font-sans mt-md">
          Fetching Hood…
        </Text>
      </SafeAreaView>
    );
  }

  if (loadState === 'not_found') {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center px-lg py-md border-b border-border bg-card-bg">
          <TouchableOpacity onPress={onBack} className="pr-md">
            <Text className="text-ginger font-bold text-lg">←</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-text-primary font-display">
            Friend Not Found
          </Text>
        </View>
        <View className="flex-1 justify-center items-center px-xl">
          <Text className="text-4xl mb-md">🐾</Text>
          <Text className="text-base font-semibold text-text-primary font-display text-center">
            No user found for this UID
          </Text>
          <Text className="text-sm text-text-secondary font-sans text-center mt-xs">
            Double-check the UID and try again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center px-lg py-md border-b border-border bg-card-bg">
          <TouchableOpacity onPress={onBack} className="pr-md">
            <Text className="text-ginger font-bold text-lg">←</Text>
          </TouchableOpacity>
          <Text className="text-xl font-bold text-text-primary font-display">
            Error
          </Text>
        </View>
        <View className="flex-1 justify-center items-center px-xl">
          <Text className="text-base font-semibold text-error font-display text-center">
            Failed to load this Hood.
          </Text>
          <Text className="text-sm text-text-secondary font-sans text-center mt-xs">
            Check your connection and try again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View className="flex-row justify-between items-center px-lg py-md border-b border-border bg-card-bg">
        <View className="flex-row items-center gap-md">
          <TouchableOpacity onPress={onBack} className="pr-sm">
            <Text className="text-ginger font-bold text-lg">←</Text>
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-text-primary font-display">
              {friendData?.username ?? friendUid}
            </Text>
            <Text className="text-xs text-text-secondary font-sans">
              Viewing their Hood 👁
            </Text>
          </View>
        </View>

        {/* Day / Night toggle — viewer can still switch the lighting */}
        <TouchableOpacity
          onPress={() => setIsNight((v) => !v)}
          activeOpacity={0.75}
          className={`rounded-full px-md py-sm flex-row items-center gap-xs ${
            isNight ? 'bg-charcoal' : 'bg-warning'
          }`}
        >
          <Text style={{ fontSize: 14 }}>{isNight ? '🌙' : '☀️'}</Text>
          <Text
            className={`text-xs font-semibold ${
              isNight ? 'text-milk' : 'text-text-primary'
            }`}
          >
            {isNight ? 'Night' : 'Day'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* ---------------------------------------------------------------- */}
        {/* Hood selector (hidden when the friend has only one Hood)         */}
        {/* ---------------------------------------------------------------- */}
        {hoodEntries.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
          >
            {hoodEntries.map(([id, hood]) => (
              <HoodPill
                key={id}
                label={hood.name}
                isActive={id === selectedHoodId}
                onPress={() => setSelectedHoodId(id)}
              />
            ))}
          </ScrollView>
        )}

        {selectedHood ? (
          <>
            {/* Hood name label (only shown when no multi-hood selector) */}
            {hoodEntries.length === 1 && (
              <View className="px-lg pt-lg pb-xs">
                <Text className="text-base font-bold text-text-primary font-display">
                  {selectedHood.name}
                </Text>
              </View>
            )}

            {/* Canvas — read-only badge, no mutation controls */}
            {isApartment ? (
              <ApartmentCanvas
                placements={placements}
                expectedCats={spawnResult.expectedCats}
                isNight={isNight}
                readOnly
              />
            ) : (
              <HoodCanvas
                placedItems={selectedHood.placed_items}
                expectedCats={spawnResult.expectedCats}
                isNight={isNight}
                readOnly
              />
            )}

            {/* Spawn meter — display only */}
            <View className="bg-card-bg rounded-2xl border border-border mx-lg mt-md p-md shadow-card">
              <SpawnMeter result={spawnResult} />
            </View>

            {/* Read-only item list */}
            <ReadOnlyItemList placedItems={selectedHood.placed_items} />

            {/* Empty hood message */}
            {selectedHood.placed_items.length === 0 && (
              <View className="mx-lg mt-md mb-xl bg-card-bg rounded-2xl border border-border p-md items-center">
                <Text className="text-sm text-text-secondary font-sans text-center">
                  No items placed here yet — cats are visiting on base chance only.
                </Text>
              </View>
            )}

            <View className="h-xl" />
          </>
        ) : (
          <View className="flex-1 justify-center items-center py-xxl">
            <Text className="text-sm text-text-secondary font-sans">
              This friend has no Hoods yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
