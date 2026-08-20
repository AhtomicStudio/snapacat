/**
 * Visiting a friend's Hood.
 *
 * Rebuilt to render the SAME scene as your own Hood, read-only.
 *
 * It previously used HoodCanvas — the old 260px strip — under a stack of
 * cards: a spawn meter, a list of their items annotated "+15% spawn", and a
 * Day/Night toggle. That was wrong on three counts. It looked nothing like the
 * Hood you had just come from, so a friend's place read as a report about their
 * Hood rather than a visit to it. It published the exact numbers the rest of
 * the game deliberately stopped showing (see utils/hoodMood). And the lighting
 * toggle let you change the time of day at someone else's house.
 *
 * Now: their scene, their theme, their environment, their cats — full-bleed,
 * pannable, with nothing you can touch.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFriendHoods } from '../services/dbService';
import { PLACEABLE_ITEMS, calculateSpawnChances } from '../utils/spawnCalculator';
import { usePerchSprites } from '../hooks/usePerchSprites';
import { HoodScene } from '../components/HoodScene';
import { ApartmentCanvas } from '../components/ApartmentCanvas';
import { Touchable } from '../components/Touchable';
import { autoAssignPlacements } from '../config/apartment';
import { getEnvironmentById, DEFAULT_ENVIRONMENT } from '../config/environments';
import { getThemeById, DEFAULT_THEME } from '../config/themes';
import { resolveTimeOfDay, isDark, skyPalette, type TimeOfDay } from '../utils/timeOfDay';
import { describeActivity } from '../utils/hoodMood';
import { getPropSheet } from '../assets/props';
import { color, space, radius, fontSize, weight, shadow, TAP_MIN } from '../theme';
import type { Hood } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FriendHoodScreenProps {
  friendUid: string;
  onBack: () => void;
  /** Injectable for tests — production reads the device clock. */
  now?: Date;
}

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

interface FriendData {
  username: string;
  hoods: Record<string, Hood>;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function FriendHoodScreen({ friendUid, onBack, now }: FriendHoodScreenProps) {
  const insets = useSafeAreaInsets();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [friendData, setFriendData] = useState<FriendData | null>(null);
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(null);
  // Cats perched in a friend's Hood are the cats from THEIR Cat-a-log.
  const { perchSprites, loading: spritesLoading } = usePerchSprites(friendUid);

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
        const firstId = Object.keys(result.hoods)[0] ?? null;
        setSelectedHoodId(firstId);
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [friendUid]);

  // ---- Derived state ----
  const selectedHood = useMemo<Hood | null>(() => {
    if (!friendData || !selectedHoodId) return null;
    return friendData.hoods[selectedHoodId] ?? null;
  }, [friendData, selectedHoodId]);

  const activeEnv = useMemo(
    () => getEnvironmentById(selectedHood?.active_environment_id ?? '') ?? DEFAULT_ENVIRONMENT,
    [selectedHood],
  );

  /**
   * A friend's Hood renders in the theme they bought — but only if they
   * actually bought one. Falling back to DEFAULT_THEME's colours here would
   * override their environment's own material, the same bug the main Hood had.
   */
  const themeColors = useMemo(() => {
    const id = selectedHood?.active_theme_id;
    if (!id || !getThemeById(id)) return undefined;
    const theme = getThemeById(id) ?? DEFAULT_THEME;
    return {
      skyTop: theme.sky_colors[0],
      skyBottom: theme.sky_colors[1],
      ground: theme.ground_color,
      accent: theme.accent_color,
    };
  }, [selectedHood]);

  /** Their Hood, at your local time. Environments can still force it. */
  const time: TimeOfDay = useMemo(() => {
    if (activeEnv.forced_time_of_day === 'night') return 'night';
    if (activeEnv.forced_time_of_day === 'day') return 'day';
    return resolveTimeOfDay(now);
  }, [activeEnv.forced_time_of_day, now]);

  const dark = isDark(time);
  const palette = skyPalette(time);

  const isApartment = activeEnv.env_id === 'env_apartment';

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
        activeEnv.spawn_multiplier,
      ),
    [selectedHood, isApartment, placements, activeEnv.spawn_multiplier],
  );

  const hoodEntries = useMemo(
    () => (friendData ? Object.entries(friendData.hoods) : []),
    [friendData],
  );

  // ---- Non-ready states ----
  if (loadState !== 'ready' || !selectedHood) {
    return (
      <SafeAreaView style={styles.stateRoot}>
        <View style={styles.stateHeader}>
          <Touchable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to Friends"
            style={styles.stateBack}
          >
            <Text style={styles.backArrow}>←</Text>
          </Touchable>
          <Text style={styles.stateTitle}>
            {loadState === 'loading' ? 'Loading…' : friendData?.username ?? 'Their Hood'}
          </Text>
        </View>

        <View style={styles.stateBody}>
          {loadState === 'loading' ? (
            <>
              <ActivityIndicator size="large" color={color.ginger} />
              <Text style={styles.stateCaption}>Walking over…</Text>
            </>
          ) : (
            <>
              <Text style={styles.stateEmoji}>🐾</Text>
              <Text style={styles.stateHeadline}>
                {loadState === 'not_found'
                  ? 'No user found for this ID'
                  : loadState === 'error'
                  ? "Couldn't load this Hood"
                  : 'No Hoods here yet'}
              </Text>
              <Text style={styles.stateCaption}>
                {loadState === 'not_found'
                  ? 'Double-check the ID with your friend.'
                  : loadState === 'error'
                  ? 'Check your connection and try again.'
                  : 'They have not set up a Hood to visit.'}
              </Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ---- The visit ----
  return (
    <View style={[styles.root, { backgroundColor: palette.top }]}>
      {isApartment ? (
        <View style={[styles.apartmentStage, { backgroundColor: palette.mid }]}>
          <ApartmentCanvas
            placements={placements}
            expectedCats={spawnResult.expectedCats}
            isNight={dark}
            spriteIds={perchSprites}
            spritesLoading={spritesLoading}
            themeColors={
              themeColors ?? {
                skyTop: DEFAULT_THEME.sky_colors[0],
                skyBottom: DEFAULT_THEME.sky_colors[1],
                ground: DEFAULT_THEME.ground_color,
                accent: DEFAULT_THEME.accent_color,
              }
            }
            readOnly
          />
        </View>
      ) : (
        <HoodScene
          hoodId={selectedHoodId ?? friendUid}
          placedItems={selectedHood.placed_items}
          expectedCats={spawnResult.expectedCats}
          time={time}
          spriteIds={perchSprites}
          spritesLoading={spritesLoading}
          themeColors={themeColors}
          envId={activeEnv.env_id}
          readOnly
        />
      )}

      {/* ── Top chrome ────────────────────────────────────────────────────── */}
      <View style={[styles.chromeTop, { top: insets.top + 10 }]}>
        <Touchable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Friends"
          style={[styles.glassButton, dark ? styles.glassDark : styles.glassLight]}
        >
          <Text style={[styles.backArrow, dark && { color: color.milk }]}>←</Text>
        </Touchable>

        <View style={[styles.titlePill, dark ? styles.glassDark : styles.glassLight]}>
          <Text
            numberOfLines={1}
            style={[styles.friendName, dark && { color: '#F2F3FF' }]}
          >
            {friendData?.username ?? friendUid}
          </Text>
          <Text style={[styles.viewingLabel, dark && { color: '#A9B2D8' }]}>
            {activeEnv.icon} {selectedHood.name} · 👁 Visiting
          </Text>
        </View>
      </View>

      {/* ── Hood switcher, only when they have more than one ──────────────── */}
      {hoodEntries.length > 1 && (
        <View style={[styles.switcher, { top: insets.top + 78 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.switcherRow}
          >
            {hoodEntries.map(([id, hood]) => {
              const active = id === selectedHoodId;
              return (
                <Touchable
                  key={id}
                  onPress={() => setSelectedHoodId(id)}
                  scaleTo={0.95}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.switcherChip,
                    dark ? styles.glassDark : styles.glassLight,
                    active && styles.switcherChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.switcherChipText,
                      dark && { color: '#F2F3FF' },
                      active && styles.switcherChipTextActive,
                    ]}
                  >
                    {hood.name}
                  </Text>
                </Touchable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── What they've put out ──────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.footerLine}>{describeActivity(spawnResult.expectedCats)}</Text>
        {selectedHood.placed_items.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.footerItems}
          >
            {Array.from(new Set(selectedHood.placed_items)).map((id) => {
              const def = PLACEABLE_ITEMS.find((i) => i.item_id === id);
              if (!def) return null;
              const count = selectedHood.placed_items.filter((p) => p === id).length;
              const art = getPropSheet(id);
              return (
                <View key={id} style={styles.footerChip}>
                  {art ? (
                    <Image source={art} resizeMode="contain" fadeDuration={0} style={styles.footerArt} />
                  ) : (
                    <Text style={{ fontSize: 18 }}>{def.emoji}</Text>
                  )}
                  <Text style={styles.footerChipText}>
                    {def.label}
                    {count > 1 ? ` ×${count}` : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.footerEmpty}>Nothing out yet — cats drop by anyway.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  apartmentStage: { flex: 1, justifyContent: 'center' },

  // ── Non-ready states ─────────────────────────────────────────────────────
  stateRoot: { flex: 1, backgroundColor: color.background },
  stateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    backgroundColor: color.surface,
  },
  stateBack: {
    minWidth: TAP_MIN,
    minHeight: TAP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.sm - space.xs,
  },
  stateTitle: { fontSize: fontSize.xl, fontWeight: weight.heavy, color: color.textPrimary },
  stateBody: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl },
  stateEmoji: { fontSize: 44, marginBottom: space.md },
  stateHeadline: {
    fontSize: fontSize.base,
    fontWeight: weight.bold,
    color: color.textPrimary,
    textAlign: 'center',
  },
  stateCaption: {
    fontSize: fontSize.sm,
    color: color.textSecondary,
    textAlign: 'center',
    marginTop: space.xs,
  },

  // ── Chrome ───────────────────────────────────────────────────────────────
  chromeTop: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...shadow.card,
  },
  glassLight: {
    backgroundColor: 'rgba(255,252,247,0.88)',
    borderColor: 'rgba(255,255,255,0.9)',
  },
  glassDark: {
    backgroundColor: 'rgba(28,32,58,0.75)',
    borderColor: 'rgba(180,192,255,0.22)',
  },
  backArrow: { color: color.ginger, fontWeight: weight.bold, fontSize: fontSize.lg },

  titlePill: {
    flex: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    ...shadow.card,
  },
  friendName: { fontSize: fontSize.sm, fontWeight: weight.heavy, color: color.textPrimary },
  viewingLabel: { fontSize: 11, color: color.textSecondary, marginTop: 1 },

  switcher: { position: 'absolute', left: 0, right: 0 },
  switcherRow: { paddingHorizontal: space.md, gap: space.sm },
  switcherChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  switcherChipActive: { backgroundColor: color.ginger, borderColor: color.ginger },
  switcherChipText: { fontSize: fontSize.xs, fontWeight: weight.bold, color: color.textPrimary },
  switcherChipTextActive: { color: color.milk },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.background,
    borderTopLeftRadius: radius.lg + 2,
    borderTopRightRadius: radius.lg + 2,
    paddingTop: space.md,
    gap: space.sm,
    ...shadow.card,
  },
  footerLine: {
    fontSize: fontSize.base,
    fontWeight: weight.heavy,
    color: color.textPrimary,
    paddingHorizontal: space.lg,
  },
  footerItems: { paddingHorizontal: space.lg, gap: space.sm },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: radius.sm + 4,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 2,
  },
  footerArt: { width: 26, height: 26 },
  footerChipText: { fontSize: fontSize.xs, fontWeight: weight.semibold, color: color.textPrimary },
  footerEmpty: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
    paddingHorizontal: space.lg,
  },
});
