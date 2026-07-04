/**
 * SnapaCat — Studio Apartment level definition.
 *
 * The apartment is the first slot-based environment: instead of free-form item
 * stacking, it offers exactly six curated placement spots, each accepting only
 * certain item categories. Scarcity is the strategy — six spots, 25 items.
 *
 * Coordinates are percentages of the apartment canvas (x from left, y from
 * top), chosen to sit naturally on the drawn furniture.
 */
import type { ItemCategory } from '../types';
import { PLACEABLE_ITEMS } from '../utils/spawnCalculator';

export interface PlacementSlot {
  slot_id: string;
  /** Short label shown in the item-picker sheet, e.g. "On the shelf". */
  label: string;
  /** Anchor position within the canvas, percent from left / top. */
  x: number;
  y: number;
  /** Item categories this spot can hold. */
  accepts: ItemCategory[];
}

export const APARTMENT_SLOTS: PlacementSlot[] = [
  {
    slot_id: 'shelf',
    label: 'On the shelf',
    x: 13, y: 12,
    accepts: ['toy', 'decor'],
  },
  {
    slot_id: 'windowsill',
    label: 'On the windowsill',
    x: 72, y: 32,
    accepts: ['toy', 'decor'],
  },
  {
    slot_id: 'sofa',
    label: 'On the sofa',
    x: 15, y: 50,
    accepts: ['shelter', 'toy'],
  },
  {
    slot_id: 'floor_left',
    label: 'Beside the sofa',
    x: 36, y: 62,
    accepts: ['food', 'shelter'],
  },
  {
    slot_id: 'rug',
    label: 'On the rug',
    x: 52, y: 74,
    accepts: ['toy', 'food'],
  },
  {
    slot_id: 'floor_right',
    label: 'Under the window',
    x: 80, y: 64,
    accepts: ['food', 'shelter', 'decor'],
  },
];

export function getSlotById(slotId: string): PlacementSlot | undefined {
  return APARTMENT_SLOTS.find((s) => s.slot_id === slotId);
}

/**
 * Distributes a flat placed-items list into apartment slots, first-fit by
 * category compatibility. Items that find no free compatible slot are simply
 * left unplaced — placements are free rearrangement, never item loss (items
 * are permanent unlocks; `placed_items` is just the current arrangement).
 *
 * Used to migrate Hoods that switch to the apartment before the user has
 * arranged anything by hand.
 */
export function autoAssignPlacements(placedItems: string[]): Record<string, string> {
  const placements: Record<string, string> = {};
  const taken = new Set<string>();

  for (const itemId of placedItems) {
    const def = PLACEABLE_ITEMS.find((i) => i.item_id === itemId);
    if (!def) continue;
    const slot = APARTMENT_SLOTS.find(
      (s) => !taken.has(s.slot_id) && s.accepts.includes(def.category),
    );
    if (!slot) continue;
    placements[slot.slot_id] = itemId;
    taken.add(slot.slot_id);
  }

  return placements;
}
