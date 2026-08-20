/**
 * What each environment's ground and mid-ground are actually made of.
 *
 * WHY THIS IS SEPARATE FROM environments.ts
 *
 * `EnvironmentPreset` is gameplay and Shop copy — cost, spawn multiplier,
 * blurb. This is set dressing. Keeping them apart means the Shop can gain
 * environments without a renderer change, and the renderer can gain detail
 * without touching anything the economy reads.
 *
 * WHY IT EXISTS AT ALL
 *
 * Every Hood was drawing the same flat green field, so "Back Alley" and
 * "Garden" and "Rooftop" were the same lawn with a different label. A Hood is
 * supposed to be a place you recognise; the ground is most of what says which
 * place it is. A parking lot is asphalt with a brick wall down one side, and
 * once you widen the world so the player pans across it, a featureless field
 * gets more obvious, not less.
 */

export type WallStyle = 'brick' | 'concrete' | 'planks' | 'hedge' | 'tile' | 'none';

export interface SceneDressing {
  /** Ground plane base colour, before the time-of-day wash. */
  ground: string;
  /** Flecks scattered across the ground — grit, leaves, gravel. */
  speckle: string;
  /** Mid-ground wall running along the horizon. */
  wall: string;
  /** Mortar / seam colour drawn into the wall. */
  seam: string;
  /** How the wall is patterned. */
  wallStyle: WallStyle;
  /** Wall height in points. 0 renders no wall — open sky to the ground. */
  wallHeight: number;
}

const DEFAULT_DRESSING: SceneDressing = {
  ground: '#6E6A63',
  speckle: '#3A3733',
  wall: '#8A5346',
  seam: '#6B3E34',
  wallStyle: 'brick',
  wallHeight: 96,
};

/**
 * Ground and wall per environment.
 *
 * Palettes are deliberately desaturated. The old scene used #A8D5A2 grass and
 * #87CEEB sky — primary, high-chroma colours that read as clip art. Cosy games
 * sit in a narrow, muted band and let one or two accents carry the eye, which
 * here is the cats.
 */
const DRESSING: Record<string, SceneDressing> = {
  env_alley: {
    // Asphalt, not lawn. This is a car park behind some buildings.
    ground: '#6B6862',
    speckle: '#3E3B37',
    wall: '#8A5346',
    seam: '#66392F',
    wallStyle: 'brick',
    // Deliberately short enough that the skyline still shows above it — the
    // city behind the wall is what says this alley is inside a neighbourhood.
    wallHeight: 74,
  },
  env_rooftop: {
    ground: '#8A8378',
    speckle: '#5A544C',
    wall: '#9C948A',
    seam: '#7A736A',
    wallStyle: 'concrete',
    // A low parapet — the whole appeal of a roof is the open sky above it.
    wallHeight: 46,
  },
  env_garden: {
    ground: '#7E9464',
    speckle: '#57683F',
    wall: '#4E6B42',
    seam: '#3C5432',
    wallStyle: 'hedge',
    wallHeight: 88,
  },
  env_laundromat: {
    ground: '#9E9689',
    speckle: '#726A5F',
    wall: '#C8BCA8',
    seam: '#A2947E',
    wallStyle: 'tile',
    wallHeight: 120,
  },
  env_night_market: {
    ground: '#5E5750',
    speckle: '#3A342E',
    wall: '#6E4A3E',
    seam: '#523529',
    wallStyle: 'planks',
    wallHeight: 110,
  },
  // Not reachable through HoodScene today — slot-based interiors render through
  // ApartmentCanvas — but kept so the map stays exhaustive if that changes.
  env_apartment: {
    ground: '#9A7B58',
    speckle: '#7A5E41',
    wall: '#CBB79C',
    seam: '#A9906F',
    wallStyle: 'planks',
    wallHeight: 130,
  },
};

export function getDressing(envId: string | null | undefined): SceneDressing {
  return DRESSING[envId ?? ''] ?? DEFAULT_DRESSING;
}
