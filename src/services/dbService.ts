import { Timestamp } from '@react-native-firebase/firestore';
import {
  catsCollection,
  catDoc,
  usersCollection,
  userDoc,
} from '../config/firebase';
import type { Cat, User, Hood, HoodNote, ScrapbookEntry, HexColor, UserProgression } from '../types';
import { getDefaultProgression } from '../utils/progressionEngine';
import { extractColorsForSighting } from '../utils/colorExtractor';

// Import initial mock data
import initialCats from '../mock/cats.json';
import initialUsers from '../mock/users.json';

// Global state for mock database
let isMockMode = true;
export let mockCats: Cat[] = [];
let mockProgressions: Record<string, UserProgression> = {};
let mockUsers: Record<string, User> = {};

/**
 * Reset mock collections in-memory to their default JSON values.
 * Useful for test suites and hot restarts.
 */
export function resetMockDb(): void {
  // Deep copy cats mock data
  mockCats = JSON.parse(JSON.stringify(initialCats)).map((c: any) => {
    // Parse timestamp objects
    const parsedScrapbook = c.scrapbook.map((s: any) => ({
      ...s,
      timestamp: new Timestamp(s.timestamp.seconds, s.timestamp.nanoseconds),
    }));
    return {
      ...c,
      scrapbook: parsedScrapbook,
    };
  });

  // Deep copy users mock data
  mockUsers = JSON.parse(JSON.stringify(initialUsers));
  // Reset progressions
  mockProgressions = {};
}

// Initialise database mock state on import
resetMockDb();

/**
 * Configure whether the database service runs in mock mode (local JSON storage)
 * or production mode (real Cloud Firestore).
 */
export function setMockMode(enabled: boolean): void {
  isMockMode = enabled;
}

/**
 * Check if the database service is currently in mock mode.
 */
export function getMockMode(): boolean {
  return isMockMode;
}

/* ----------------------------- CAT-A-LOG SERVICES ----------------------------- */

/**
 * Retrieve cats from the Cat-a-log collection.
 * Pass `ownerUid` to scope to one user's personal collection (the normal case);
 * omit it to fetch across owners (dev tooling / future friend views).
 */
export async function getCats(ownerUid?: string): Promise<Cat[]> {
  if (isMockMode) {
    return ownerUid
      ? mockCats.filter(c => c.owner_uid === ownerUid)
      : [...mockCats];
  }

  const ref = ownerUid
    ? catsCollection().where('owner_uid', '==', ownerUid)
    : catsCollection();
  const snapshot = await ref.get();
  return snapshot.docs.map(doc => ({
    ...doc.data(),
    cat_id: doc.id,
  }));
}

/**
 * Retrieve a specific cat document by ID.
 */
export async function getCat(catId: string): Promise<Cat | null> {
  if (isMockMode) {
    const cat = mockCats.find(c => c.cat_id === catId);
    return cat ? { ...cat } : null;
  }

  const docSnap = await catDoc(catId).get();
  if (docSnap.exists()) {
    return {
      ...docSnap.data()!,
      cat_id: docSnap.id,
    };
  }
  return null;
}

/**
 * Add a new Scrapbook entry (Field Note) to a cat's embedded scrapbook array.
 * Performs deterministic color extraction on signature/image colors if not specified.
 */
export async function addScrapbookEntry(
  catId: string,
  entryData: {
    user_id: string;
    hood_name: string;
    note_text: string;
    photoPixels?: { r: number; g: number; b: number }[];
    extracted_colors?: HexColor[];
  }
): Promise<ScrapbookEntry | null> {
  // Retrieve the cat to find its sprite_template_id for color matching
  const cat = await getCat(catId);
  if (!cat) {
    return null;
  }

  // Resolve extracted colors (use existing, extract from pixels, or fallback to template signature)
  let finalColors = entryData.extracted_colors;
  if (!finalColors || finalColors.length === 0) {
    finalColors = extractColorsForSighting({
      spriteTemplateId: cat.sprite_template_id,
      photoPixels: entryData.photoPixels,
    });
  }

  const newEntry: ScrapbookEntry = {
    sighting_id: `sight_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    user_id: entryData.user_id,
    cat_id: catId,
    timestamp: Timestamp.now(),
    hood_name: entryData.hood_name,
    note_text: entryData.note_text,
    extracted_colors: finalColors,
  };

  if (isMockMode) {
    const catIndex = mockCats.findIndex(c => c.cat_id === catId);
    if (catIndex !== -1) {
      const targetCat = mockCats[catIndex];
      if (targetCat) {
        targetCat.scrapbook = [...targetCat.scrapbook, newEntry];
        return { ...newEntry };
      }
    }
    return null;
  }

  // In Firebase Firestore, update the embedded array on the cat document
  // Firebase modular SDK imports: docRef.update({ scrapbook: firestore.FieldValue.arrayUnion(newEntry) })
  const docRef = catDoc(catId);
  
  // Cast or dynamically get FieldValue because imports might vary across react-native-firebase versions
  const firestoreModule = require('@react-native-firebase/firestore').default;
  await docRef.update({
    scrapbook: firestoreModule.FieldValue.arrayUnion(newEntry),
  });

  return newEntry;
}

/* ----------------------------- USER PROFILE SERVICES ----------------------------- */

/**
 * Retrieve a user document by UID.
 */
export async function getUser(uid: string): Promise<User | null> {
  if (isMockMode) {
    const user = mockUsers[uid];
    return user ? { ...user } : null;
  }

  const docSnap = await userDoc(uid).get();
  if (docSnap.exists()) {
    return {
      ...docSnap.data()!,
      uid: docSnap.id,
    };
  }
  return null;
}

/**
 * Create a new empty Hood for a user. Returns the generated ID and the Hood,
 * or null when the user does not exist (mock mode only — Firestore update throws).
 */
export async function createHood(
  uid: string,
  name: string,
): Promise<{ hoodId: string; hood: Hood } | null> {
  const hood: Hood = { name: name.trim(), custom_bg_url: null, placed_items: [] };
  const hoodId = `hood_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  if (isMockMode) {
    const user = mockUsers[uid];
    if (!user) return null;
    user.hoods = { ...user.hoods, [hoodId]: hood };
    return { hoodId, hood };
  }

  await userDoc(uid).update({ [`hoods.${hoodId}`]: hood });
  return { hoodId, hood };
}

/**
 * Update the list of placed items inside a specific virtual space ("The Hood") for a user.
 */
export async function updateHoodItems(
  uid: string,
  hoodId: string,
  items: string[]
): Promise<boolean> {
  if (isMockMode) {
    const user = mockUsers[uid];
    if (user && user.hoods[hoodId]) {
      const hood = user.hoods[hoodId];
      if (hood) {
        hood.placed_items = [...items];
        return true;
      }
    }
    return false;
  }

  const docRef = userDoc(uid);
  const updateKey = `hoods.${hoodId}.placed_items`;
  await docRef.update({
    [updateKey]: items,
  });
  return true;
}

/**
 * Persist a Hood's full item layout: the flat item list (economy source of
 * truth) plus the spatial slot arrangement used by slot-based environments.
 */
export async function updateHoodLayout(
  uid: string,
  hoodId: string,
  items: string[],
  itemPlacements: Record<string, string> | null,
): Promise<boolean> {
  if (isMockMode) {
    const user = mockUsers[uid];
    const hood = user?.hoods[hoodId];
    if (!hood) return false;
    hood.placed_items = [...items];
    hood.item_placements = itemPlacements ? { ...itemPlacements } : null;
    return true;
  }

  await userDoc(uid).update({
    [`hoods.${hoodId}.placed_items`]: items,
    [`hoods.${hoodId}.item_placements`]: itemPlacements,
  });
  return true;
}

/**
 * Replace a Hood's scrapbook.
 *
 * Whole-array writes rather than an arrayUnion, because notes can be
 * edited and deleted as well as added, and a scrapbook is small enough
 * that the simple thing is also the correct one.
 */
export async function updateHoodScrapbook(
  uid: string,
  hoodId: string,
  notes: HoodNote[],
): Promise<boolean> {
  if (isMockMode) {
    const user = mockUsers[uid];
    const hood = user?.hoods[hoodId];
    if (!hood) return false;
    hood.scrapbook = notes.map((n) => ({ ...n }));
    return true;
  }

  await userDoc(uid).update({
    [`hoods.${hoodId}.scrapbook`]: notes,
  });
  return true;
}

/* ----------------------------- SOCIAL / FRIENDS SERVICES ----------------------------- */

/**
 * Append a friend's UID to the current user's `friends` array.
 * Idempotent: Firestore's arrayUnion and the mock branch both skip duplicates.
 * Throws if the caller attempts to add themselves.
 */
export async function addFriend(currentUid: string, friendUid: string): Promise<void> {
  if (currentUid === friendUid) {
    throw new Error('You cannot add yourself as a friend.');
  }

  if (isMockMode) {
    const user = mockUsers[currentUid];
    if (!user) throw new Error('Current user not found in mock database.');
    if (!user.friends.includes(friendUid)) {
      user.friends = [...user.friends, friendUid];
    }
    return;
  }

  const firestoreModule = require('@react-native-firebase/firestore').default;
  await userDoc(currentUid).update({
    friends: firestoreModule.FieldValue.arrayUnion(friendUid),
  });
}

/**
 * Retrieve a friend's Hood map by their UID.
 * Returns null when the friend document does not exist.
 */
export async function getFriendHoods(
  friendUid: string,
): Promise<{ username: string; hoods: User['hoods'] } | null> {
  const user = await getUser(friendUid);
  if (!user) return null;
  return { username: user.username, hoods: user.hoods };
}

/**
 * Register a new cat in the owner's personal Cat-a-log.
 */
export async function createCat(
  name: string,
  gender: 'male' | 'female' | 'unknown',
  spriteTemplateId: string,
  ownerUid: string
): Promise<Cat> {
  const newCat: Cat = {
    cat_id: `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    owner_uid: ownerUid,
    name,
    gender,
    sprite_template_id: spriteTemplateId,
    scrapbook: [],
  };

  if (isMockMode) {
    mockCats.push(newCat);
    return { ...newCat };
  }

  const docRef = catDoc(newCat.cat_id);
  await docRef.set(newCat);
  return newCat;
}

/* ----------------------------- PROGRESSION SERVICES ----------------------------- */

/**
 * Retrieve the progression state for a user.
 * Falls back to a fresh default progression if the field is missing (backwards-compatible).
 */
export async function getUserProgression(uid: string): Promise<UserProgression> {
  if (isMockMode) {
    if (!mockProgressions[uid]) {
      mockProgressions[uid] = getDefaultProgression();
    }
    return { ...mockProgressions[uid]! };
  }

  const docSnap = await userDoc(uid).get();
  if (docSnap.exists()) {
    const data = docSnap.data();
    return (data?.progression as UserProgression | undefined) ?? getDefaultProgression();
  }
  return getDefaultProgression();
}

/**
 * Persist the updated progression state for a user.
 * In Firestore this writes the `progression` sub-field of the users document.
 */
export async function saveUserProgression(
  uid: string,
  progression: UserProgression,
): Promise<void> {
  if (isMockMode) {
    mockProgressions[uid] = { ...progression };
    return;
  }

  await userDoc(uid).update({ progression });
}
