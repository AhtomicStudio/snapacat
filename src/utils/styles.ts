import type { ViewStyle } from 'react-native';

/** Matches design token `shadows.card`: 0 8px 24px rgba(44,42,41,0.06) */
export const CARD_SHADOW: ViewStyle = {
  shadowColor: '#2C2A29',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
};

/** Matches design token `shadows.button`: 0 4px 12px rgba(255,142,83,0.2) */
export const BUTTON_SHADOW: ViewStyle = {
  shadowColor: '#FF8E53',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 8,
  elevation: 4,
};

/** Matches design token `shadows.inner`: inset 0 2px 4px rgba(0,0,0,0.05) */
export const INNER_SHADOW: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 1,
};

/**
 * Returns scale + opacity pressed state for use in Pressable style callbacks.
 * @param pressed  — Pressable's `pressed` boolean
 * @param amount   — scale target when pressed (default 0.97)
 */
export function pressScale(
  pressed: boolean,
  amount = 0.97,
): { transform: { scale: number }[]; opacity: number } {
  return {
    transform: [{ scale: pressed ? amount : 1 }],
    opacity: pressed ? 0.88 : 1,
  };
}

/** Minimum 44×44 pt accessible tap target for icon-only buttons. */
export const HIT_SLOP_SM = { top: 10, bottom: 10, left: 10, right: 10 } as const;
export const HIT_SLOP_MD = { top: 14, bottom: 14, left: 14, right: 14 } as const;
