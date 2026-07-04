/**
 * SnapaCat design tokens -> NativeWind utilities.
 * Source of truth: .agent/skills/brand-identity/resources/design-tokens.json
 * Keep this file in sync with that JSON; never hard-code hex values in components.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand
        ginger: '#FF8E53', // dominant action / accent
        'ginger-dark': '#E67035',
        'ginger-light': '#FFE8DC',
        'nose-pink': '#FFAAA6',
        cream: '#FAF6F0', // app background
        milk: '#FFFFFF',
        charcoal: '#2C2A29', // primary text
        // UI roles
        background: '#FAF6F0',
        'card-bg': '#FFFFFF',
        'text-primary': '#2C2A29',
        'text-secondary': '#706B67',
        border: '#EAE3DA',
        success: '#A8D0E6',
        warning: '#F8D49B',
        error: '#F79E89',
      },
      borderRadius: {
        none: '0px',
        sm: '8px',
        md: '16px', // radii.md
        lg: '24px', // radii.lg
        full: '9999px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
      },
      fontFamily: {
        // Requires the font files to be linked via react-native.config.js + assets.
        sans: ['Outfit', 'Quicksand', 'Nunito', 'System'],
        display: ['Quicksand', 'Outfit', 'System'],
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        xxl: '1.5rem',
        title: '2rem',
      },
      fontWeight: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      boxShadow: {
        // NativeWind maps these to native shadow props / Android elevation.
        card: '0px 8px 24px rgba(44, 42, 41, 0.06)',
        button: '0px 4px 12px rgba(255, 142, 83, 0.2)',
        inner: 'inset 0px 2px 4px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
