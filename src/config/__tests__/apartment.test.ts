/**
 * Tests for the Studio Apartment level definition and the attraction profile.
 * Pure config + logic — no RN, no mocks needed.
 */
import { APARTMENT_SLOTS, autoAssignPlacements, getSlotById } from '../apartment';
import { PLACEABLE_ITEMS, getAttractionProfile } from '../../utils/spawnCalculator';
import type { ItemCategory } from '../../types';

const ALL_CATEGORIES: ItemCategory[] = ['food', 'toy', 'shelter', 'decor'];

describe('Apartment level definition', () => {
  it('defines exactly 6 slots with unique IDs', () => {
    expect(APARTMENT_SLOTS.length).toBe(6);
    const ids = APARTMENT_SLOTS.map((s) => s.slot_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every item category is placeable in at least one slot (no orphan items)', () => {
    for (const category of ALL_CATEGORIES) {
      const accepting = APARTMENT_SLOTS.filter((s) => s.accepts.includes(category));
      expect(accepting.length).toBeGreaterThan(0);
    }
  });

  it('every slot accepts at least one valid category and sits inside the canvas', () => {
    for (const slot of APARTMENT_SLOTS) {
      expect(slot.accepts.length).toBeGreaterThan(0);
      for (const cat of slot.accepts) {
        expect(ALL_CATEGORIES).toContain(cat);
      }
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThanOrEqual(92); // slot box is ~38px wide
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeLessThanOrEqual(88);
    }
  });

  it('getSlotById resolves known slots and misses unknown ones', () => {
    expect(getSlotById('rug')?.label).toBe('On the rug');
    expect(getSlotById('bathtub')).toBeUndefined();
  });
});

describe('autoAssignPlacements', () => {
  it('assigns items to category-compatible slots only', () => {
    const placements = autoAssignPlacements(['item_kibble_bowl', 'item_toy_mouse']);
    for (const [slotId, itemId] of Object.entries(placements)) {
      const slot = getSlotById(slotId)!;
      const def = PLACEABLE_ITEMS.find((i) => i.item_id === itemId)!;
      expect(slot.accepts).toContain(def.category);
    }
    expect(Object.values(placements)).toEqual(
      expect.arrayContaining(['item_kibble_bowl', 'item_toy_mouse']),
    );
  });

  it('never double-books a slot', () => {
    const placements = autoAssignPlacements([
      'item_kibble_bowl', 'item_water_dish', 'item_toy_mouse',
      'item_old_blanket', 'item_flower_pot', 'item_yarn_ball',
    ]);
    const slots = Object.keys(placements);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('drops overflow items when no compatible slot is free (arrangement, not loss)', () => {
    // 7 food items but only 3 food-accepting slots
    const placements = autoAssignPlacements(Array(7).fill('item_kibble_bowl'));
    const foodSlots = APARTMENT_SLOTS.filter((s) => s.accepts.includes('food'));
    expect(Object.keys(placements).length).toBe(foodSlots.length);
  });

  it('skips unknown item IDs', () => {
    const placements = autoAssignPlacements(['item_does_not_exist']);
    expect(Object.keys(placements).length).toBe(0);
  });
});

describe('getAttractionProfile', () => {
  it('summarises the item mix per category with counts', () => {
    const profile = getAttractionProfile([
      'item_kibble_bowl', 'item_tuna_can', 'item_toy_mouse',
    ]);
    const food = profile.find((n) => n.category === 'food');
    const toy = profile.find((n) => n.category === 'toy');
    expect(food?.count).toBe(2);
    expect(toy?.count).toBe(1);
    expect(food?.blurb.length).toBeGreaterThan(0);
  });

  it('returns an empty profile for no items and ignores unknown IDs', () => {
    expect(getAttractionProfile([])).toEqual([]);
    expect(getAttractionProfile(['item_nonexistent'])).toEqual([]);
  });
});
