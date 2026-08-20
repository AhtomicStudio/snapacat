/**
 * SnapaCat design tokens.
 *
 * WHY THIS REPLACED tailwind.config.js
 *
 * The tokens were previously expressed as a Tailwind theme and consumed
 * through NativeWind `className` props. On React Native 0.85, NativeWind 4.2's
 * css-interop did not reliably apply them: `className="px-sm py-xs
 * rounded-full"` produced no padding and no radius, so chips rendered as
 * full-bleed square bars, and a `style` prop written as a FUNCTION — the
 * idiomatic `({ pressed }) => …` Pressable API — was discarded outright, so
 * buttons rendered with no background at all. Neither failure warned.
 *
 * The result was an app where most screens were substantially unstyled while
 * the code read as though it were styled. Tokens as plain objects can't fail
 * that way: if a value is wrong you can see it, and if it's missing the type
 * checker says so.
 *
 * The palette values are carried over unchanged from the old Tailwind theme —
 * this was a change of mechanism, not of design.
 */

import type { TextStyle, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const color = {
  /** Dominant action / accent. */
  ginger: '#FF8E53',
  gingerDark: '#E67035',
  gingerLight: '#FFE8DC',
  nosePink: '#FFAAA6',

  /** App background — a warm off-white, never pure #FFF. */
  cream: '#FAF6F0',
  milk: '#FFFFFF',
  charcoal: '#2C2A29',

  /** UI roles. Prefer these over reaching for a brand colour directly. */
  background: '#FAF6F0',
  surface: '#FFFFFF',
  /** A second surface for things sitting ON a card. */
  surfaceSunken: '#FAF6F0',
  textPrimary: '#2C2A29',
  textSecondary: '#706B67',
  textMuted: '#A49E98',
  border: '#EAE3DA',
  /** The border colour most rules actually want — a hairline, not a line. */
  borderSoft: 'rgba(234,227,218,0.8)',

  success: '#A8D0E6',
  warning: '#F8D49B',
  error: '#F79E89',
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

/** The 4px scale. Every gap, pad and margin should come from here. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ---------------------------------------------------------------------------
// Radii
// ---------------------------------------------------------------------------

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  /** Pills and circles. */
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * Font families.
 *
 * These names only resolve once the font files are linked (see
 * docs/pixel-animation-pipeline.md §8). Until then every one of them falls
 * back to the platform default, which is why the app currently renders in
 * Roboto despite the tokens asking for Quicksand. Kept named rather than
 * silently dropped so linking the fonts is a one-file change.
 */
export const font = {
  display: 'Quicksand',
  sans: 'Outfit',
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  title: 32,
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/**
 * Ready-made text styles.
 *
 * Line heights are set explicitly. React Native's default leading is tight
 * enough that multi-line body copy reads as a block, and it differs between
 * platforms — so it is never left to the default on anything that can wrap.
 */
export const text = {
  title: {
    fontSize: fontSize.title,
    fontWeight: weight.heavy,
    color: color.textPrimary,
  },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: weight.heavy,
    color: color.textPrimary,
  },
  subheading: {
    fontSize: fontSize.lg,
    fontWeight: weight.bold,
    color: color.textPrimary,
  },
  body: {
    fontSize: fontSize.sm,
    color: color.textPrimary,
    lineHeight: 20,
  },
  secondary: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
    lineHeight: 18,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: weight.bold,
    color: color.textSecondary,
  },
} as const satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

/** 0 8px 24px rgba(44,42,41,0.06) */
export const shadow = {
  card: {
    shadowColor: color.charcoal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  button: {
    shadowColor: color.ginger,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  inner: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
} as const satisfies Record<string, ViewStyle>;

// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

/**
 * A card surface. The single most repeated recipe in the app, and previously
 * written out by hand — with drifting radii — on every screen.
 */
export const card: ViewStyle = {
  backgroundColor: color.surface,
  borderRadius: radius.lg,
  padding: space.md,
  ...shadow.card,
};

/**
 * A pill.
 *
 * `alignSelf: 'flex-start'` is the load-bearing part and the reason chips
 * rendered as full-width bars before: a View in a column parent stretches to
 * the parent's width unless told otherwise, so a chip without it is a banner.
 */
export const pill: ViewStyle = {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.xs,
  paddingHorizontal: space.sm + 2,
  paddingVertical: space.xs + 1,
  borderRadius: radius.full,
};

/** Minimum accessible tap target. Nothing interactive should be smaller. */
export const TAP_MIN = 44;

/** Screen gutter. One value, so every screen's content lines up with itself. */
export const GUTTER = space.lg;
