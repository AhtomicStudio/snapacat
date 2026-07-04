/**
 * Firebase initialisation for SnapaCat.
 *
 * Uses the @react-native-firebase modular API. The native SDKs read their
 * credentials from `android/app/google-services.json` (and the iOS plist), so
 * there is no JS config object to maintain here.
 *
 * IMPORTANT: import this module once, as early as possible in the app entry
 * (e.g. at the top of `index.js`), so `initializeFirestore` runs before any
 * other Firestore access.
 */
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import {
  CACHE_SIZE_UNLIMITED,
  collection,
  doc,
  getFirestore,
  initializeFirestore,
  serverTimestamp,
} from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { getStorage } from '@react-native-firebase/storage';

import type { Cat, User } from '../types';

/**
 * Firestore collection names — centralised so the domain vocabulary is enforced
 * in one place ("Cat-a-log" lives in `cats`, profiles live in `users`).
 */
export const COLLECTIONS = {
  USERS: 'users',
  CATS: 'cats',
} as const;

const app = getApp();

/**
 * Offline-first: enable on-disk persistence with an unbounded local cache so the
 * Cat-a-log and Field Notes render instantly, even with no connectivity.
 * Settings must be applied before any other Firestore call.
 */
initializeFirestore(app, {
  persistence: true,
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
});

export const db = getFirestore(app);
export const authClient = getAuth(app);
export const storageClient = getStorage(app);

/* ------------------------------ typed refs -------------------------------- */

/** Strongly-typed reference to the `users` collection. */
export const usersCollection = (): FirebaseFirestoreTypes.CollectionReference<User> =>
  collection(db, COLLECTIONS.USERS) as any as FirebaseFirestoreTypes.CollectionReference<User>;

/** Strongly-typed reference to the `cats` (Cat-a-log) collection. */
export const catsCollection = (): FirebaseFirestoreTypes.CollectionReference<Cat> =>
  collection(db, COLLECTIONS.CATS) as any as FirebaseFirestoreTypes.CollectionReference<Cat>;

/** Strongly-typed `users/{uid}` document reference. */
export const userDoc = (uid: string): FirebaseFirestoreTypes.DocumentReference<User> =>
  doc(db, `${COLLECTIONS.USERS}/${uid}`) as any as FirebaseFirestoreTypes.DocumentReference<User>;

/** Strongly-typed `cats/{catId}` document reference. */
export const catDoc = (catId: string): FirebaseFirestoreTypes.DocumentReference<Cat> =>
  doc(db, `${COLLECTIONS.CATS}/${catId}`) as any as FirebaseFirestoreTypes.DocumentReference<Cat>;

export { serverTimestamp };
export { app as firebaseApp };
