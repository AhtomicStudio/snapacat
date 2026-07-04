/**
 * ShopScreen — Three-tab shop for Themes, Environments, and Items.
 *
 * Tabs: 🎨 Themes | 🌍 Environments | 🧸 Items
 * Sticky header shows the user's current PawPoints balance.
 * Purchases update progression state and propagate via onUpdateProgression.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  UIManager,
  View,
} from 'react-native';
import type { UserProgression, ItemTier } from '../types';
import { THEMES, getThemeById } from '../config/themes';
import { ENVIRONMENTS, getEnvironmentById } from '../config/environments';
import {
  PLACEABLE_ITEMS,
  type PlaceableItemDef,
} from '../utils/spawnCalculator';
import {
  purchaseTheme,
  purchaseItem,
  setActiveTheme,
  isThemeUnlocked,
  isItemUnlocked,
  isEnvironmentUnlocked,
} from '../utils/progressionEngine';
import { ThemePreviewCard } from '../components/ThemePreviewCard';
import { EnvironmentCard } from '../components/EnvironmentCard';
import { ShopItemCard } from '../components/ShopItemCard';
import { CARD_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShopTab = 'themes' | 'environments' | 'items';
type ItemFilter = 'all' | ItemTier;

export interface ShopScreenProps {
  progression: UserProgression;
  /** Active theme for the current Hood (may differ from global). */
  activeHoodThemeId?: string | null;
  /** Active environment for the current Hood. */
  activeHoodEnvId?: string | null;
  onUpdateProgression: (updated: UserProgression) => void;
  onSelectTheme: (themeId: string) => void;
  onSelectEnvironment: (envId: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabBar({
  active,
  onSelect,
}: {
  active: ShopTab;
  onSelect: (t: ShopTab) => void;
}) {
  const tabs: { id: ShopTab; label: string }[] = [
    { id: 'themes', label: '🎨 Themes' },
    { id: 'environments', label: '🌍 Envs' },
    { id: 'items', label: '🧸 Items' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#FAF6F0',
        borderRadius: 14,
        padding: 4,
        marginHorizontal: 20,
        marginBottom: 12,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              onSelect(tab.id);
            }}
            style={({ pressed }) => [
              pressScale(pressed, 0.97),
              {
                flex: 1,
                paddingVertical: 9,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                ...(isActive
                  ? {
                      shadowColor: '#2C2A29',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 4,
                      elevation: 2,
                    }
                  : {}),
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: isActive ? '700' : '500',
                color: isActive ? '#2C2A29' : '#706B67',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ItemFilterBar({
  active,
  onSelect,
}: {
  active: ItemFilter;
  onSelect: (f: ItemFilter) => void;
}) {
  const filters: { id: ItemFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'common', label: 'Common' },
    { id: 'rare', label: 'Rare' },
    { id: 'legendary', label: '✦ Legendary' },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}
    >
      {filters.map((f) => {
        const isActive = f.id === active;
        return (
          <Pressable
            key={f.id}
            onPress={() => onSelect(f.id)}
            style={({ pressed }) => [
              pressScale(pressed, 0.95),
              {
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 99,
                backgroundColor: isActive ? '#FF8E53' : '#FFFFFF',
                borderWidth: 1.5,
                borderColor: isActive ? '#FF8E53' : 'rgba(234,227,218,0.8)',
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: isActive ? '#FFFFFF' : '#706B67',
              }}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Shake animation hook
// ---------------------------------------------------------------------------

function useShake() {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  return { shakeAnim, shake };
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ShopScreen({
  progression,
  activeHoodThemeId,
  activeHoodEnvId,
  onUpdateProgression,
  onSelectTheme,
  onSelectEnvironment,
  onClose,
}: ShopScreenProps) {
  const [activeTab, setActiveTab] = useState<ShopTab>('themes');
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');
  const { shakeAnim, shake } = useShake();

  // ---------------------------------------------------------------------------
  // Purchase handlers
  // ---------------------------------------------------------------------------

  const handlePurchaseTheme = useCallback(
    (themeId: string, cost: number) => {
      const theme = getThemeById(themeId);
      if (!theme) return;

      if (isThemeUnlocked(progression, themeId)) {
        // Already owned — just apply it
        onSelectTheme(themeId);
        return;
      }

      Alert.alert(
        `Unlock ${theme.name}?`,
        `This will cost 🐾 ${cost} PawPoints. You have 🐾 ${progression.paw_points}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unlock!',
            onPress: () => {
              try {
                const updated = purchaseTheme(progression, themeId, cost);
                onUpdateProgression(updated);
                onSelectTheme(themeId);
              } catch {
                shake();
                Alert.alert('Not enough 🐾', 'Keep logging Field Notes to earn more PawPoints!');
              }
            },
          },
        ],
      );
    },
    [progression, onUpdateProgression, onSelectTheme, shake],
  );

  const handlePurchaseItem = useCallback(
    (item: PlaceableItemDef) => {
      if (isItemUnlocked(progression, item.item_id)) return;

      Alert.alert(
        `Unlock ${item.label}?`,
        `Cost: 🐾 ${item.cost}  •  You have: 🐾 ${progression.paw_points}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unlock!',
            onPress: () => {
              try {
                const updated = purchaseItem(progression, item.item_id, item.cost);
                onUpdateProgression(updated);
              } catch {
                shake();
                Alert.alert('Not enough 🐾', 'Keep logging Field Notes to earn more PawPoints!');
              }
            },
          },
        ],
      );
    },
    [progression, onUpdateProgression, shake],
  );

  const handlePurchaseEnvironment = useCallback(
    (envId: string, cost: number) => {
      const env = getEnvironmentById(envId);
      if (!env) return;

      if (isEnvironmentUnlocked(progression, envId)) {
        onSelectEnvironment(envId);
        return;
      }

      Alert.alert(
        `Unlock ${env.name}?`,
        `Cost: 🐾 ${cost}  •  You have: 🐾 ${progression.paw_points}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unlock!',
            onPress: () => {
              try {
                const updated = purchaseItem(progression, envId, cost);
                onUpdateProgression(updated);
                onSelectEnvironment(envId);
              } catch {
                shake();
                Alert.alert('Not enough 🐾', 'Keep logging Field Notes to earn more PawPoints!');
              }
            },
          },
        ],
      );
    },
    [progression, onUpdateProgression, onSelectEnvironment, shake],
  );

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredItems = useMemo<PlaceableItemDef[]>(() => {
    if (itemFilter === 'all') return PLACEABLE_ITEMS;
    return PLACEABLE_ITEMS.filter((i) => i.tier === itemFilter);
  }, [itemFilter]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF6F0' }}>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 14,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(234,227,218,0.6)',
          ...CARD_SHADOW,
        }}
      >
        <View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#2C2A29' }}>
            🛍 Shop
          </Text>
          <Text style={{ fontSize: 12, color: '#706B67', marginTop: 1 }}>
            Unlock themes, environments & items
          </Text>
        </View>

        {/* PawPoints balance — animated shake target */}
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <View
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FF8E53',
                borderRadius: 99,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              },
            ]}
          >
            <Text style={{ fontSize: 14 }}>🐾</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
              {progression.paw_points}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Tab bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <View style={{ paddingTop: 14 }}>
        <TabBar active={activeTab} onSelect={setActiveTab} />
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Tab content — single ScrollView owns all three tabs               */}
      {/* ------------------------------------------------------------------ */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        // Horizontal padding is applied per-tab so the items filter bar
        // can bleed edge-to-edge while theme/env cards stay inset.
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Themes tab ─────────────────────────────────────────────────── */}
        {activeTab === 'themes' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text
              style={{ fontSize: 13, color: '#706B67', marginBottom: 12, lineHeight: 18 }}
            >
              Themes change how your Hood looks — sky, ground, and accent colours. Purely cosmetic.
            </Text>
            {THEMES.map((theme) => {
              const owned = isThemeUnlocked(progression, theme.theme_id);
              // Fall back to the progression's global active theme when the Hood
              // hasn't explicitly set one yet.
              const isActive =
                (activeHoodThemeId ?? progression.active_theme_id ?? 'theme_default') ===
                theme.theme_id;
              return (
                <ThemePreviewCard
                  key={theme.theme_id}
                  theme={theme}
                  isOwned={owned}
                  isActive={isActive}
                  canAfford={progression.paw_points >= theme.cost}
                  onPress={() => handlePurchaseTheme(theme.theme_id, theme.cost)}
                />
              );
            })}
          </View>
        )}

        {/* ── Environments tab ───────────────────────────────────────────── */}
        {activeTab === 'environments' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text
              style={{ fontSize: 13, color: '#706B67', marginBottom: 12, lineHeight: 18 }}
            >
              Environments set the vibe and boost cat spawn rates. Some lock you into day or night mode.
            </Text>
            {ENVIRONMENTS.map((env) => {
              const owned = isEnvironmentUnlocked(progression, env.env_id);
              // When the Hood has no explicit env, the default Back Alley is active.
              const isActive =
                (activeHoodEnvId ?? 'env_alley') === env.env_id;
              return (
                <EnvironmentCard
                  key={env.env_id}
                  env={env}
                  isOwned={owned}
                  isActive={isActive}
                  canAfford={progression.paw_points >= env.cost}
                  onPress={() => handlePurchaseEnvironment(env.env_id, env.cost)}
                />
              );
            })}
          </View>
        )}

        {/* ── Items tab ──────────────────────────────────────────────────── */}
        {activeTab === 'items' && (
          <>
            <View style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
              <Text style={{ fontSize: 13, color: '#706B67', lineHeight: 18 }}>
                Items placed in your Hood attract more cats. Legendary items have the biggest bonuses.
              </Text>
            </View>
            {/* Filter bar bleeds full-width — it manages its own horizontal padding */}
            <ItemFilterBar active={itemFilter} onSelect={setItemFilter} />
            <View style={{ paddingHorizontal: 20 }}>
              {filteredItems.map((item) => {
                const owned = isItemUnlocked(progression, item.item_id);
                return (
                  <ShopItemCard
                    key={item.item_id}
                    item={item}
                    isOwned={owned}
                    canAfford={progression.paw_points >= item.cost}
                    onPress={() => handlePurchaseItem(item)}
                  />
                );
              })}
              {filteredItems.length === 0 && (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#706B67' }}>
                    No items in this tier yet.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Close button */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 16,
          paddingTop: 8,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: 'rgba(234,227,218,0.6)',
        }}
      >
        <Pressable
          onPress={onClose}
          hitSlop={HIT_SLOP_MD}
          style={({ pressed }) => [
            pressScale(pressed, 0.97),
            {
              backgroundColor: '#FAF6F0',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(234,227,218,0.8)',
            },
          ]}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#706B67' }}>
            Done
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
