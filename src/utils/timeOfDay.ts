/**
 * Ambient time of day for The Hood.
 *
 * The old Hood had a Day/Night toggle button in the header. That was a mistake
 * borrowed from settings screens: it turns a mood into a control, and it asks
 * the player to state what time it is when the phone already knows. Removing it
 * takes one more widget off the scene and makes coming back in the evening feel
 * like something happened while you were away.
 *
 * Environments can still force a lighting mode (a basement is dark at noon) —
 * that is content, not a user control, and it stays.
 */

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * Band boundaries in local hours. Dawn and dusk are deliberately short: they
 * are the interesting-looking states, and rarity is what makes them feel like a
 * reward for opening the app at an odd hour.
 */
export function resolveTimeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

/** True when the scene should render its night dressing (stars, lit windows). */
export function isDark(time: TimeOfDay): boolean {
  return time === 'night';
}

export interface SkyPalette {
  /** Top of the sky gradient. */
  top: string;
  /** Band beneath it. */
  mid: string;
  /** At the horizon, where the light pools. */
  low: string;
  /** Silhouette colour for the far backdrop. */
  backdrop: string;
  /** Ground plane base. */
  ground: string;
  /** Warm/cool cast laid over the whole scene at low opacity. */
  wash: string;
  washOpacity: number;
}

/**
 * Sky palettes per band.
 *
 * These are the fallback. A Hood with a purchased Theme overrides `top`, `low`
 * and `ground` from the Theme, but keeps the wash and backdrop from here — so a
 * theme still reads differently at midnight than it does at noon, which is the
 * point of having both systems.
 */
const PALETTES: Record<TimeOfDay, SkyPalette> = {
  dawn: {
    top: '#8FA6C8',
    mid: '#C9AEBE',
    low: '#F5C9A0',
    backdrop: '#6E6A85',
    ground: '#9BB894',
    wash: '#FFC48A',
    washOpacity: 0.12,
  },
  day: {
    top: '#6FBEE8',
    mid: '#9BD6F0',
    low: '#DCF0F8',
    backdrop: '#7C8AA0',
    ground: '#A8D5A2',
    wash: '#FFF3D6',
    washOpacity: 0.06,
  },
  dusk: {
    top: '#4C4A78',
    mid: '#9A6E8E',
    low: '#F0A070',
    backdrop: '#4A4560',
    ground: '#7E9B84',
    wash: '#FF9B5E',
    washOpacity: 0.16,
  },
  night: {
    top: '#141A32',
    mid: '#1E2544',
    low: '#33395E',
    backdrop: '#0E1226',
    ground: '#3A4262',
    wash: '#5C74C8',
    washOpacity: 0.14,
  },
};

export function skyPalette(time: TimeOfDay): SkyPalette {
  return PALETTES[time];
}

/** Short label for the ambience chip. Flavour, never a control. */
export function timeLabel(time: TimeOfDay): { icon: string; label: string } {
  switch (time) {
    case 'dawn':  return { icon: '🌅', label: 'Early' };
    case 'day':   return { icon: '☀️', label: 'Afternoon' };
    case 'dusk':  return { icon: '🌇', label: 'Evening' };
    case 'night': return { icon: '🌙', label: 'Late' };
  }
}
