/**
 * SnapaCat — Theme catalogue.
 * Static, local-only. No server calls. All themes are purely cosmetic:
 * they change Hood canvas colours and accent tints but never affect gameplay.
 */
import type { Theme } from '../types';

export const THEMES: Theme[] = [
  {
    theme_id: 'theme_default',
    name: 'Ginger Alley',
    description: 'The classic warm neighbourhood vibe.',
    cost: 0,
    sky_colors: ['#87CEEB', '#E0F6FF'],
    ground_color: '#A8D5A2',
    accent_color: '#FF8E53',
    preview_gradient: ['#FF8E53', '#FFAAA6'],
    icon: '🧡',
  },
  {
    theme_id: 'theme_midnight',
    name: 'Midnight Prowl',
    description: 'Navy skies and neon-touched shadows.',
    cost: 100,
    sky_colors: ['#1A1C29', '#2C304E'],
    ground_color: '#232540',
    accent_color: '#8B8FE8',
    preview_gradient: ['#1A1C29', '#8B8FE8'],
    icon: '🌙',
  },
  {
    theme_id: 'theme_sakura',
    name: 'Sakura Garden',
    description: 'Soft blossoms and gentle rose tones.',
    cost: 200,
    sky_colors: ['#FDD5D8', '#FCEEF0'],
    ground_color: '#F2C4CE',
    accent_color: '#E88FA4',
    preview_gradient: ['#FDD5D8', '#E88FA4'],
    icon: '🌸',
  },
  {
    theme_id: 'theme_urban_jungle',
    name: 'Urban Jungle',
    description: 'Mossy walls and chain-link greens.',
    cost: 350,
    sky_colors: ['#3D5A3E', '#7A9E7E'],
    ground_color: '#4A6741',
    accent_color: '#7FC97F',
    preview_gradient: ['#3D5A3E', '#7FC97F'],
    icon: '🌿',
  },
  {
    theme_id: 'theme_golden_hour',
    name: 'Golden Hour',
    description: 'Amber skies, long shadows, magic light.',
    cost: 500,
    sky_colors: ['#F4A140', '#FDD28A'],
    ground_color: '#C8813B',
    accent_color: '#F4A140',
    preview_gradient: ['#F4A140', '#FDD28A'],
    icon: '🌅',
  },
];

/** Quick lookup by ID. Returns undefined for unknown IDs. */
export function getThemeById(themeId: string): Theme | undefined {
  return THEMES.find((t) => t.theme_id === themeId);
}

/** The default theme, always free and always available. */
export const DEFAULT_THEME: Theme = THEMES[0]!;
