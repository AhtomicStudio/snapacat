# Auth plan — real accounts at launch

Supersedes §1 of `persistence-plan.md` (which assumed anonymous auth). Everything
else in that document — the missing user-document bootstrap, the `CURRENT_UID`
swap, mock-data discard, the `USE_MOCK_DATA` flag, the rules sketch — still
holds. Auth is now the gate in front of it.

---

## Recommended providers

**Ship three: Google, Apple, Email/Password. Skip Facebook.**

### Google Sign-In — yes, first priority
The default on Android and the highest-converting option there by a wide margin.
For an Android-first app this is the one that matters. Table stakes.

### Sign in with Apple — DEFERRED (owner decision, 2026-08-17)
No Apple Developer account yet; revisit when the app earns. **This is deferred,
not cancelled** — the requirement below still binds the moment iOS ships with
Google sign-in. Android-only, it does not apply. Keep a slot for it in the auth
screen layout.

<details>
<summary>Why it becomes mandatory for iOS</summary>
App Store Review Guideline **4.8** requires that an app offering third-party or
social login also offer an equivalent privacy-preserving option. Sign in with
Apple is the standard way to satisfy it. In practice: **ship Google on iOS
without Apple and the app gets rejected.**

Since iOS does not exist yet, the *implementation* can be deferred — but design
the auth screen to have a slot for it now rather than retrofitting the layout.

Store policy wording shifts; verify against the current guidelines before an
actual submission rather than trusting this note.

</details>

---

## Security requirements — constraints, not review findings

The owner's requirement: **passwords must never be stored in plaintext.**

### What Firebase Auth already guarantees

With Firebase Authentication you do not store passwords at all — you are
structurally incapable of it:

```
user types password → Firebase Auth SDK → Google's servers
                                            ↓
your app receives:  uid + ID token.  Never the password.
```

Google stores credentials salted and hashed with a modified **scrypt**. No API
returns a password to you or anyone else. `users/{uid}` in Firestore holds only
what this app puts there — `username`, `friends`, `hoods`, `progression`.

So plaintext storage is not a risk to mitigate; it is not reachable from here.
The real risks are elsewhere.

### Hard rules for implementation

1. **Never log an auth error object raw.** This is the realistic leak path. A
   `console.error(err)` on a failed sign-in can put an email — occasionally a
   password, if it is in a request payload — into logcat or a crash reporter.
   Map Firebase error *codes* to user-facing strings and log the code only:
   ```ts
   // NEVER: console.error(err)
   // ALWAYS:
   console.warn(`[auth] sign-in failed: ${err.code}`);
   ```
   The existing `console.error(...)` calls in `App.tsx` and `dbService` predate
   auth and are fine — they carry no credentials. Do not extend that habit into
   the auth path.

2. **Do not copy the email into Firestore.** It already lives in Firebase Auth.
   Never duplicating it means a Firestore compromise exposes usernames and cat
   photos, and zero email addresses. `User` in `src/types/index.ts` currently has
   no email field — keep it that way. If a screen needs the address, read
   `authClient.currentUser.email` at render time.

3. **No credentials in component state longer than the submit.** Clear the
   password field on unmount and on failure. Never put it in a ref, a log, a
   navigation param, or analytics.

4. **Enable Email Enumeration Protection** in the Firebase console. By default
   Firebase returns distinguishable errors for "wrong password" versus "no such
   account", which lets an attacker probe which emails are registered. With it
   on, both collapse to a generic credential error — so the UI copy must be
   generic too ("Email or password is incorrect"), not "No account found".

5. **Enable App Check** (Play Integrity on Android) before going public. The
   Firebase API key in `google-services.json` is *not* a secret — it identifies
   the project, and shipping it is expected. Security comes from Firestore rules
   plus App Check, which is what stops someone driving your backend from a
   script instead of your app.

6. **Raise the password floor.** Firebase's default minimum is 6 characters.
   Enforce a stronger client-side rule at minimum (length over composition rules
   — length is what actually helps). Firebase also offers server-side password
   policy configuration, though that may require the Identity Platform tier;
   verify against current pricing.

7. **Transport is handled.** The SDK is HTTPS-only. Nothing to do.

### Review sequence

Nothing to review until auth exists. Order:

1. Implement with rules 1–6 as constraints
2. Run the `security-review` skill over the auth + rules diff
3. Run a security-focused critic subagent over the same surface — two passes with
   different framing has repeatedly caught what one missed on this project
4. Fix findings, re-run

What that tooling can catch: logged credentials, permissive or missing Firestore
rules, secrets committed to source, unsafe state handling. What it cannot: audit
Google's password storage, or configure App Check and Enumeration Protection —
both are Firebase console actions that no code review will see.

### Email / Password — yes, as the floor
No SDK, no platform dependency, works on every device including ones without
Play Services. Costs you password reset and (recommended) email verification
flows, which Firebase Auth provides out of the box.

Worth considering instead: **email link / passwordless**. Firebase supports it,
it removes password management entirely, and it is increasingly common. Slightly
worse UX on a phone (app → mail app → back), so a judgement call rather than a
clear win.

### Facebook Login — recommend skipping
It was near-universal in mobile games from roughly 2014–2019, and the reason was
the friend graph — you could pull a player's whole friend list and seed the
social layer instantly. **That reason is largely gone.** The `user_friends`
permission has been restricted since Graph API v2.0 to only friends who *also
use your app*, and it requires App Review to obtain at all. So on day one it
returns approximately nothing.

Against that: a heavy SDK, extra review friction, additional privacy disclosure
obligations, and declining use among younger players. SnapaCat already has its
own friend system via user IDs, and `socialHandler.ts` has unwired
`generateHandshakeToken` / `parseHandshakeToken` for friend codes — a better fit
for this app than a social graph you cannot read.

Addable later if social discovery becomes a priority. Not worth it at launch.

---

## Two store requirements that affect scope

**1. In-app account deletion is mandatory.** Apple Guideline 5.1.1(v) and Google
Play's data deletion policy both require that an app which lets users *create* an
account also lets them *delete* it from within the app — not via an email
request. This means a settings screen, a confirmation flow, and a cascade that
removes `users/{uid}` and every `cats/*` document with that `owner_uid`.

Easy to forget until submission, and it is a hard rejection. Budget for it.

**2. A privacy policy is required** by both stores once you collect accounts, and
must be linked from the store listing and reachable in-app.

---

## What this changes about scope

Anonymous auth was roughly "one `useEffect` in App.tsx". Real accounts are a
feature, not a wiring task:

| Piece | New work |
|---|---|
| Auth screens | Welcome, Sign up, Sign in, Forgot password — 4 new screens |
| Provider config | Google OAuth client + SHA fingerprints; Apple services ID + key |
| Dependencies | `@react-native-google-signin/google-signin`, later `@invertase/react-native-apple-authentication` |
| Username | Users now expect to choose a display name; there is no profile UI today |
| Account deletion | Settings entry + cascade delete (store requirement) |
| Email verification | Optional but recommended; Firebase provides the flow |
| Error states | Wrong password, email in use, network failure, cancelled social sign-in |

`@react-native-firebase/auth` is already installed. The other two are new.

**The SHA fingerprint trap:** Google Sign-In on Android requires the app's SHA-1
and SHA-256 certificate fingerprints registered in the Firebase console — and
**separately for each signing config**. Debug builds use a different keystore
than release, so a working debug sign-in will fail silently in release with an
unhelpful `DEVELOPER_ERROR`. Register both up front. If Play App Signing is used,
the fingerprint to register is Google's, not the local one.

---

## Auth-gated boot flow

```
App launches
  └─ onAuthStateChanged
       ├─ no user  → AuthScreen (welcome / sign in / sign up)
       │               └─ on success ↓
       └─ user     → ensureUserDocument(uid)   ← from persistence-plan §3
                       └─ boot(): getUser + getUserProgression
                            └─ main app
```

The existing loading and `bootError` states already cover the async gap. The
`CURRENT_UID` swap is unchanged from the persistence plan — every screen takes
uid as a prop, so this stays confined to `App.tsx` plus the new screens.

**Username at sign-up:** Google and Apple return a display name; email/password
does not. Either prompt for one during sign-up, or generate a placeholder and let
the user change it later — which needs the profile screen that does not exist
yet. Prompting at sign-up is less work and better UX.

**Apple hides emails.** Sign in with Apple can return a proxied
`@privaterelay.appleid.com` address, and it returns the user's real name **only
on the very first authorisation** — never again. If the name is not persisted at
that moment it is gone permanently. A well-known trap.

---

## Revised order of work

Steps 1–3 land while still on mock data, so nothing user-visible changes and each
piece is verifiable alone.

1. `src/config/appConfig.ts` — `USE_MOCK_DATA`, still `true`
2. `ensureUserDocument` in `dbService`, both branches, with a test
3. Auth screens + email/password only, wired to `onAuthStateChanged`, replacing
   `CURRENT_UID`. Fully testable with no native config
4. Google Sign-In — Firebase console provider, OAuth client, SHA fingerprints for
   both debug and release
5. `firestore.rules` + deploy
6. Flip `USE_MOCK_DATA` to `false`
7. Device test: fresh install → sign up → user doc + starter Hood → photograph a
   cat → force-quit → relaunch → **the cat is still there**
8. Account deletion flow (before any store submission)
9. Sign in with Apple (when iOS work begins — required before iOS submission)

Email/password first is deliberate: it needs no native configuration, so the
whole auth-gated flow, the user bootstrap and the persistence switch can all be
proven before touching OAuth clients and signing certificates.

---

## Open questions

1. **Email verification — require it, or allow unverified sign-in?** Requiring it
   reduces junk accounts; allowing it reduces day-one friction. For a collecting
   game, recommend allowing unverified use and nudging later.
2. **Username uniqueness.** Does the friend system match on username, or on the
   opaque uid / friend code? Unique usernames need a reservation collection and a
   transaction. The unwired handshake-token code suggests codes, which avoids the
   problem entirely — recommend that.
3. **Do you have Firebase console access** to enable providers and deploy rules?
   `google-services.json` proves an app is registered, but providers are off by
   default and rules deploy separately.
4. **Is there an Apple Developer account?** Sign in with Apple needs one
   (US$99/yr) and cannot be tested without it.
