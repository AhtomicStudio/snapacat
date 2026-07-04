/**
 * SnapaCat — Progression Engine.
 *
 * Pure, deterministic utility with zero side-effects. All functions take
 * current state and return new state — never mutate in place.
 * No external network calls; no AI; no GPS.
 */
import type { UserProgression, PawPointsSource } from '../types';
import { DEFAULT_UNLOCKED_ITEMS } from './spawnCalculator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PawPoints awarded per earn source. */
export const PAW_POINT_REWARDS: Record<PawPointsSource, number> = {
  field_note: 15,
  new_cat_discovery: 50,
  daily_streak: 25,
};

/** The ID of the theme that is always free. */
const DEFAULT_THEME_ID = 'theme_default';

/** The ID of the environment that is always free. */
export const DEFAULT_ENV_ID = 'env_alley';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns a fresh progression object for a brand-new user.
 * Includes the default theme and all cost-0 items pre-unlocked.
 */
export function getDefaultProgression(): UserProgression {
  return {
    paw_points: 0,
    unlocked_themes: [DEFAULT_THEME_ID],
    unlocked_items: [...DEFAULT_UNLOCKED_ITEMS],
    active_theme_id: null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Returns true if the user has unlocked the given theme. */
export function isThemeUnlocked(
  progression: UserProgression,
  themeId: string,
): boolean {
  return themeId === DEFAULT_THEME_ID || progression.unlocked_themes.includes(themeId);
}

/** Returns true if the user has unlocked the given item (free items are always unlocked). */
export function isItemUnlocked(
  progression: UserProgression,
  itemId: string,
): boolean {
  return (
    DEFAULT_UNLOCKED_ITEMS.includes(itemId) ||
    progression.unlocked_items.includes(itemId)
  );
}

/** Returns true if the user has unlocked the given environment. */
export function isEnvironmentUnlocked(
  progression: UserProgression,
  envId: string,
): boolean {
  // Environments are tracked in unlocked_items for simplicity (same purchase flow).
  return envId === DEFAULT_ENV_ID || progression.unlocked_items.includes(envId);
}

// ---------------------------------------------------------------------------
// Mutations (return new state, never mutate)
// ---------------------------------------------------------------------------

/**
 * Awards PawPoints for a given source event.
 * Returns a new `UserProgression` with the updated balance.
 */
export function awardPawPoints(
  progression: UserProgression,
  source: PawPointsSource,
): UserProgression {
  const delta = PAW_POINT_REWARDS[source];
  return {
    ...progression,
    paw_points: progression.paw_points + delta,
  };
}

/**
 * Purchases a theme for the user.
 *
 * @throws {Error} if the theme is already unlocked.
 * @throws {Error} if the user has insufficient PawPoints.
 */
export function purchaseTheme(
  progression: UserProgression,
  themeId: string,
  themeCost: number,
): UserProgression {
  if (isThemeUnlocked(progression, themeId)) {
    throw new Error(`Theme "${themeId}" is already unlocked.`);
  }
  if (progression.paw_points < themeCost) {
    throw new Error(
      `Insufficient PawPoints: need ${themeCost}, have ${progression.paw_points}.`,
    );
  }
  return {
    ...progression,
    paw_points: progression.paw_points - themeCost,
    unlocked_themes: [...progression.unlocked_themes, themeId],
  };
}

/**
 * Purchases a shop item (or environment) for the user.
 *
 * @throws {Error} if the item is already unlocked.
 * @throws {Error} if the user has insufficient PawPoints.
 */
export function purchaseItem(
  progression: UserProgression,
  itemId: string,
  itemCost: number,
): UserProgression {
  if (isItemUnlocked(progression, itemId) || isEnvironmentUnlocked(progression, itemId)) {
    throw new Error(`Item/environment "${itemId}" is already unlocked.`);
  }
  if (progression.paw_points < itemCost) {
    throw new Error(
      `Insufficient PawPoints: need ${itemCost}, have ${progression.paw_points}.`,
    );
  }
  return {
    ...progression,
    paw_points: progression.paw_points - itemCost,
    unlocked_items: [...progression.unlocked_items, itemId],
  };
}

/** Formats a Date as YYYY-MM-DD in the device's local timezone. */
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Awards the daily streak bonus if it hasn't been given yet today (local time).
 * Tracks a consecutive-day counter: opening the app on adjacent local days
 * increments `streak_count`; missing a day resets it to 1.
 * Safe to call on every app launch — idempotent for the same calendar day.
 * `now` is injectable for tests.
 */
export function checkAndAwardDailyStreak(
  progression: UserProgression,
  now: Date = new Date(),
): UserProgression {
  const today = localDateString(now);
  if (progression.last_streak_date === today) return progression;

  const yesterday = localDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  const streakContinues = progression.last_streak_date === yesterday;

  return {
    ...awardPawPoints(progression, 'daily_streak'),
    last_streak_date: today,
    streak_count: streakContinues ? (progression.streak_count ?? 0) + 1 : 1,
  };
}

/**
 * Sets the globally active theme.
 *
 * @throws {Error} if the theme is not unlocked.
 */
export function setActiveTheme(
  progression: UserProgression,
  themeId: string,
): UserProgression {
  if (!isThemeUnlocked(progression, themeId)) {
    throw new Error(`Cannot activate locked theme "${themeId}".`);
  }
  return { ...progression, active_theme_id: themeId };
}
