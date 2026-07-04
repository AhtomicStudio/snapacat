import { addFriend as dbAddFriend, getUser } from '../services/dbService';

/**
 * Validates a UID structure (non-empty, alphanumeric, typical Firebase length).
 */
export function isValidUid(uid: string): boolean {
  if (!uid || typeof uid !== 'string') {
    return false;
  }
  const trimmed = uid.trim();
  // Standard Firebase Auth UIDs are 28 characters, but mock ones can be shorter.
  // We check for alphanumeric characters plus underscores or dashes.
  return trimmed.length >= 4 && /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Generates a standard social handshake URI for a given user UID.
 * Format: snapacat://friend/{uid}
 */
export function generateHandshakeToken(uid: string): string {
  if (!isValidUid(uid)) {
    throw new Error('Invalid UID provided for generating handshake token.');
  }
  return `snapacat://friend/${uid.trim()}`;
}

/**
 * Parses a social handshake token and returns the extracted friend UID.
 * Returns null if the token structure is invalid or not recognized.
 */
export function parseHandshakeToken(token: string): string | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  
  const cleaned = token.trim();
  
  // Accept standard URI scheme or raw UID if it's directly entered
  if (cleaned.startsWith('snapacat://friend/')) {
    const uid = cleaned.replace('snapacat://friend/', '').trim();
    return isValidUid(uid) ? uid : null;
  }
  
  // Fallback to direct UID entry if it's already a valid UID
  return isValidUid(cleaned) ? cleaned : null;
}

/**
 * Executes a bi-directional handshake to register a friend.
 * Validates the UIDs, ensures they are not identical, checks if the friend exists,
 * and adds the relationship.
 */
export async function addFriend(currentUid: string, friendUid: string): Promise<boolean> {
  if (!isValidUid(currentUid) || !isValidUid(friendUid)) {
    return false;
  }

  const cleanCurrent = currentUid.trim();
  const cleanFriend = friendUid.trim();

  if (cleanCurrent === cleanFriend) {
    return false;
  }

  try {
    // Verify that the friend user exists in the system
    const friendProfile = await getUser(cleanFriend);
    if (!friendProfile) {
      return false;
    }

    // Add friend bi-directionally (current adds friend, friend adds current)
    await dbAddFriend(cleanCurrent, cleanFriend);
    await dbAddFriend(cleanFriend, cleanCurrent);
    return true;
  } catch (err) {
    console.error('Failed to register friend handshake:', err);
    return false;
  }
}
