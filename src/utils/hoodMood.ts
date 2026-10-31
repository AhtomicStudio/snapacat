/**
 * Prose readouts for The Hood.
 *
 * WHY THIS EXISTS
 *
 * The Hood used to show "Spawn Chances — 100% (+71 from items)" and "~6 of 6
 * cat slots active" on a progress bar. All of that was accurate, and all of it
 * was wrong for this game.
 *
 * A collection game like this runs on not-quite-knowing. Once the screen states
 * the exact odds, placing a bowl stops being "let's see who turns up" and
 * becomes arithmetic — and arithmetic has a correct answer, after which there
 * is nothing left to do. Neko Atsume never shows a number; you learn what a
 * goodie does by watching who arrives.
 *
 * So the maths in spawnCalculator stays exactly as it is — it still decides
 * everything — and this module is the only thing allowed to describe it to the
 * player. Nothing here returns a numeral.
 */

import type { AttractionNote } from './spawnCalculator';
import { MAX_HOOD_CATS } from './spawnCalculator';

/**
 * How busy the Hood looks right now.
 *
 * Bands are derived from MAX_HOOD_CATS rather than hard-coded, so raising the
 * cap doesn't silently pin every Hood at "quiet".
 */
export function describeActivity(expectedCats: number): string {
  if (expectedCats <= 0) return 'Nobody about just yet.';
  const share = expectedCats / MAX_HOOD_CATS;
  if (share >= 0.95) return 'Packed. Word has clearly got around.';
  if (share >= 0.7)  return 'Busy out there.';
  if (share >= 0.45) return 'A few regulars are hanging about.';
  if (share >= 0.2)  return 'Someone stopped by.';
  return 'Quiet. One curious face.';
}

/**
 * What the current item mix is pulling in — the closest thing to a hint the
 * player gets, and deliberately vague about how much.
 */
export function describeAttraction(notes: AttractionNote[]): string | null {
  if (notes.length === 0) return null;
  // Strongest category first; ties keep catalogue order, which is stable.
  const ranked = notes.slice().sort((a, b) => b.count - a.count);
  const lead = ranked[0]!;
  if (ranked.length === 1) return lead.blurb + '.';
  const second = ranked[1]!;
  return `${lead.blurb}, and ${lowerFirst(second.blurb)}.`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * The nudge shown when a Hood is bare. This is the only place the game tells
 * the player outright that items matter — after that they work it out.
 */
export const EMPTY_HOOD_HINT = 'Put something out and see who turns up.';

/**
 * Line shown when a cat is tapped and it came for a specific item. Keeps the
 * cause-and-effect legible without ever quoting a percentage.
 */
export function describeVisitReason(itemLabel: string | null): string {
  if (!itemLabel) return 'Just passing through.';
  return `Came for the ${itemLabel.toLowerCase()}.`;
}
