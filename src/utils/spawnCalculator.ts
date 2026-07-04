import type { ItemCategory, ItemTier } from '../types';

/** Hard cap on simultaneously rendered cat sprites. Architectural invariant. */
export const MAX_HOOD_CATS = 6;

/** Base percentage chance any given cat slot is occupied without items or env bonus. */
const BASE_SPAWN_CHANCE = 30;

// ---------------------------------------------------------------------------
// Item catalog
// ---------------------------------------------------------------------------

export interface PlaceableItemDef {
  item_id: string;
  label: string;
  emoji: string;
  category: ItemCategory;
  tier: ItemTier;
  /** PawPoints cost in the Shop. 0 = free for all users. */
  cost: number;
  /** Percentage points added to the base spawn chance. */
  spawn_bonus: number;
  /** Max copies of this item allowed in a single Hood at once. */
  max_stack: number;
  /** One-line flavour text shown in the Shop. */
  description: string;
}

/**
 * Full placeable-item catalog.
 * Sorted by tier (common → rare → legendary) then cost within each tier.
 * Items with cost 0 are in DEFAULT_UNLOCKED_ITEMS and pre-unlocked for all users.
 */
export const PLACEABLE_ITEMS: PlaceableItemDef[] = [
  // ── Common — free (always unlocked) ────────────────────────────────────
  {
    item_id: 'item_kibble_bowl',
    label: 'Kibble Bowl',
    emoji: '🥣',
    category: 'food',
    tier: 'common',
    cost: 0,
    spawn_bonus: 15,
    max_stack: 2,
    description: 'A classic dry food bowl. Cats know it from a mile away.',
  },
  {
    item_id: 'item_water_dish',
    label: 'Water Dish',
    emoji: '💧',
    category: 'food',
    tier: 'common',
    cost: 0,
    spawn_bonus: 8,
    max_stack: 2,
    description: 'Fresh water keeps the neighbourhood cats coming back.',
  },
  {
    item_id: 'item_toy_mouse',
    label: 'Toy Mouse',
    emoji: '🐭',
    category: 'toy',
    tier: 'common',
    cost: 0,
    spawn_bonus: 10,
    max_stack: 3,
    description: 'Irresistible. Even the most dignified cat can\'t ignore it.',
  },
  {
    item_id: 'item_old_blanket',
    label: 'Old Blanket',
    emoji: '🧸',
    category: 'shelter',
    tier: 'common',
    cost: 0,
    spawn_bonus: 6,
    max_stack: 2,
    description: 'A cosy pile of fabric. Basically a cat magnet.',
  },
  {
    item_id: 'item_flower_pot',
    label: 'Flower Pot',
    emoji: '🪴',
    category: 'decor',
    tier: 'common',
    cost: 0,
    spawn_bonus: 5,
    max_stack: 3,
    description: 'Cats love peeking through leaves and knocking pots over.',
  },

  // ── Common — purchased ──────────────────────────────────────────────────
  {
    item_id: 'item_yarn_ball',
    label: 'Yarn Ball',
    emoji: '🧶',
    category: 'toy',
    tier: 'common',
    cost: 20,
    spawn_bonus: 10,
    max_stack: 3,
    description: 'A tangled delight. Cats across the block can sense it.',
  },
  {
    item_id: 'item_wind_chime',
    label: 'Wind Chime',
    emoji: '🔔',
    category: 'decor',
    tier: 'common',
    cost: 25,
    spawn_bonus: 7,
    max_stack: 2,
    description: 'Gentle tones attract curious cats to your yard.',
  },
  {
    item_id: 'item_feather_wand',
    label: 'Feather Wand',
    emoji: '🪶',
    category: 'toy',
    tier: 'common',
    cost: 25,
    spawn_bonus: 10,
    max_stack: 2,
    description: 'Catches the light, tickles cat instincts from afar.',
  },
  {
    item_id: 'item_treats_pile',
    label: 'Treat Pile',
    emoji: '🍗',
    category: 'food',
    tier: 'common',
    cost: 30,
    spawn_bonus: 12,
    max_stack: 2,
    description: 'A scattered handful of treats. No cat refuses these.',
  },
  {
    item_id: 'item_cardboard_box',
    label: 'Cardboard Box',
    emoji: '📦',
    category: 'shelter',
    tier: 'common',
    cost: 35,
    spawn_bonus: 12,
    max_stack: 2,
    description: 'If it fits, a cat sits. Universal law.',
  },

  // ── Rare ───────────────────────────────────────────────────────────────
  {
    item_id: 'item_warm_milk',
    label: 'Warm Milk',
    emoji: '🥛',
    category: 'food',
    tier: 'rare',
    cost: 60,
    spawn_bonus: 15,
    max_stack: 1,
    description: 'Cats are actually lactose intolerant but they don\'t know that.',
  },
  {
    item_id: 'item_lantern',
    label: 'Paper Lantern',
    emoji: '🏮',
    category: 'decor',
    tier: 'rare',
    cost: 65,
    spawn_bonus: 12,
    max_stack: 2,
    description: 'Warm glow at dusk. Cats gather around like little moths.',
  },
  {
    item_id: 'item_spring_toy',
    label: 'Spring Toy',
    emoji: '🌀',
    category: 'toy',
    tier: 'rare',
    cost: 70,
    spawn_bonus: 15,
    max_stack: 2,
    description: 'That wiggly, jiggling unpredictability keeps cats obsessed.',
  },
  {
    item_id: 'item_cozy_basket',
    label: 'Cozy Basket',
    emoji: '🧺',
    category: 'shelter',
    tier: 'rare',
    cost: 75,
    spawn_bonus: 15,
    max_stack: 2,
    description: 'Woven and soft. Cats will guard this spot from others.',
  },
  {
    item_id: 'item_water_fountain',
    label: 'Water Fountain',
    emoji: '⛲',
    category: 'food',
    tier: 'rare',
    cost: 75,
    spawn_bonus: 18,
    max_stack: 1,
    description: 'Moving water is irresistible. The neighbourhood will talk.',
  },
  {
    item_id: 'item_tuna_can',
    label: 'Tuna Can',
    emoji: '🐟',
    category: 'food',
    tier: 'rare',
    cost: 80,
    spawn_bonus: 18,
    max_stack: 2,
    description: 'The smell carries for blocks. Expect company.',
  },
  {
    item_id: 'item_fish_mobile',
    label: 'Fish Mobile',
    emoji: '🐡',
    category: 'decor',
    tier: 'rare',
    cost: 85,
    spawn_bonus: 16,
    max_stack: 1,
    description: 'Dangling fish shapes. Every cat stares up with big eyes.',
  },
  {
    item_id: 'item_laser_dot',
    label: 'Laser Dot',
    emoji: '🔴',
    category: 'toy',
    tier: 'rare',
    cost: 90,
    spawn_bonus: 20,
    max_stack: 1,
    description: 'The eternal mystery. Cats will never stop chasing.',
  },
  {
    item_id: 'item_cat_bed',
    label: 'Cat Bed',
    emoji: '🛏',
    category: 'shelter',
    tier: 'rare',
    cost: 100,
    spawn_bonus: 20,
    max_stack: 1,
    description: 'Plush, round, and officially for cats (they may share it).',
  },

  // ── Legendary ──────────────────────────────────────────────────────────
  {
    item_id: 'item_catnip',
    label: 'Catnip Patch',
    emoji: '🌿',
    category: 'toy',
    tier: 'legendary',
    cost: 175,
    spawn_bonus: 25,
    max_stack: 1,
    description: 'Grows wild. Every cat in the neighbourhood will know.',
  },
  {
    item_id: 'item_neon_paw_sign',
    label: 'Neon Paw Sign',
    emoji: '🐾',
    category: 'decor',
    tier: 'legendary',
    cost: 200,
    spawn_bonus: 25,
    max_stack: 1,
    description: 'Glows at night. You are now the official cat destination.',
  },
  {
    item_id: 'item_premium_kibble',
    label: 'Premium Kibble',
    emoji: '✨',
    category: 'food',
    tier: 'legendary',
    cost: 200,
    spawn_bonus: 30,
    max_stack: 1,
    description: 'Grain-free, vet-approved, astronomically expensive. Worth it.',
  },
  {
    item_id: 'item_butterfly_mobile',
    label: 'Butterfly Mobile',
    emoji: '🦋',
    category: 'toy',
    tier: 'legendary',
    cost: 250,
    spawn_bonus: 30,
    max_stack: 1,
    description: 'Flutters in the breeze. Cats will sit beneath it for hours.',
  },
  {
    item_id: 'item_golden_mackerel',
    label: 'Golden Mackerel',
    emoji: '🐠',
    category: 'food',
    tier: 'legendary',
    cost: 300,
    spawn_bonus: 35,
    max_stack: 1,
    description: 'The rarest delicacy. Whispers of it draw cats from far away.',
  },
  {
    item_id: 'item_heated_cat_house',
    label: 'Heated Cat House',
    emoji: '🏠',
    category: 'shelter',
    tier: 'legendary',
    cost: 350,
    spawn_bonus: 40,
    max_stack: 1,
    description: 'Insulated, heated, and roomy. This is a cat\'s dream home.',
  },
];

/**
 * Item IDs that are pre-unlocked for every new user (all cost-0 items).
 * Imported by progressionEngine to seed new UserProgression objects.
 */
export const DEFAULT_UNLOCKED_ITEMS: string[] = PLACEABLE_ITEMS
  .filter((i) => i.cost === 0)
  .map((i) => i.item_id);

// ---------------------------------------------------------------------------
// Spawn calculation
// ---------------------------------------------------------------------------

export interface SpawnResult {
  baseChance: number;
  totalBonus: number;
  /** Clamped 0–100 percentage, after env multiplier applied. */
  finalChance: number;
  /** Expected occupied slots out of MAX_HOOD_CATS, rounded to nearest whole cat. */
  expectedCats: number;
}

/**
 * Pure function: derives spawn statistics from placed items and an optional
 * environment multiplier (from EnvironmentPreset.spawn_multiplier).
 *
 * Formula: finalChance = clamp((BASE + itemBonus) * envMultiplier, 0, 100)
 * expectedCats = round(finalChance / 100 * MAX_HOOD_CATS)
 */
export function calculateSpawnChances(
  placedItemIds: string[],
  envMultiplier = 1.0,
): SpawnResult {
  const totalBonus = placedItemIds.reduce((sum, id) => {
    const def = PLACEABLE_ITEMS.find((i) => i.item_id === id);
    return sum + (def?.spawn_bonus ?? 0);
  }, 0);

  const finalChance = Math.min(
    100,
    Math.round((BASE_SPAWN_CHANCE + totalBonus) * envMultiplier),
  );
  const expectedCats = Math.min(
    MAX_HOOD_CATS,
    Math.round((finalChance / 100) * MAX_HOOD_CATS),
  );

  return { baseChance: BASE_SPAWN_CHANCE, totalBonus, finalChance, expectedCats };
}

// ---------------------------------------------------------------------------
// Attraction profile — what the current item mix is drawing in
// ---------------------------------------------------------------------------

export interface AttractionNote {
  category: ItemCategory;
  /** How many placed items contribute to this category. */
  count: number;
  emoji: string;
  blurb: string;
}

/**
 * Flavour mapping from item category to the kind of cats it attracts.
 * Groundwork for per-sprite spawn weighting once sprite art lands — for now
 * it drives the "Who's coming by" readout in the Hood.
 */
const ATTRACTION_FLAVOR: Record<ItemCategory, { emoji: string; blurb: string }> = {
  food:    { emoji: '🍽️', blurb: 'Hungry regulars visit more' },
  toy:     { emoji: '🧶', blurb: 'Playful prowlers stop by' },
  shelter: { emoji: '💤', blurb: 'Shy nappers settle in' },
  decor:   { emoji: '✨', blurb: 'Curious rarities take notice' },
};

/** Summarises the placed items into per-category attraction notes. */
export function getAttractionProfile(placedItemIds: string[]): AttractionNote[] {
  const counts = new Map<ItemCategory, number>();
  for (const id of placedItemIds) {
    const def = PLACEABLE_ITEMS.find((i) => i.item_id === id);
    if (!def) continue;
    counts.set(def.category, (counts.get(def.category) ?? 0) + 1);
  }
  return Array.from(counts, ([category, count]) => ({
    category,
    count,
    ...ATTRACTION_FLAVOR[category],
  }));
}

// ---------------------------------------------------------------------------
// Item-placement helpers
// ---------------------------------------------------------------------------

/** Returns true when adding one more copy of itemId is allowed by max_stack. */
export function canAddItem(hood: { placed_items: string[] }, itemId: string): boolean {
  const def = PLACEABLE_ITEMS.find((i) => i.item_id === itemId);
  if (!def) return false;
  const currentCount = hood.placed_items.filter((id) => id === itemId).length;
  return currentCount < def.max_stack;
}

/** Adds one copy of an item, respecting max_stack. Returns updated array. */
export function addItem(hood: { placed_items: string[] }, itemId: string): string[] {
  if (!canAddItem(hood, itemId)) return hood.placed_items;
  return [...hood.placed_items, itemId];
}

/** Removes one copy of an item (last occurrence). Returns updated array. */
export function removeItem(hood: { placed_items: string[] }, itemId: string): string[] {
  const idx = hood.placed_items.lastIndexOf(itemId);
  if (idx === -1) return hood.placed_items;
  const next = [...hood.placed_items];
  next.splice(idx, 1);
  return next;
}
