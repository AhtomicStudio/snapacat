import type { FriendActivity } from '../types';

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

/**
 * Returns a short, human-readable relative time string from a Unix epoch
 * seconds value. Always uses past tense ("just now", "3h ago").
 */
export function getTimeSince(timestampSeconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - timestampSeconds);
  if (diff < 90) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// ---------------------------------------------------------------------------
// Activity text
// ---------------------------------------------------------------------------

/**
 * Produces a single readable sentence describing what a friend did.
 * Used in the activity feed cards.
 */
export function formatActivityText(activity: FriendActivity): string {
  switch (activity.type) {
    case 'field_note':
      return `logged a Field Note for ${activity.cat_name ?? 'a cat'}${
        activity.hood_name ? ` at ${activity.hood_name}` : ''
      }`;
    case 'new_cat':
      return `discovered a new cat: ${activity.cat_name ?? 'a mystery cat'}! 🐾`;
    case 'hood_update':
      return `spruced up their Hood${activity.hood_name ? ` (${activity.hood_name})` : ''}`;
    case 'streak':
      return `hit a daily streak! 🔥`;
  }
}

/** Returns an emoji matching the activity type for quick visual scanning. */
export function activityEmoji(type: FriendActivity['type']): string {
  switch (type) {
    case 'field_note':  return '📓';
    case 'new_cat':     return '🐱';
    case 'hood_update': return '🏡';
    case 'streak':      return '🔥';
  }
}

// ---------------------------------------------------------------------------
// Mock activity generator (development only)
// ---------------------------------------------------------------------------

/**
 * Generates a plausible-looking synthetic activity feed for the given friend
 * UIDs. Used in mock mode so the Friends screen has content without a real
 * Firestore query set up.
 *
 * Timestamps are relative to now so relative-time display stays fresh.
 */
export function generateMockFriendActivities(
  friendEntries: Array<{ uid: string; username: string }>,
): FriendActivity[] {
  const now = Math.floor(Date.now() / 1000);
  const hoursAgo = (h: number) => now - h * 3600;

  const seed: Omit<FriendActivity, 'activity_id'>[] = [
    {
      user_id: 'user_bob',
      username: 'BobCatLover',
      type: 'field_note',
      timestamp_seconds: hoursAgo(2),
      cat_id: 'cat_ginger_tabby',
      cat_name: 'Mochi',
      hood_name: 'Front Porch Steps',
    },
    {
      user_id: 'user_charlie',
      username: 'CharlieTheWhisperer',
      type: 'new_cat',
      timestamp_seconds: hoursAgo(5),
      cat_id: 'cat_black',
      cat_name: 'Midnight',
      hood_name: 'Side Alleyway',
    },
    {
      user_id: 'user_bob',
      username: 'BobCatLover',
      type: 'hood_update',
      timestamp_seconds: hoursAgo(18),
      hood_name: 'Front Porch Steps',
    },
    {
      user_id: 'user_charlie',
      username: 'CharlieTheWhisperer',
      type: 'streak',
      timestamp_seconds: hoursAgo(26),
    },
    {
      user_id: 'user_bob',
      username: 'BobCatLover',
      type: 'new_cat',
      timestamp_seconds: hoursAgo(52),
      cat_id: 'cat_calico',
      cat_name: 'Patches',
    },
    {
      user_id: 'user_charlie',
      username: 'CharlieTheWhisperer',
      type: 'field_note',
      timestamp_seconds: hoursAgo(72),
      cat_id: 'cat_siamese',
      cat_name: 'Coco',
      hood_name: 'Apartment Balcony',
    },
  ];

  // Filter to only include activities from the given friend UIDs
  const friendUidSet = new Set(friendEntries.map((f) => f.uid));
  return seed
    .filter((a) => friendUidSet.has(a.user_id))
    .sort((a, b) => b.timestamp_seconds - a.timestamp_seconds)
    .map((a, i) => ({ ...a, activity_id: `mock_activity_${i}` }));
}
