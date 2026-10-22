/**
 * The Hood — now the app's home screen.
 *
 * WHAT CHANGED AND WHY
 *
 * SnapaCat used to open on a dashboard, put a "My Hoods / Manage items in your
 * customised locations" list behind a tab, and only then let you into a 260px
 * preview of the scene with three cards of statistics stacked beneath it. Three
 * taps and a settings screen before you saw a cat.
 *
 * The games this is aiming at open into the yard. There is no lobby, because
 * the yard is the point — the whole loop is "leave, come back, see who turned
 * up", and anything between the app icon and that moment is friction on the one
 * thing the player came for.
 *
 * So: cold launch lands here, the scene is full-bleed, and everything that used
 * to be a card is either in the drawer or gone.
 *
 * WHAT WENT AWAY
 *
 *   - the spawn meter and every percentage on it (see utils/hoodMood)
 *   - the "~6 of 6 cat slots active" readout
 *   - the +/− item steppers — you tap the thing in the scene to put it away
 *   - the Day/Night toggle — the clock knows (see utils/timeOfDay)
 *   - the bottom tab bar, replaced by three floating buttons
 *
 * The maths behind all of it is untouched. spawnCalculator still decides
 * everything; it just stopped narrating.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Hood, UserProgression } from '../types';
import {
  PLACEABLE_ITEMS,
  addItem,
  removeItem,
  calculateSpawnChances,
  canAddItem,
  getAttractionProfile,
} from '../utils/spawnCalculator';
import { usePerchSprites } from '../hooks/usePerchSprites';
import { HoodScene } from '../components/HoodScene';
import { HoodSheet } from '../components/HoodSheet';
import { CatSprite } from '../components/CatSprite';
import { Touchable } from '../components/Touchable';
import { ApartmentCanvas } from '../components/ApartmentCanvas';
import { APARTMENT_SLOTS, autoAssignPlacements, getSlotById } from '../config/apartment';
import { HIT_SLOP_MD } from '../utils/styles';
import { ShopScreen } from './ShopScreen';
import { getThemeById, DEFAULT_THEME } from '../config/themes';
import { getEnvironmentById, DEFAULT_ENVIRONMENT } from '../config/environments';
import { isItemUnlocked, setActiveTheme } from '../utils/progressionEngine';
import { resolveTimeOfDay, isDark, skyPalette, timeLabel, type TimeOfDay } from '../utils/timeOfDay';
import {
  describeActivity,
  describeAttraction,
  describeVisitReason,
  EMPTY_HOOD_HINT,
} from '../utils/hoodMood';
import { getSpriteById, RARITY_LABELS, RARITY_STARS } from '../utils/spriteLibrary';
import { getPropSheet } from '../assets/props';
import { font } from '../theme';

const SURFACE = '#FAF6F0';
const INK = '#2C2A29';
const MUTED = '#706B67';
const GINGER = '#FF8E53';

// ---------------------------------------------------------------------------
// Floating chrome
// ---------------------------------------------------------------------------

/**
 * A round glass button.
 *
 * Translucent rather than solid on purpose: the scene should read continuously
 * behind the controls, which is what stops them feeling like a toolbar bolted
 * over a picture.
 */
function GlassButton({
  icon,
  label,
  onPress,
  dark,
  size = 54,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  dark: boolean;
  size?: number;
}) {
  return (
    <Touchable
      onPress={onPress}
      hitSlop={HIT_SLOP_MD}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.9}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? 'rgba(28,32,58,0.72)' : 'rgba(255,252,247,0.86)',
        borderWidth: 1,
        borderColor: dark ? 'rgba(180,192,255,0.22)' : 'rgba(255,255,255,0.9)',
        shadowColor: '#2C2A29',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <Text style={{ fontSize: size * 0.4 }}>{icon}</Text>
    </Touchable>
  );
}

function GlassPill({
  children,
  dark,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  dark: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 99,
    minHeight: 40,
    backgroundColor: dark ? 'rgba(28,32,58,0.72)' : 'rgba(255,252,247,0.86)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(180,192,255,0.22)' : 'rgba(255,255,255,0.9)',
  };

  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {children}
    </Touchable>
  );
}

// ---------------------------------------------------------------------------
// Item tray
// ---------------------------------------------------------------------------

/**
 * One goodie in the drawer.
 *
 * Shows a rarity dot and, when copies are out, a count — and deliberately not
 * the spawn bonus. Publishing "+15%" turns choosing a goodie into a sorting
 * problem with one right answer; withholding it keeps the answer something you
 * find out by putting the thing down and waiting.
 */
function TrayItem({
  itemId,
  emoji,
  label,
  tier,
  count,
  locked,
  full,
  onPress,
}: {
  itemId: string;
  emoji: string;
  label: string;
  tier: string;
  count: number;
  locked: boolean;
  full: boolean;
  onPress: () => void;
}) {
  const art = getPropSheet(itemId);
  const tint =
    tier === 'legendary' ? '#E8A020' : tier === 'rare' ? '#8B6FD6' : '#9AA0A6';

  return (
    <Touchable
      onPress={onPress}
      disabled={!locked && full}
      accessibilityRole="button"
      accessibilityLabel={
        locked ? `${label}, locked` : full ? `${label}, all out` : `Put out a ${label}`
      }
      scaleTo={0.93}
      style={{
        width: 78,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: count > 0 ? 'rgba(255,142,83,0.55)' : 'rgba(234,227,218,0.9)',
        opacity: locked ? 0.6 : full ? 0.42 : 1,
      }}
    >
      <View>
        {locked ? (
          <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24 }}>🔒</Text>
          </View>
        ) : art ? (
          // The tray shows the same art as the scene, so choosing a goodie and
          // seeing it land are the same picture.
          <Image source={art} resizeMode="contain" fadeDuration={0} style={{ width: 44, height: 44 }} />
        ) : (
          <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
          </View>
        )}
        {count > 0 && (
          <View
            style={{
              position: 'absolute',
              right: -10,
              top: -4,
              minWidth: 20,
              height: 20,
              paddingHorizontal: 5,
              borderRadius: 10,
              backgroundColor: GINGER,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: font.bold}}>{count}</Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 10,
          fontFamily: font.medium,
          color: INK,
          textAlign: 'center',
          marginTop: 6,
          minHeight: 26,
        }}
      >
        {label}
      </Text>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint, marginTop: 1 }} />
    </Touchable>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HoodHomeScreenProps {
  userId: string;
  username: string;
  /** Every Hood the user owns — powers the switcher. */
  hoods: Record<string, Hood>;
  /** Which Hood is on screen. */
  hoodId: string;
  hood: Hood;
  onSwitchHood: (hoodId: string) => void;
  onCreateHood: (name: string) => Promise<void>;
  onUpdateHood: (hoodId: string, updated: Hood) => void;
  progression: UserProgression;
  onUpdateProgression: (updated: UserProgression) => void;
  onOpenCamera: () => void;
  onOpenCatalog: () => void;
  onOpenFriends: () => void;
  /** Opens this Hood's scrapbook. */
  onOpenScrapbook: () => void;
  /** False while another screen is covering the Hood. */
  focused?: boolean;
  /** Injectable for tests — production reads the device clock. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Prefix marking a picker opened from open ground rather than a named slot.
 * The anchor id follows it, so the item lands where the player pointed.
 */
const HOOD_SPOT_PREFIX = 'hood:';

export function HoodHomeScreen({
  userId,
  username,
  hoods,
  hoodId,
  hood,
  onSwitchHood,
  onCreateHood,
  onUpdateHood,
  progression,
  onUpdateProgression,
  onOpenCamera,
  onOpenCatalog,
  onOpenFriends,
  onOpenScrapbook,
  focused = true,
  now,
}: HoodHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const { perchSprites, loading: spritesLoading } = usePerchSprites(userId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [tappedCat, setTappedCat] = useState<{ spriteId?: string; atItemId: string | null } | null>(null);
  /**
   * Which spot the item picker is open for.
   *
   * The apartment uses a real slot id. The Hood has no slots, so tapping
   * one of its vacant spots stores `hood:<anchorId>` here — one sheet
   * serves both screens, and the anchor rides along so the item lands
   * where the player actually pointed.
   */
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);

  const activeTheme = useMemo(
    () => getThemeById(hood.active_theme_id ?? '') ?? DEFAULT_THEME,
    [hood.active_theme_id],
  );
  const activeEnv = useMemo(
    () => getEnvironmentById(hood.active_environment_id ?? '') ?? DEFAULT_ENVIRONMENT,
    [hood.active_environment_id],
  );

  // Time of day comes from the clock. An environment can still override it —
  // that is content (a basement is dark at noon), not a control.
  const time: TimeOfDay = useMemo(() => {
    if (activeEnv.forced_time_of_day === 'night') return 'night';
    if (activeEnv.forced_time_of_day === 'day') return 'day';
    return resolveTimeOfDay(now);
  }, [activeEnv.forced_time_of_day, now]);

  const dark = isDark(time);
  const palette = skyPalette(time);
  const ambience = timeLabel(time);

  /**
   * Only a Hood that has actually CHOSEN a theme overrides the scene palette.
   *
   * `activeTheme` falls back to DEFAULT_THEME, so passing its colours
   * unconditionally meant every Hood got the default theme's green ground and
   * the environment's own material — asphalt for an alley, gravel for a roof —
   * could never be seen. A purchased theme should win; the absence of one
   * should not.
   */
  const themeColors = useMemo(() => {
    if (!hood.active_theme_id || !getThemeById(hood.active_theme_id)) return undefined;
    return {
      skyTop: activeTheme.sky_colors[0],
      skyBottom: activeTheme.sky_colors[1],
      ground: activeTheme.ground_color,
      accent: activeTheme.accent_color,
    };
  }, [activeTheme, hood.active_theme_id]);

  /** ApartmentCanvas has no environment dressing, so it still needs colours. */
  const apartmentThemeColors = useMemo(
    () => ({
      skyTop: activeTheme.sky_colors[0],
      skyBottom: activeTheme.sky_colors[1],
      ground: activeTheme.ground_color,
      accent: activeTheme.accent_color,
    }),
    [activeTheme],
  );

  const isApartment = activeEnv.env_id === 'env_apartment';

  const placements = useMemo(
    () => hood.item_placements ?? autoAssignPlacements(hood.placed_items),
    [hood.item_placements, hood.placed_items],
  );

  const effectiveItems = useMemo(
    () => (isApartment ? Object.values(placements) : hood.placed_items),
    [isApartment, placements, hood.placed_items],
  );

  const spawnResult = useMemo(
    () => calculateSpawnChances(effectiveItems, activeEnv.spawn_multiplier),
    [effectiveItems, activeEnv.spawn_multiplier],
  );
  const attraction = useMemo(() => getAttractionProfile(effectiveItems), [effectiveItems]);

  const stackCounts = useMemo(
    () =>
      effectiveItems.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [effectiveItems],
  );

  const pickerSpotIsHood = pickerSlotId?.startsWith(HOOD_SPOT_PREFIX) ?? false;

  // ── Mutations ────────────────────────────────────────────────────────────
  const writePlacements = useCallback(
    (next: Record<string, string>) => {
      onUpdateHood(hoodId, { ...hood, item_placements: next, placed_items: Object.values(next) });
    },
    [hood, hoodId, onUpdateHood],
  );

  const handleAdd = useCallback(
    (itemId: string) => {
      if (isApartment) {
        // In a slot-based interior an item needs a spot, so the drawer hands off
        // to the room rather than placing blind.
        const slot = APARTMENT_SLOTS.find(
          (s) =>
            !placements[s.slot_id] &&
            s.accepts.includes(PLACEABLE_ITEMS.find((i) => i.item_id === itemId)!.category),
        );
        if (slot) writePlacements({ ...placements, [slot.slot_id]: itemId });
        return;
      }
      onUpdateHood(hoodId, { ...hood, placed_items: addItem(hood, itemId) });
    },
    [hood, hoodId, isApartment, onUpdateHood, placements, writePlacements],
  );

  /**
   * Picking an item back up.
   *
   * No confirmation dialog: it is one tap to put it back, so a modal would cost
   * more than the mistake does. The old screen asked "Remove it from this
   * spot?" for the same action.
   */
  const handleRemove = useCallback(
    (itemId: string) => {
      if (isApartment) {
        const slotId = Object.keys(placements).find((k) => placements[k] === itemId);
        if (!slotId) return;
        const next = { ...placements };
        delete next[slotId];
        writePlacements(next);
        return;
      }
      onUpdateHood(hoodId, { ...hood, placed_items: removeItem(hood, itemId) });
    },
    [hood, hoodId, isApartment, onUpdateHood, placements, writePlacements],
  );

  const handlePlaceInSlot = useCallback(
    (slotId: string, itemId: string) => {
      if (slotId.startsWith(HOOD_SPOT_PREFIX)) {
        const anchorId = slotId.slice(HOOD_SPOT_PREFIX.length);
        const nextItems = addItem(hood, itemId);
        // addItem enforces the per-item and total caps, and returns the
        // list unchanged when it refuses. Pinning an anchor to an item
        // that never went down would strand the spot.
        if (nextItems !== hood.placed_items) {
          onUpdateHood(hoodId, {
            ...hood,
            placed_items: nextItems,
            item_placements: { ...(hood.item_placements ?? {}), [anchorId]: itemId },
          });
        }
        setPickerSlotId(null);
        return;
      }
      writePlacements({ ...placements, [slotId]: itemId });
      setPickerSlotId(null);
    },
    [hood, hoodId, onUpdateHood, placements, writePlacements],
  );

  const handleSelectTheme = useCallback(
    (themeId: string) => {
      onUpdateProgression(setActiveTheme(progression, themeId));
      onUpdateHood(hoodId, { ...hood, active_theme_id: themeId });
    },
    [progression, onUpdateProgression, onUpdateHood, hoodId, hood],
  );

  const handleSelectEnvironment = useCallback(
    (envId: string) => onUpdateHood(hoodId, { ...hood, active_environment_id: envId }),
    [onUpdateHood, hoodId, hood],
  );

  // ── Prose ────────────────────────────────────────────────────────────────
  const activityLine =
    effectiveItems.length === 0 && spawnResult.expectedCats === 0
      ? EMPTY_HOOD_HINT
      : describeActivity(spawnResult.expectedCats);
  const attractionLine = describeAttraction(attraction);

  // ── Geometry ─────────────────────────────────────────────────────────────
  const peekHeight = 96 + insets.bottom;
  const sheetHeight = Math.min(Math.round(winHeight * 0.62), 540) + insets.bottom;
  const chromeBottom = peekHeight + 14;

  const hoodEntries = Object.entries(hoods);

  return (
    <View style={{ flex: 1, backgroundColor: palette.top }}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />

      {/* ── The scene ────────────────────────────────────────────────────── */}
      {isApartment ? (
        // Full-bleed and pannable now, like every other environment. The
        // furniture is still laid out in percentages that assume a
        // single-screen room — which is why it is wrapped in a viewport-wide
        // box inside the canvas rather than stretched across the wider world.
        <View style={{ flex: 1, backgroundColor: palette.mid }}>
          <ApartmentCanvas
            placements={placements}
            expectedCats={spawnResult.expectedCats}
            isNight={dark}
            spriteIds={perchSprites}
            spritesLoading={spritesLoading}
            themeColors={apartmentThemeColors}
            onPressEmptySlot={setPickerSlotId}
            onPressPlacedItem={(slotId) => {
              const itemId = placements[slotId];
              if (itemId) handleRemove(itemId);
            }}
          />
        </View>
      ) : (
        <HoodScene
          hoodId={hoodId}
          placedItems={hood.placed_items}
          expectedCats={spawnResult.expectedCats}
          time={time}
          spriteIds={perchSprites}
          spritesLoading={spritesLoading}
          themeColors={themeColors}
          envId={activeEnv.env_id}
          onPressCat={(_slot, spriteId, atItemId) => setTappedCat({ spriteId, atItemId })}
          onPressItem={handleRemove}
          paused={!focused}
          onPressSpot={(anchorId) => setPickerSlotId(`${HOOD_SPOT_PREFIX}${anchorId}`)}
          itemAnchors={hood.item_placements ?? undefined}
        />
      )}

      {/* ── Top chrome ───────────────────────────────────────────────────── */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 10,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <GlassPill
            dark={dark}
            onPress={() => setShowSwitcher(true)}
            accessibilityLabel={`${hood.name}. Switch Hood`}
          >
            <Text style={{ fontSize: 15 }}>{activeEnv.icon}</Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 14, fontFamily: font.bold, color: dark ? '#F2F3FF' : INK, flexShrink: 1 }}
            >
              {hood.name}
            </Text>
            <Text style={{ fontSize: 11, color: dark ? '#A9B2D8' : MUTED }}>▾</Text>
          </GlassPill>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <GlassPill dark={dark}>
            <Text style={{ fontSize: 13 }}>🐾</Text>
            <Text style={{ fontSize: 13, fontFamily: font.bold, color: dark ? '#F2F3FF' : INK }}>
              {progression.paw_points}
            </Text>
          </GlassPill>
          <GlassPill dark={dark}>
            <Text style={{ fontSize: 12 }}>{ambience.icon}</Text>
            <Text style={{ fontSize: 11, fontFamily: font.bold, color: dark ? '#A9B2D8' : MUTED }}>
              {ambience.label}
            </Text>
          </GlassPill>
        </View>
      </View>

      {/* ── Bottom chrome — three buttons, no tab bar ────────────────────── */}
      <View
        style={{
          position: 'absolute',
          bottom: chromeBottom,
          left: 0,
          right: 0,
          paddingHorizontal: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 12 }}>
          <GlassButton icon="🛍" label="Shop" onPress={() => setShowShop(true)} dark={dark} />
          <GlassButton icon="👥" label="Friends" onPress={onOpenFriends} dark={dark} size={46} />
        </View>

        <Touchable
          onPress={onOpenCamera}
          accessibilityRole="button"
          accessibilityLabel="Photograph a cat"
          scaleTo={0.9}
          style={{
            width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: GINGER,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: dark ? 'rgba(255,255,255,0.28)' : '#FFFFFF',
            shadowColor: GINGER,
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          <Text style={{ fontSize: 28 }}>📸</Text>
        </Touchable>

        <View style={{ gap: 12, alignItems: 'flex-end' }}>
          <GlassButton icon="🐱" label="Cat-a-log" onPress={onOpenCatalog} dark={dark} />
          <GlassButton icon="📖" label="Scrapbook" onPress={onOpenScrapbook} dark={dark} size={46} />
        </View>
      </View>

      {/* ── Drawer ───────────────────────────────────────────────────────── */}
      <HoodSheet
        height={sheetHeight}
        peekHeight={peekHeight}
        expanded={drawerOpen}
        onChange={setDrawerOpen}
        background={SURFACE}
        peek={
          <View style={{ paddingHorizontal: 22, paddingBottom: insets.bottom }}>
            <Text style={{ fontSize: 15, fontFamily: font.bold, color: INK }}>{activityLine}</Text>
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 3 }} numberOfLines={1}>
              {attractionLine ?? `Pull up to decorate ${hood.name}`}
            </Text>
          </View>
        }
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: 19, fontFamily: font.bold, color: INK }}>Put something out</Text>
            <Touchable onPress={() => setShowShop(true)} hitSlop={HIT_SLOP_MD} scaleTo={0.95}>
              <Text style={{ fontSize: 13, fontFamily: font.bold, color: '#E67035' }}>Shop ›</Text>
            </Touchable>
          </View>
          <Text style={{ fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 18 }}>
            {isApartment
              ? 'Tap a glowing spot in the room to fill it. Tap what’s there to put it away.'
              : 'Tap to put it out. Tap it in the scene to pick it back up.'}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {PLACEABLE_ITEMS.map((def) => {
              const count = stackCounts[def.item_id] ?? 0;
              const locked = !isItemUnlocked(progression, def.item_id);
              const full = !locked && !canAddItem({ placed_items: effectiveItems }, def.item_id);
              return (
                <TrayItem
                  key={def.item_id}
                  itemId={def.item_id}
                  emoji={def.emoji}
                  label={def.label}
                  tier={def.tier}
                  count={count}
                  locked={locked}
                  full={full}
                  onPress={() => (locked ? setShowShop(true) : handleAdd(def.item_id))}
                />
              );
            })}
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(234,227,218,0.9)', marginVertical: 18 }} />

          <Text style={{ fontSize: 12, color: MUTED, textAlign: 'center' }}>
            {username}
            {isApartment ? ` · ${Object.keys(placements).length}/${APARTMENT_SLOTS.length} spots filled` : ''}
          </Text>
        </ScrollView>
      </HoodSheet>

      {/* ── Shop ─────────────────────────────────────────────────────────── */}
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

      {/* ── Hood switcher ────────────────────────────────────────────────── */}
      <HoodSwitcher
        visible={showSwitcher}
        hoods={hoodEntries}
        activeHoodId={hoodId}
        onSelect={(id) => {
          setShowSwitcher(false);
          if (id !== hoodId) onSwitchHood(id);
        }}
        onCreate={onCreateHood}
        onClose={() => setShowSwitcher(false)}
      />

      {/* ── Tapped a cat ─────────────────────────────────────────────────── */}
      <CatCard
        visit={tappedCat}
        onOpenCatalog={() => {
          setTappedCat(null);
          onOpenCatalog();
        }}
        onClose={() => setTappedCat(null)}
      />

      {/* ── Apartment slot picker ────────────────────────────────────────── */}
      <Modal
        visible={pickerSlotId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerSlotId(null)}
      >
        {/* Raw Pressable, not Touchable, and deliberately so: this is a
            dismiss scrim. A backdrop that flinches when you tap it to close
            reads as a button you hit by mistake. Same for the inner one,
            which exists only to stop taps on the sheet reaching the scrim. */}
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(20,14,8,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setPickerSlotId(null)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: SURFACE,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              padding: 20,
              paddingBottom: 30 + insets.bottom,
              maxHeight: 440,
            }}
          >
            <View
              style={{
                width: 40, height: 4, borderRadius: 2,
                backgroundColor: '#EAE3DA', alignSelf: 'center', marginBottom: 14,
              }}
            />
            <Text style={{ fontSize: 18, fontFamily: font.bold, color: INK }}>
              {pickerSpotIsHood ? 'Put something here' : pickerSlotId ? getSlotById(pickerSlotId)?.label ?? '' : ''}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 6 }}>
                {pickerSlotId &&
                  PLACEABLE_ITEMS.filter((i) =>
                    // Open ground takes anything; a named slot does not.
                    pickerSpotIsHood
                      ? true
                      : (getSlotById(pickerSlotId)?.accepts ?? []).includes(i.category),
                  ).map((def) => {
                    const unlocked = isItemUnlocked(progression, def.item_id);
                    const full = !canAddItem({ placed_items: effectiveItems }, def.item_id);
                    return (
                      <TrayItem
                        key={def.item_id}
                        itemId={def.item_id}
                        emoji={def.emoji}
                        label={def.label}
                        tier={def.tier}
                        count={stackCounts[def.item_id] ?? 0}
                        locked={!unlocked}
                        full={unlocked && full}
                        onPress={() =>
                          unlocked
                            ? handlePlaceInSlot(pickerSlotId, def.item_id)
                            : (setPickerSlotId(null), setShowShop(true))
                        }
                      />
                    );
                  })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CatCard — the payoff for tapping a cat
// ---------------------------------------------------------------------------

function CatCard({
  visit,
  onOpenCatalog,
  onClose,
}: {
  visit: { spriteId?: string; atItemId: string | null } | null;
  onOpenCatalog: () => void;
  onClose: () => void;
}) {
  const def = visit?.spriteId ? getSpriteById(visit.spriteId) : null;
  const item = visit?.atItemId
    ? PLACEABLE_ITEMS.find((i) => i.item_id === visit.atItemId) ?? null
    : null;

  return (
    <Modal visible={visit != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(20,14,8,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 34,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 26,
            paddingVertical: 26,
            paddingHorizontal: 24,
            alignItems: 'center',
            alignSelf: 'stretch',
          }}
        >
          {visit?.spriteId ? (
            <CatSprite spriteId={visit.spriteId} size={132} animation="idle" />
          ) : (
            <Text style={{ fontSize: 76 }}>🐱</Text>
          )}

          <Text style={{ fontSize: 19, fontFamily: font.bold, color: INK, marginTop: 12, textAlign: 'center' }}>
            {def?.label ?? 'A visitor'}
          </Text>
          {def && (
            <Text style={{ fontSize: 12, color: '#E8A020', marginTop: 3, fontFamily: font.bold}}>
              {RARITY_STARS[def.rarity]} {RARITY_LABELS[def.rarity]}
            </Text>
          )}

          <Text style={{ fontSize: 13, color: MUTED, marginTop: 12, textAlign: 'center', lineHeight: 19 }}>
            {describeVisitReason(item?.label ?? null)}
          </Text>
          {def && (
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 8, textAlign: 'center', lineHeight: 18, fontStyle: 'italic' }}>
              {def.description}
            </Text>
          )}

          <Touchable
            onPress={onOpenCatalog}
            style={{
              marginTop: 20,
              alignSelf: 'stretch',
              backgroundColor: GINGER,
              borderRadius: 14,
              minHeight: 46,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: font.bold, fontSize: 14 }}>
              Open the Cat-a-log
            </Text>
          </Touchable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HoodSwitcher — replaces the "My Hoods" settings list
// ---------------------------------------------------------------------------

/**
 * Hoods are now switched from inside the scene rather than from a tab.
 *
 * The old list screen framed them as records to manage ("Manage items in your
 * customised locations", chevron rows, a subtitle counting items). They are
 * places you go, so this is a short picker over the scene and nothing more.
 */
function HoodSwitcher({
  visible,
  hoods,
  activeHoodId,
  onSelect,
  onCreate,
  onClose,
}: {
  visible: boolean;
  hoods: [string, Hood][];
  activeHoodId: string;
  onSelect: (hoodId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = draftName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate(name);
      setNaming(false);
      setDraftName('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(20,14,8,0.45)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: SURFACE,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            padding: 20,
            paddingBottom: 26 + insets.bottom,
            maxHeight: '78%',
          }}
        >
          <View
            style={{
              width: 40, height: 4, borderRadius: 2,
              backgroundColor: '#EAE3DA', alignSelf: 'center', marginBottom: 16,
            }}
          />

          {naming ? (
            <>
              <Text style={{ fontSize: 19, fontFamily: font.bold, color: INK }}>A new spot</Text>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 18 }}>
                Name somewhere you see cats. No GPS — just a label you'll recognise.
              </Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Backyard Deck, Corner Store…"
                placeholderTextColor="#B0ABA6"
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={submit}
                maxLength={40}
                style={{
                  marginTop: 14,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 13,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: INK,
                  borderWidth: 1,
                  borderColor: '#EAE3DA',
                  minHeight: 46,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Touchable
                  onPress={() => { setNaming(false); setDraftName(''); }}
                  style={{
                    flex: 1, minHeight: 46, borderRadius: 13,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAE3DA',
                  }}
                >
                  <Text style={{ fontFamily: font.bold, color: MUTED, fontSize: 14 }}>Cancel</Text>
                </Touchable>
                <Touchable
                  onPress={submit}
                  disabled={!draftName.trim() || busy}
                  disabledStyle={{ opacity: 0.45 }}
                  accessibilityState={{ busy }}
                  style={{
                    flex: 1, minHeight: 46, borderRadius: 13,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: GINGER,
                  }}
                >
                  <Text style={{ fontFamily: font.bold, color: '#FFFFFF', fontSize: 14 }}>
                    {busy ? 'Creating…' : 'Create'}
                  </Text>
                </Touchable>
              </View>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 19, fontFamily: font.bold, color: INK, marginBottom: 12 }}>
                Where to?
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {hoods.map(([id, h]) => {
                  const env = getEnvironmentById(h.active_environment_id ?? '') ?? DEFAULT_ENVIRONMENT;
                  const active = id === activeHoodId;
                  return (
                    <Touchable
                      key={id}
                      onPress={() => onSelect(id)}
                      scaleTo={0.98}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 15,
                        marginBottom: 10,
                        borderWidth: 2,
                        borderColor: active ? GINGER : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 24 }}>{env.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontFamily: font.bold, color: INK }}>{h.name}</Text>
                        <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{env.name}</Text>
                      </View>
                      {active && (
                        <Text style={{ fontSize: 12, fontFamily: font.bold, color: '#E67035' }}>Here</Text>
                      )}
                    </Touchable>
                  );
                })}

                <Touchable
                  onPress={() => setNaming(true)}
                  scaleTo={0.98}
                  style={{
                    borderRadius: 18,
                    padding: 15,
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: 'rgba(255,142,83,0.5)',
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: font.bold, color: '#E67035' }}>
                    + Somewhere new
                  </Text>
                </Touchable>
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
