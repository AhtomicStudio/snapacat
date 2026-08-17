# Persistence plan — auth, real Firestore, security rules

Written 2026-08-17 while Antigravity works in `scripts/sprites/`. Nothing here
has been implemented; no repo files were modified.

---

## Audit findings

**Good news — the Firestore paths already exist.** Every one of the 13 exported
`dbService` functions has both an `isMockMode` branch and a real Firestore
branch. Flipping the flag will not hit "not implemented" errors.

`firebase.ts` is further along than expected: it already exports `authClient`,
and `initializeFirestore` is configured with on-disk persistence and an unlimited
cache, so offline-first behaviour is in place. Auth is imported and never used.

**The blocker — a new user has no document.** There is no `createUser`,
`ensureUser`, or any `users/{uid}` write anywhere in the codebase. In mock mode
users come pre-seeded from `src/mock/users.json`. In real mode:

```
signInAnonymously  ->  uid: "AbC123..."
getUser(uid)       ->  docSnap.exists() === false  ->  returns null
App.tsx boot       ->  throw new Error(`User ${CURRENT_UID} not found`)
                   ->  setBootError(true)  ->  the 🙀 error screen
```

**First launch in real mode would show the error screen and nothing else.** This
must be fixed before the flag is flipped, not after.

Corroborating: the doc comment on `createHood` already says *"or null when the
user does not exist (mock mode only — Firestore update throws)"*. The real branch
assumes a user document it has no way to create.

---

## Decisions to make (recommendations, not commitments)

### 1. Auth model — anonymous first

`signInAnonymously()`. No signup wall on a cosy collecting game, and it yields a
stable uid for security rules immediately.

**The catch, worth stating plainly:** an anonymous uid is tied to the app
install. Reinstall the app, or switch phone, and the collection is gone with no
recovery path. Firebase supports upgrading later via `linkWithCredential`, which
preserves the uid and therefore the whole Cat-a-log — but only if the user
upgrades *before* losing the install.

For a game whose entire value is an accumulating personal collection, that is a
real product risk, not a technical footnote. Options:
- Anonymous now, add optional account linking before any public release
- Anonymous now, accept the risk while it is only on your own phone
- Real auth up front (more friction, more work, no data-loss story)

Recommend the first. Flagging it rather than deciding it.

### 2. Replacing `CURRENT_UID` — smaller than it looks

The prop threading already in place turns out to be the right architecture.
Every screen takes `userId` / `currentUid` / `friendUid` as a **prop**; nothing
imports the constant. So the change is confined to `App.tsx`:

```ts
// was: const CURRENT_UID = 'user_alice';
const [uid, setUid] = useState<string | null>(null);

useEffect(() => {
  const unsub = onAuthStateChanged(authClient, async (user) => {
    if (user) { setUid(user.uid); return; }
    try { await signInAnonymously(authClient); }
    catch (err) { console.error('Anonymous sign-in failed:', err); setBootError(true); }
  });
  return unsub;
}, []);
```

Then `boot()` gains `uid` as a dependency and returns early while it is null, and
every `CURRENT_UID` reference in `App.tsx` becomes `uid`. **No screen file
changes.** The existing loading state already covers the extra async step.

### 3. User document bootstrap — new code, both branches

```ts
/**
 * Creates users/{uid} on first launch. Idempotent — safe to call every boot.
 * A brand-new user needs a starter Hood, or the Hoods tab opens empty with no
 * way to create one from that screen.
 */
export async function ensureUserDocument(uid: string): Promise<User> { ... }
```

Seeds:
- `uid`
- `username` — generated, e.g. `Cat Fan 4821`. Needs to be editable later; there
  is no profile-edit screen yet
- `friends: []`
- `hoods` — **one starter Hood**, so the Hoods tab is not empty on day one
- `progression: getDefaultProgression()`

Call it in `boot()` before `getUser`. Must be idempotent: read first, write only
when missing. Use `create`-semantics or a transaction so two rapid launches
cannot double-write.

### 4. Mock data — discard, do not migrate

Recommend **discard**. Mochi, Socks, Patches, Coco and Midnight belong to
`user_alice` and are demo fixtures. A real anonymous user should start empty —
that is the correct new-player experience, and the empty states already exist
(the dashed-ring perches, "No sightings yet", "No friends yet").

Consequence to expect: **first real launch shows an empty Cat-a-log and an empty
Hood.** That is correct, but it will look like something broke if you are not
expecting it. Go photograph a cat.

`src/mock/*.json` stays — the test suite and mock mode both depend on it.

### 5. `isMockMode` — one constant, one call site

Do not delete mock mode. The test suite runs on it (`dbService.test.ts`), and it
is genuinely useful for working without a network.

```ts
// src/config/appConfig.ts
/** Flip to true to run against the in-memory store instead of Firestore. */
export const USE_MOCK_DATA = false;
```

Called once, at boot, before any db access. Tests continue to force mock mode
themselves, so they are unaffected by the flag either way.

Avoid tying it to `__DEV__` — you will want to test real Firestore in a dev
build, and that coupling makes it impossible without editing code.

### 6. Security rules — match the ownership model

`CLAUDE.md` declares cats are per-user (`owner_uid`), viewable by friends, not a
global shared index. Rules should say exactly that. Sketch:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Profiles: any signed-in user can read (friends need username + hoods),
    // only the owner writes.
    match /users/{uid} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && request.auth.uid == uid;
      allow delete: if false;
    }

    // Cat-a-log: readable by any signed-in user (friends view your cats perched
    // in your Hood); writable only by the owner. Scrapbook entries are embedded,
    // so adding a Field Note is an update to the cat document.
    match /cats/{catId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.resource.data.owner_uid == request.auth.uid;
      allow update: if request.auth != null
                    && resource.data.owner_uid == request.auth.uid
                    && request.resource.data.owner_uid == resource.data.owner_uid;
      allow delete: if request.auth != null
                    && resource.data.owner_uid == request.auth.uid;
    }
  }
}
```

Two things to note:

- **`read: if request.auth != null` is permissive** — any signed-in user can read
  any profile or cat, not just friends'. Restricting to friends-only needs a
  `get()` lookup against the reader's friends array on every read, which costs a
  document read per rule evaluation and complicates the friend-Hood flow. Cat
  photos and names are not sensitive; recommend the permissive version and
  revisit if the app ever goes public.
- The `update` rule pins `owner_uid` so a cat cannot be re-homed to another user.

### 7. Verify before flipping the flag

- **Do mock cats carry `owner_uid`?** `getCats` queries
  `where('owner_uid','==',uid)`. If the seed JSON lacks the field, mock and real
  disagree and only real mode breaks. Check `src/mock/cats.json`.
- **Index:** a single equality filter needs only the automatic single-field
  index. No composite index required, no console step.
- **`serverTimestamp` vs `Timestamp.now()`** — `addScrapbookEntry` uses
  `Timestamp.now()` (client clock). Fine, but skewed device clocks will misorder
  a scrapbook. Low priority.
- **Offline `createCat`** — a previous review flagged that `docRef.set()` does
  not resolve while offline, so `FieldNotesScreen` hangs on submit with no alert.
  Firestore's offline persistence queues the write and resolves locally, so this
  is likely fine with `persistence: true` already enabled — but it is worth an
  explicit airplane-mode test, because it is the one path where "log a cat"
  could produce nothing at all.

---

## Order of work

1. `src/config/appConfig.ts` — the flag, still `true` (mock)
2. `ensureUserDocument` in `dbService`, both branches, plus a test
3. Anonymous auth in `App.tsx`, replace `CURRENT_UID` — still on mock, so
   nothing user-visible changes yet and the auth wiring can be verified alone
4. `firestore.rules` + deploy to the Firebase project
5. Flip `USE_MOCK_DATA` to `false`
6. Device test: fresh install → auth → user doc created → starter Hood → log a
   cat via camera → force-quit → relaunch → **the cat is still there**

Steps 1–3 are safe to land while still in mock mode. Step 5 is the only
irreversible-feeling one, and it is a one-line revert.

## Open questions for the owner

1. Anonymous-only for now, or plan account linking before any release?
2. Discard mock data on first real run — confirmed?
3. Cats readable by any signed-in user, or worth the cost of friends-only?
4. Is there a Firebase project already provisioned for this, and do you have
   console access to deploy rules? (`google-services.json` is present, so an app
   is registered — but rules have to be deployed separately.)
