/**
 * How each goodie behaves once it is standing in a Hood.
 *
 * Twenty-five props were rendered as motionless PNGs, which is what made the
 * scene read as a diorama rather than a place — the cats breathed and nothing
 * else did. A wind chime that never moves is a wind chime in a photograph.
 *
 * TRANSLATION AND OPACITY ONLY. NEVER ROTATION.
 *
 * A hanging mobile genuinely wants to swing, and rotating the sprite is the
 * obvious way to do it. It is also the one thing the whole art pipeline exists
 * to avoid: these are 32px drawings shipped at 4x with a hard 1px keyline, and
 * any rotation that is not a multiple of 90 degrees resamples that keyline into
 * a grey smear. scripts/sprites/parts.js refuses to rotate a leg for the same
 * reason. A two-pixel horizontal shift on a sine reads as a sway at this size
 * and costs the art nothing, so that is what a sway is here.
 *
 * Everything below is native-driver safe — translateX, translateY and opacity —
 * so seventeen animating props cost no JS per frame.
 */

export type PropMotion =
  | { kind: 'still' }
  /** Horizontal drift. For anything hanging. */
  | { kind: 'sway'; amplitude: number; periodMs: number }
  /** Vertical drift. For anything floating or springy. */
  | { kind: 'bob'; amplitude: number; periodMs: number };

/** A prop that gives off light after dark. */
export interface PropLight {
  /** Glow colour. */
  color: string;
  /** Radius as a multiple of the prop's rendered size. */
  spread: number;
  /** How much the glow breathes, 0 = steady. */
  flicker: number;
}

const STILL: PropMotion = { kind: 'still' };

/**
 * Periods are deliberately not round numbers and not shared.
 *
 * Two chimes on 3000ms drift into lockstep and read as one mechanism; the same
 * failure as six cats breathing in unison, which CatSprite already staggers
 * against. Coprime-ish periods mean a Hood never settles into a visible beat.
 */
const MOTION: Record<string, PropMotion> = {
  // ── Hanging things ──────────────────────────────────────────────────
  item_wind_chime: { kind: 'sway', amplitude: 2, periodMs: 3100 },
  item_fish_mobile: { kind: 'sway', amplitude: 2, periodMs: 3700 },
  item_butterfly_mobile: { kind: 'sway', amplitude: 3, periodMs: 2900 },
  item_feather_wand: { kind: 'sway', amplitude: 2, periodMs: 4300 },

  // ── Floating and springy things ─────────────────────────────────────
  // The laser dot is the one prop that should look restless rather than
  // becalmed, so it gets the shortest period on the board.
  item_laser_dot: { kind: 'bob', amplitude: 2, periodMs: 1300 },
  item_spring_toy: { kind: 'bob', amplitude: 2, periodMs: 1900 },
  item_golden_mackerel: { kind: 'bob', amplitude: 1, periodMs: 2600 },

  // ── Everything else sits on the ground and stays there ──────────────
};

/**
 * Props that light up after dark.
 *
 * Only three, on purpose. A night Hood where every object glows has no focal
 * point and no darkness for the light to mean anything against — the whole
 * value of a lantern is the unlit ground around it.
 */
const LIGHT: Record<string, PropLight> = {
  item_lantern: { color: '#FFC978', spread: 1.5, flicker: 0.14 },
  item_neon_paw_sign: { color: '#FF7FD0', spread: 1.3, flicker: 0.06 },
  item_heated_cat_house: { color: '#FF9A5C', spread: 1.0, flicker: 0.1 },
};

export function propMotion(itemId: string): PropMotion {
  return MOTION[itemId] ?? STILL;
}

export function propLight(itemId: string): PropLight | null {
  return LIGHT[itemId] ?? null;
}
