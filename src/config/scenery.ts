/**
 * Scenery — the things in a Hood that the player did not put there.
 *
 * WHY THIS IS SEPARATE FROM THE ITEM SYSTEM
 *
 * Everything in a Hood up to now was either a cat or a goodie the player had
 * bought and placed. That makes an empty Hood genuinely empty: the world is
 * two and a half screens across, you own six items, and panning away from the
 * middle found nothing at all. A street is not made of your belongings — it
 * has a bin by the wall and crates stacked by a door, and those are what make
 * the ground feel like somewhere rather than like a surface items sit on.
 *
 * So scenery is fixed per environment. It cannot be bought, moved, or removed,
 * it does not take an anchor, and it does not affect spawn rates. It exists to
 * be there, and to say something back when you tap it.
 *
 * WHY IT IS ALL BIGGER THAN IT FIRST WAS
 *
 * The first pass authored everything at or below cat height, and then
 * multiplied most of it by less than one. Measured on screen, the mean
 * scenery height came out at 0.56x a cat and nothing reached 0.8x. A
 * street gets its sense of scale from things being BIGGER than you; a
 * world where the tallest object is the cat reads as a toy set, which is
 * exactly how it looked. Props are bottom-anchored, so raising the scale
 * grows them upward off the ground line and nothing needs repositioning.
 *
 * WHY IT ALL SITS AT THE BACK
 *
 * Depths here are deliberately below 0.3, which puts every piece of scenery
 * behind the band where cats and items live and, not coincidentally, behind
 * the shallowest placement spot (SPOT_MIN_DEPTH in scene.ts). Scenery that
 * crowded the foreground would compete with the things the player actually
 * arranged, and it would get in the way of the taps that matter.
 */
import type { PropMotion } from './propMotion';

export interface SceneryProp {
  /** Art id in src/assets/props. */
  id: string;
  /** Position across the world, 0 (far left) … 1 (far right). */
  u: number;
  /** Depth on the plane, 0 (horizon) … 1 (front edge). */
  depth: number;
  /** Multiplier on the nominal actor size. Scenery is not all cat-sized. */
  scale?: number;
  motion?: PropMotion;
  /**
   * What tapping it says.
   *
   * These are the only writing in the Hood that is not a status line, so they
   * carry the tone of the place. Short, dry, and about the neighbourhood
   * rather than about the player — a line that congratulates you for tapping
   * a bin is worse than no line.
   */
  line: string;
}

const ALLEY: SceneryProp[] = [
  { id: 'scenery_bin', u: 0.12, depth: 0.2, scale: 1.18, line: 'Something rustled in there. Probably nothing.' },
  { id: 'scenery_crates', u: 0.56, depth: 0.14, scale: 1.2, line: 'Stacked by the back door. Smells faintly of fish boxes.' },
  { id: 'scenery_bin', u: 0.86, depth: 0.26, scale: 1.08, line: 'Lid never did fit properly.' },
];

const ROOFTOP: SceneryProp[] = [
  { id: 'scenery_vent', u: 0.2, depth: 0.18, scale: 1.35, line: 'Warm air, all year round. The cats found it first.' },
  { id: 'scenery_water_tank', u: 0.62, depth: 0.1, scale: 1.5, line: 'Nobody remembers who put it up there.' },
  { id: 'scenery_vent', u: 0.88, depth: 0.24, scale: 1.15, line: 'Humming away to itself.' },
];

const GARDEN: SceneryProp[] = [
  { id: 'scenery_bush', u: 0.14, depth: 0.22, scale: 1.5, line: 'Perfect for an ambush, if you are small enough.' },
  { id: 'scenery_birdbath', u: 0.52, depth: 0.16, scale: 1.4, line: 'The regulars here have feathers. Mostly.' },
  { id: 'scenery_bush', u: 0.82, depth: 0.12, scale: 1.3, line: 'Somebody has been sleeping under this one.' },
];

const LAUNDROMAT: SceneryProp[] = [
  { id: 'scenery_laundry_pile', u: 0.18, depth: 0.2, scale: 1.3, line: 'Still warm. This spot gets claimed within the hour.' },
  { id: 'scenery_soap_bottle', u: 0.48, depth: 0.14, scale: 1.15, line: 'Lavender, allegedly.' },
  { id: 'scenery_laundry_pile', u: 0.84, depth: 0.25, scale: 1.2, line: 'Folded by someone in a hurry.' },
];

const NIGHT_MARKET: SceneryProp[] = [
  {
    id: 'scenery_lantern_pole',
    u: 0.16,
    depth: 0.12,
    scale: 1.5,
    // Hanging, so it sways. Translation only — see propMotion.
    motion: { kind: 'sway', amplitude: 2, periodMs: 5200 },
    line: 'Someone lights these every evening without being asked.',
  },
  { id: 'scenery_fruit_crate', u: 0.54, depth: 0.2, scale: 1.15, line: 'Nobody is buying the bruised ones.' },
  {
    id: 'scenery_lantern_pole',
    u: 0.9,
    depth: 0.16,
    scale: 1.4,
    motion: { kind: 'sway', amplitude: 2, periodMs: 6100 },
    line: 'The one at the end always goes out first.',
  },
];

const SCENERY: Record<string, SceneryProp[]> = {
  env_alley: ALLEY,
  env_rooftop: ROOFTOP,
  env_garden: GARDEN,
  env_laundromat: LAUNDROMAT,
  env_night_market: NIGHT_MARKET,
  // The apartment draws its own furniture in ApartmentCanvas and never goes
  // through HoodScene, so it has none here.
  env_apartment: [],
};

export function sceneryFor(envId: string | null | undefined): SceneryProp[] {
  return SCENERY[envId ?? ''] ?? ALLEY;
}
