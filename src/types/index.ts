/**
 * SnapaCat core data models.
 * Source of truth: Cloud Firestore. Field keys use snake_case to match the
 * stored documents exactly. Domain vocabulary is enforced in type names
 * ("Cat-a-log" -> Cat, Field Notes -> ScrapbookEntry).
 */
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

/** Firestore timestamp as stored/read on the client. */
export type Timestamp = FirebaseFirestoreTypes.Timestamp;

/** Hex colour string extracted from a local sprite sheet, e.g. "#FF8E53". */
export type HexColor = `#${string}`;

/* -------------------------------------------------------------------------- */
/*  Collection 1: `users`                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A single customisable virtual space ("The Hood").
 * Location is a user-defined text label only — never GPS.
 */
export interface Hood {
  /** Display label, e.g. "Work Parking Lot". */
  name: string;
  /** Cloud Storage URL of the custom background; `null` falls back to a default. */
  custom_bg_url: string | null;
  /**
   * Placed item template IDs, e.g. "item_toy_mouse", "item_premium_kibble".
   * The Hood renderer caps simultaneously displayed cat sprites at 6.
   */
  placed_items: string[];
  /**
   * Spatial arrangement for slot-based environments (e.g. the Studio Apartment):
   * placement slot ID → item ID. When present, `placed_items` mirrors its
   * values. Absent for free-form (outdoor) environments.
   */
  item_placements?: Record<string, string> | null;
  /** Active theme skin ID for this Hood; null uses the default Ginger Alley theme. */
  active_theme_id?: string | null;
  /** Active environment preset ID for this Hood; null uses the default Back Alley. */
  active_environment_id?: string | null;
  /** Notes and photos the player has kept about this neighbourhood. */
  scrapbook?: HoodNote[] | null;
}

/**
 * A page in a Hood's scrapbook.
 *
 * WHY THIS IS NOT A ScrapbookEntry
 *
 * A ScrapbookEntry is a SIGHTING: it belongs to a cat, it is created by
 * logging one, and it records which Hood the cat was in. That answers
 * "where have I seen this cat", which is what the Cat-a-log is for.
 *
 * It cannot answer "what is this neighbourhood like". There was nowhere to
 * write that the tabby by the bins only shows up when it rains, or to keep
 * a photo of the place rather than of a cat, because every note in the app
 * had to hang off a cat. A HoodNote hangs off the Hood instead, so a Hood
 * can accumulate a character of its own.
 *
 * Sightings still appear in the Hood's scrapbook — the screen merges them
 * in by `hood_name` — they are simply not stored here.
 */
export interface HoodNote {
  note_id: string;
  /** When it was written. */
  created_at: Timestamp;
  /** The observation itself. */
  text: string;
  /**
   * Local file URI of a photo pinned to the page.
   *
   * Deliberately a device URI and not an upload. Photos in this app are
   * already local-only — the camera captures one, the palette is pulled
   * from it, and it is discarded — and putting a storage bucket behind a
   * scrapbook note is a much larger decision than the note is.
   */
  photo_uri?: string | null;
}

/** `users/{uid}` document. */
export interface User {
  uid: string;
  username: string;
  /** UIDs of this user's friends. */
  friends: string[];
  /** Map of hood_id -> Hood configuration. */
  hoods: Record<string, Hood>;
  /** Optional progression economy state; defaults applied client-side if absent. */
  progression?: UserProgression;
}

/* -------------------------------------------------------------------------- */
/*  Collection 2: `cats` (the "Cat-a-log")                                    */
/* -------------------------------------------------------------------------- */

export type CatGender = 'male' | 'female' | 'unknown';

/**
 * A single dated sighting — a "Field Note" / "Scrapbook Entry".
 * Embedded in `Cat.scrapbook`. The shape is self-contained (carries
 * `user_id`/`cat_id`) so an entry can also stand alone if Field Notes are
 * later promoted to their own top-level collection.
 */
export interface ScrapbookEntry {
  sighting_id: string;
  /** UID of the user who logged this entry. */
  user_id: string;
  /** ID of the parent cat document. */
  cat_id: string;
  /** When the cat was spotted. */
  timestamp: Timestamp;
  /** User-defined text Hood where the cat was seen. */
  hood_name: string;
  /** Free-text Field Note. */
  note_text: string;
  /** Colours pulled from the local sprite sheet (deterministic, no AI). */
  extracted_colors: HexColor[];
}

/** Vocabulary alias: a Scrapbook Entry is a Field Note. */
export type FieldNote = ScrapbookEntry;

/**
 * `cats/{cat_id}` document.
 *
 * Identity model: cats are OWNED by the user who first logged them — the
 * Cat-a-log is a personal collection, not a global shared index. Friends can
 * view each other's cats (read), but only the owner logs Field Notes for them.
 * Cross-user matching of the same real-world animal is intentionally out of
 * scope: with no geolocation (a core invariant), name matching is only
 * reliable within a single user's own collection.
 */
export interface Cat {
  cat_id: string;
  /** UID of the user whose Cat-a-log this cat belongs to (the discoverer). */
  owner_uid: string;
  name: string;
  gender: CatGender;
  /** Maps to a fixed local asset sheet — sprite selection only, no generative AI. */
  sprite_template_id: string;
  /** Embedded, dated Field Notes / Scrapbook Entries for this cat. */
  scrapbook: ScrapbookEntry[];
}

/* -------------------------------------------------------------------------- */
/*  Progression Economy                                                        */
/* -------------------------------------------------------------------------- */

/** Rarity tier for shop items. Determines unlock cost and spawn bonus strength. */
export type ItemTier = 'common' | 'rare' | 'legendary';

/** Category of placeable Hood item. */
export type ItemCategory = 'food' | 'toy' | 'shelter' | 'decor';

/**
 * A visual skin that changes the Hood canvas colours, gradients, and accent tints.
 * Themes do not affect gameplay — they are purely cosmetic.
 */
export interface Theme {
  theme_id: string;
  /** Display name shown in the Shop. */
  name: string;
  /** One-line description of the mood. */
  description: string;
  /** PawPoints cost. 0 = free/default. */
  cost: number;
  /** Sky gradient colours [top, bottom] applied to the Hood canvas. */
  sky_colors: [string, string];
  /** Ground strip colour used in the Hood canvas. */
  ground_color: string;
  /** Accent tint applied to item borders, badges, etc. */
  accent_color: string;
  /** Representative swatch gradient for the Shop preview card. */
  preview_gradient: [string, string];
  /** Emoji icon for quick visual identification. */
  icon: string;
}

/**
 * A biome preset that sets mood, spawn multipliers, and optional time-of-day.
 * Environments layer on top of Themes.
 */
export interface EnvironmentPreset {
  env_id: string;
  /** Display name shown in the Shop. */
  name: string;
  /** Flavour text describing the vibe. */
  description: string;
  /** PawPoints cost. 0 = free/default. */
  cost: number;
  /** Emoji icon for quick visual identification. */
  icon: string;
  /**
   * Multiplier applied to the base spawn chance (e.g. 1.3 = +30%).
   * Stacks multiplicatively with item bonuses.
   */
  spawn_multiplier: number;
  /** If set, forces the Hood to render in this lighting mode. */
  forced_time_of_day?: 'day' | 'night' | null;
  /** Short tag shown on the environment card, e.g. "+30% spawn". */
  bonus_tag: string;
}

/**
 * Persistent progression state for a user — embedded as a sub-field in the
 * `users` Firestore document under the key `progression`.
 * Backwards-compatible: existing user docs without this field fall back to
 * `getDefaultProgression()` on the client.
 */
export interface UserProgression {
  /** Soft currency balance (PawPoints 🐾). */
  paw_points: number;
  /** IDs of themes the user has unlocked (always includes "theme_default"). */
  unlocked_themes: string[];
  /** IDs of shop items the user has unlocked beyond the default free set. */
  unlocked_items: string[];
  /** Active theme ID chosen globally (can be overridden per Hood). */
  active_theme_id: string | null;
  /** Local date string (YYYY-MM-DD) of the last day a streak bonus was awarded. */
  last_streak_date?: string | null;
  /** Consecutive-day login streak. 1 on first open; resets to 1 after a missed day. */
  streak_count?: number;
}

/** Source events that award PawPoints. */
export type PawPointsSource =
  | 'field_note'         // +15 per Field Note logged
  | 'new_cat_discovery'  // +50 first time a brand-new cat is logged
  | 'daily_streak';      // +25 for a daily login streak

/* -------------------------------------------------------------------------- */
/*  Social / Friend Activity Feed                                              */
/* -------------------------------------------------------------------------- */

/** Categories of social activity shown in a friend's feed. */
export type FriendActivityType =
  | 'field_note'     // friend logged a new Field Note for an existing cat
  | 'new_cat'        // friend discovered a brand-new cat
  | 'hood_update'    // friend placed new items in their Hood
  | 'streak';        // friend hit a daily login streak

/**
 * A single event surfaced in the social activity feed.
 * Generated from Firestore queries in production or from
 * `generateMockFriendActivities` in development.
 */
export interface FriendActivity {
  activity_id: string;
  /** UID of the friend who triggered this activity. */
  user_id: string;
  /** Display name of the friend, denormalized for fast rendering. */
  username: string;
  type: FriendActivityType;
  /** Unix epoch seconds — used for sorting and relative-time display. */
  timestamp_seconds: number;
  /** Relevant cat ID (field_note and new_cat activities). */
  cat_id?: string;
  /** Relevant cat name, denormalized for display. */
  cat_name?: string;
  /** Hood name where the activity occurred. */
  hood_name?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** A Firestore document paired with its generated ID. */
export type WithId<T> = T & { id: string };
