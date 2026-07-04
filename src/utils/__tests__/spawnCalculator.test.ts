import {
  calculateSpawnChances,
  canAddItem,
  addItem,
  removeItem,
  PLACEABLE_ITEMS,
  MAX_HOOD_CATS,
} from '../spawnCalculator';
import type { Hood } from '../../types';

describe('Spawn Calculator & Item Placement Helpers', () => {
  let mockHood: Hood;

  beforeEach(() => {
    mockHood = {
      name: 'Test Hood',
      custom_bg_url: null,
      placed_items: [],
    };
  });

  describe('calculateSpawnChances', () => {
    it('returns base chance when no items are placed', () => {
      const result = calculateSpawnChances([]);
      expect(result.baseChance).toBe(30);
      expect(result.totalBonus).toBe(0);
      expect(result.finalChance).toBe(30);
      expect(result.expectedCats).toBe(2); // Math.round((30/100)*6) = 2
    });

    it('adds bonuses correctly for multiple items', () => {
      // Kibble Bowl (+15) + Toy Mouse (+10) = 25 bonus, 30+25=55% chance
      const result = calculateSpawnChances(['item_kibble_bowl', 'item_toy_mouse']);
      expect(result.totalBonus).toBe(25);
      expect(result.finalChance).toBe(55);
      expect(result.expectedCats).toBe(3); // Math.round((55/100)*6) = 3
    });

    it('clamps final chance to 100% and expectedCats to MAX_HOOD_CATS (6)', () => {
      // Heated Cat House (+40) + Golden Mackerel (+35) + Premium Kibble (+30)
      // = 105 bonus → 30+105 = 135, clamped to 100
      const result = calculateSpawnChances([
        'item_heated_cat_house',
        'item_golden_mackerel',
        'item_premium_kibble',
      ]);
      expect(result.totalBonus).toBe(105);
      expect(result.finalChance).toBe(100);
      expect(result.expectedCats).toBe(6);
    });

    it('ignores unknown item IDs (contributes 0 bonus)', () => {
      const result = calculateSpawnChances(['item_koi_pond', 'item_zen_garden']);
      expect(result.totalBonus).toBe(0);
      expect(result.finalChance).toBe(30);
    });

    it('applies environment multiplier correctly', () => {
      // Base 30 + 15 kibble = 45, multiplied by 1.3 (Garden env) = 58.5 -> 59
      const result = calculateSpawnChances(['item_kibble_bowl'], 1.3);
      expect(result.finalChance).toBe(59);
      expect(result.expectedCats).toBe(4); // Math.round((59/100)*6) = 4
    });
  });

  describe('canAddItem', () => {
    it('allows adding an item within stack limits', () => {
      expect(canAddItem(mockHood, 'item_kibble_bowl')).toBe(true);
    });

    it('disallows adding an item exceeding stack limits', () => {
      // Kibble Bowl max stack is 2
      mockHood.placed_items = ['item_kibble_bowl', 'item_kibble_bowl'];
      expect(canAddItem(mockHood, 'item_kibble_bowl')).toBe(false);
    });

    it('returns false for unrecognized items', () => {
      expect(canAddItem(mockHood, 'invalid_item')).toBe(false);
    });
  });

  describe('addItem', () => {
    it('appends item to array if allowed', () => {
      const updated = addItem(mockHood, 'item_yarn_ball');
      expect(updated).toEqual(['item_yarn_ball']);
    });

    it('returns unchanged array if not allowed', () => {
      // Premium Kibble max stack is 1
      mockHood.placed_items = ['item_premium_kibble'];
      const updated = addItem(mockHood, 'item_premium_kibble');
      expect(updated).toEqual(['item_premium_kibble']);
    });
  });

  describe('removeItem', () => {
    it('removes the last matching occurrence', () => {
      mockHood.placed_items = ['item_yarn_ball', 'item_toy_mouse', 'item_yarn_ball'];
      const updated = removeItem(mockHood, 'item_yarn_ball');
      // Should remove the last item_yarn_ball (index 2)
      expect(updated).toEqual(['item_yarn_ball', 'item_toy_mouse']);
    });

    it('returns unchanged array if item not found', () => {
      mockHood.placed_items = ['item_toy_mouse'];
      const updated = removeItem(mockHood, 'item_yarn_ball');
      expect(updated).toEqual(['item_toy_mouse']);
    });
  });
});
