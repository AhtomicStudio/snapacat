/**
 * Unit tests for the SnapaCat progression engine.
 * All tests use pure, in-memory state — no network, no DB, no mocks needed.
 */
import {
  getDefaultProgression,
  awardPawPoints,
  purchaseTheme,
  purchaseItem,
  setActiveTheme,
  isThemeUnlocked,
  isItemUnlocked,
  isEnvironmentUnlocked,
  checkAndAwardDailyStreak,
  PAW_POINT_REWARDS,
  DEFAULT_ENV_ID,
} from '../progressionEngine';
import { DEFAULT_UNLOCKED_ITEMS } from '../spawnCalculator';

// ---------------------------------------------------------------------------
// getDefaultProgression
// ---------------------------------------------------------------------------

describe('getDefaultProgression', () => {
  it('returns zero paw_points for a new user', () => {
    expect(getDefaultProgression().paw_points).toBe(0);
  });

  it('unlocks the default theme', () => {
    const p = getDefaultProgression();
    expect(p.unlocked_themes).toContain('theme_default');
  });

  it('pre-unlocks all free items', () => {
    const p = getDefaultProgression();
    for (const id of DEFAULT_UNLOCKED_ITEMS) {
      expect(p.unlocked_items).toContain(id);
    }
  });

  it('has no active theme set (null)', () => {
    expect(getDefaultProgression().active_theme_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// awardPawPoints
// ---------------------------------------------------------------------------

describe('awardPawPoints', () => {
  it('awards correct delta for field_note', () => {
    const p = awardPawPoints(getDefaultProgression(), 'field_note');
    expect(p.paw_points).toBe(PAW_POINT_REWARDS.field_note);
  });

  it('awards correct delta for new_cat_discovery', () => {
    const p = awardPawPoints(getDefaultProgression(), 'new_cat_discovery');
    expect(p.paw_points).toBe(PAW_POINT_REWARDS.new_cat_discovery);
  });

  it('awards correct delta for daily_streak', () => {
    const p = awardPawPoints(getDefaultProgression(), 'daily_streak');
    expect(p.paw_points).toBe(PAW_POINT_REWARDS.daily_streak);
  });

  it('stacks multiple awards correctly', () => {
    let p = getDefaultProgression();
    p = awardPawPoints(p, 'field_note');      // +15
    p = awardPawPoints(p, 'field_note');      // +15
    p = awardPawPoints(p, 'new_cat_discovery'); // +50
    expect(p.paw_points).toBe(80);
  });

  it('does not mutate the original object', () => {
    const original = getDefaultProgression();
    awardPawPoints(original, 'field_note');
    expect(original.paw_points).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// purchaseTheme
// ---------------------------------------------------------------------------

describe('purchaseTheme', () => {
  it('deducts cost and adds theme id on success', () => {
    let p = getDefaultProgression();
    p = { ...p, paw_points: 200 };
    p = purchaseTheme(p, 'theme_midnight', 100);
    expect(p.paw_points).toBe(100);
    expect(p.unlocked_themes).toContain('theme_midnight');
  });

  it('throws when balance is insufficient', () => {
    const p = getDefaultProgression(); // 0 points
    expect(() => purchaseTheme(p, 'theme_midnight', 100)).toThrow('Insufficient PawPoints');
  });

  it('throws when theme is already unlocked', () => {
    let p = getDefaultProgression();
    p = { ...p, paw_points: 500 };
    p = purchaseTheme(p, 'theme_midnight', 100);
    expect(() => purchaseTheme(p, 'theme_midnight', 100)).toThrow('already unlocked');
  });

  it('default theme is always considered unlocked without purchasing', () => {
    const p = getDefaultProgression();
    expect(isThemeUnlocked(p, 'theme_default')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// purchaseItem
// ---------------------------------------------------------------------------

describe('purchaseItem', () => {
  it('deducts cost and adds item id on success', () => {
    let p = getDefaultProgression();
    p = { ...p, paw_points: 200 };
    p = purchaseItem(p, 'item_premium_kibble', 50);
    expect(p.paw_points).toBe(150);
    expect(p.unlocked_items).toContain('item_premium_kibble');
  });

  it('throws when balance is insufficient', () => {
    const p = getDefaultProgression();
    expect(() => purchaseItem(p, 'item_tuna_fountain', 200)).toThrow('Insufficient PawPoints');
  });

  it('throws when item is already unlocked (free item)', () => {
    let p = getDefaultProgression();
    p = { ...p, paw_points: 500 };
    // item_kibble_bowl is free and pre-unlocked
    expect(() => purchaseItem(p, 'item_kibble_bowl', 0)).toThrow('already unlocked');
  });

  it('free items are considered unlocked without purchasing', () => {
    const p = getDefaultProgression();
    for (const id of DEFAULT_UNLOCKED_ITEMS) {
      expect(isItemUnlocked(p, id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// isEnvironmentUnlocked
// ---------------------------------------------------------------------------

describe('isEnvironmentUnlocked', () => {
  it('default environment is always unlocked', () => {
    const p = getDefaultProgression();
    expect(isEnvironmentUnlocked(p, DEFAULT_ENV_ID)).toBe(true);
  });

  it('locked environment is not accessible by default', () => {
    const p = getDefaultProgression();
    expect(isEnvironmentUnlocked(p, 'env_garden')).toBe(false);
  });

  it('becomes unlocked after purchasing', () => {
    let p = getDefaultProgression();
    p = { ...p, paw_points: 200 };
    p = purchaseItem(p, 'env_garden', 150);
    expect(isEnvironmentUnlocked(p, 'env_garden')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkAndAwardDailyStreak
// ---------------------------------------------------------------------------

describe('checkAndAwardDailyStreak', () => {
  const day1 = new Date(2026, 6, 1, 18, 30); // July 1 2026, 6:30pm local
  const day2 = new Date(2026, 6, 2, 7, 0);   // July 2 — adjacent day
  const day4 = new Date(2026, 6, 4, 12, 0);  // July 4 — gap of one day

  it('awards the bonus and starts the streak at 1 on first open', () => {
    const p = checkAndAwardDailyStreak(getDefaultProgression(), day1);
    expect(p.paw_points).toBe(PAW_POINT_REWARDS.daily_streak);
    expect(p.streak_count).toBe(1);
    expect(p.last_streak_date).toBe('2026-07-01');
  });

  it('is idempotent within the same local day (returns the same object)', () => {
    const p = checkAndAwardDailyStreak(getDefaultProgression(), day1);
    const again = checkAndAwardDailyStreak(p, new Date(2026, 6, 1, 23, 59));
    expect(again).toBe(p);
  });

  it('increments the streak on an adjacent local day', () => {
    let p = checkAndAwardDailyStreak(getDefaultProgression(), day1);
    p = checkAndAwardDailyStreak(p, day2);
    expect(p.streak_count).toBe(2);
    expect(p.paw_points).toBe(PAW_POINT_REWARDS.daily_streak * 2);
  });

  it('resets the streak to 1 after a missed day', () => {
    let p = checkAndAwardDailyStreak(getDefaultProgression(), day1);
    p = checkAndAwardDailyStreak(p, day2);
    p = checkAndAwardDailyStreak(p, day4); // July 3 skipped
    expect(p.streak_count).toBe(1);
  });

  it('uses local calendar days, not UTC (evening open counts as that local day)', () => {
    // 11pm local on July 1, then 1am local on July 2 — two awards, streak of 2
    let p = checkAndAwardDailyStreak(getDefaultProgression(), new Date(2026, 6, 1, 23, 0));
    p = checkAndAwardDailyStreak(p, new Date(2026, 6, 2, 1, 0));
    expect(p.streak_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// setActiveTheme
// ---------------------------------------------------------------------------

describe('setActiveTheme', () => {
  it('sets active theme on the progression', () => {
    let p = getDefaultProgression();
    p = { ...p, paw_points: 200 };
    p = purchaseTheme(p, 'theme_midnight', 100);
    p = setActiveTheme(p, 'theme_midnight');
    expect(p.active_theme_id).toBe('theme_midnight');
  });

  it('throws when activating a locked theme', () => {
    const p = getDefaultProgression();
    expect(() => setActiveTheme(p, 'theme_golden_hour')).toThrow('locked theme');
  });

  it('can activate the default theme without purchasing', () => {
    const p = getDefaultProgression();
    const updated = setActiveTheme(p, 'theme_default');
    expect(updated.active_theme_id).toBe('theme_default');
  });
});
