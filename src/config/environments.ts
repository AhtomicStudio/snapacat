/**
 * SnapaCat — Environment preset catalogue.
 * Static, local-only. Environments set mood, spawn multipliers, and optional
 * forced time-of-day on a Hood. They layer on top of Themes.
 */
import type { EnvironmentPreset } from '../types';

export const ENVIRONMENTS: EnvironmentPreset[] = [
  {
    env_id: 'env_alley',
    name: 'Back Alley',
    description: 'The gritty neighbourhood baseline. Every cat feels welcome.',
    cost: 0,
    icon: '🧱',
    spawn_multiplier: 1.0,
    forced_time_of_day: null,
    bonus_tag: 'Baseline',
  },
  {
    env_id: 'env_rooftop',
    name: 'Rooftop',
    description: 'High up with the wind. Rarer cats venture here.',
    cost: 75,
    icon: '🏙️',
    spawn_multiplier: 1.2,
    forced_time_of_day: null,
    bonus_tag: '+20% rare visitors',
  },
  {
    env_id: 'env_apartment',
    name: 'Studio Apartment',
    description: 'A sunlit studio all to the cats. Six curated spots — arrange them well.',
    cost: 120,
    icon: '🛋️',
    spawn_multiplier: 1.25,
    forced_time_of_day: null,
    bonus_tag: '+25% • 6 placement spots',
  },
  {
    env_id: 'env_garden',
    name: 'Garden',
    description: 'Lush greenery and soft light. Cats can\'t resist it.',
    cost: 150,
    icon: '🌻',
    spawn_multiplier: 1.3,
    forced_time_of_day: 'day',
    bonus_tag: '+30% spawn rate',
  },
  {
    env_id: 'env_laundromat',
    name: 'Laundromat',
    description: 'Warm, humid, and inviting. Friendly cats love it here.',
    cost: 225,
    icon: '🧺',
    spawn_multiplier: 1.15,
    forced_time_of_day: null,
    bonus_tag: '+15% friendly cats',
  },
  {
    env_id: 'env_night_market',
    name: 'Night Market',
    description: 'Neon lights and festival smells. Cats go wild at night.',
    cost: 400,
    icon: '🏮',
    spawn_multiplier: 1.5,
    forced_time_of_day: 'night',
    bonus_tag: '×1.5 at night',
  },
];

/** Quick lookup by ID. Returns undefined for unknown IDs. */
export function getEnvironmentById(envId: string): EnvironmentPreset | undefined {
  return ENVIRONMENTS.find((e) => e.env_id === envId);
}

/** The default environment, always free and always available. */
export const DEFAULT_ENVIRONMENT: EnvironmentPreset = ENVIRONMENTS[0]!;
