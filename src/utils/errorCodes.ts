/**
 * Stable error codes for SnapaCat.
 *
 * The point of a code is that a user can read it off a screen and it uniquely
 * identifies a failure path — no ambiguity, no guessing from a paraphrased
 * message. "Something went wrong" tells you nothing; SNAP-BOOT-02 tells you the
 * profile document is missing.
 *
 * Rules:
 *  - Codes are PERMANENT. Never renumber or reuse one, even if the failure it
 *    described is fixed. A retired code stays retired.
 *  - `message` is what the user reads. No jargon, no blame, no stack traces.
 *  - `hint` is what to do next, and is only shown when it is genuinely
 *    actionable by the person reading it.
 *  - `cause` is developer-facing and never rendered.
 *
 * Every entry below corresponds to a failure actually observed in this project,
 * not a hypothetical one.
 */

export type SnapErrorCode =
  // Boot / profile
  | 'SNAP-BOOT-01'
  | 'SNAP-BOOT-02'
  | 'SNAP-BOOT-03'
  // Camera / capture
  | 'SNAP-CAM-01'
  | 'SNAP-CAM-02'
  | 'SNAP-CAM-03'
  | 'SNAP-CAM-04'
  // Data / persistence
  | 'SNAP-DB-01'
  | 'SNAP-DB-02'
  | 'SNAP-DB-03'
  // Social
  | 'SNAP-SOC-01'
  | 'SNAP-SOC-02'
  // Sprites / assets
  | 'SNAP-SPR-01';

export interface SnapErrorInfo {
  code: SnapErrorCode;
  /** Short label for the error screen heading. */
  title: string;
  /** User-facing explanation. Plain language. */
  message: string;
  /** What the user can do. Omitted when nothing they do would help. */
  hint?: string;
  /** Developer-facing note on the actual cause. Never rendered. */
  cause: string;
}

export const ERROR_CODES: Record<SnapErrorCode, SnapErrorInfo> = {
  // ── Boot / profile ───────────────────────────────────────────────────────
  'SNAP-BOOT-01': {
    code: 'SNAP-BOOT-01',
    title: 'Could not load your profile',
    message: "SnapaCat couldn't reach your profile just now.",
    hint: 'Check your connection and try again.',
    cause: 'getUser() threw — network, Firestore rules, or an offline cache miss.',
  },
  'SNAP-BOOT-02': {
    code: 'SNAP-BOOT-02',
    title: 'Profile not found',
    message: "We couldn't find your SnapaCat profile.",
    hint: 'Try again. If this keeps happening, signing out and back in will rebuild it.',
    cause:
      'users/{uid} does not exist. There is no bootstrap that creates it — see ' +
      'docs/persistence-plan.md. Guaranteed on first launch against real Firestore.',
  },
  'SNAP-BOOT-03': {
    code: 'SNAP-BOOT-03',
    title: 'Could not load your progress',
    message: "Your cats are safe, but we couldn't load your PawPoints and unlocks.",
    hint: 'Try again in a moment.',
    cause: 'getUserProgression() threw. Falls back to defaults rather than blocking boot.',
  },

  // ── Camera / capture ─────────────────────────────────────────────────────
  'SNAP-CAM-01': {
    code: 'SNAP-CAM-01',
    title: 'Camera permission needed',
    message: 'SnapaCat needs camera access to photograph cats.',
    hint: 'Enable the camera permission in your device settings, then come back.',
    cause: 'Camera permission denied or not yet requested.',
  },
  'SNAP-CAM-02': {
    code: 'SNAP-CAM-02',
    title: 'Colour matching unavailable',
    message: "We couldn't read the colours from that photo, so we've guessed a coat.",
    // Nothing the user can do — this is a build configuration issue.
    cause:
      'react-native-image-colors needs expo-modules-core, which is stubbed in this ' +
      'bare RN build (src/shims/expo-modules-core.js). Run `npx install-expo-modules` ' +
      'to enable real extraction. Degrades to the grey fallback.',
  },
  'SNAP-CAM-03': {
    code: 'SNAP-CAM-03',
    title: 'No camera found',
    message: "This device doesn't seem to have a camera SnapaCat can use.",
    hint: 'You can still add a sighting by hand from the Cat-a-log.',
    cause: 'useCameraDevice("back") returned null.',
  },
  'SNAP-CAM-04': {
    code: 'SNAP-CAM-04',
    title: "Couldn't take that photo",
    message: 'Something interrupted the shot.',
    hint: 'Give it another try.',
    cause: 'capturePhotoToFile() threw, or the file was never written.',
  },

  // ── Data / persistence ───────────────────────────────────────────────────
  'SNAP-DB-01': {
    code: 'SNAP-DB-01',
    title: "Couldn't save that",
    message: "Your Field Note didn't save.",
    hint: "Try again — if you're offline it'll sync once you reconnect.",
    cause: 'addScrapbookEntry() or createCat() threw.',
  },
  'SNAP-DB-02': {
    code: 'SNAP-DB-02',
    title: "Couldn't update your Hood",
    message: "That change to your Hood didn't stick.",
    hint: 'Try placing it again.',
    cause: 'updateHoodLayout() threw.',
  },
  'SNAP-DB-03': {
    code: 'SNAP-DB-03',
    title: "Couldn't load your cats",
    message: "We couldn't fetch your Cat-a-log.",
    hint: 'Pull to refresh, or try again shortly.',
    cause: 'getCats() threw. The Hood falls back to empty perches.',
  },

  // ── Social ───────────────────────────────────────────────────────────────
  'SNAP-SOC-01': {
    code: 'SNAP-SOC-01',
    title: 'Friend not found',
    message: "No SnapaCat user matches that ID.",
    hint: 'Double-check the ID with your friend — they can find theirs on the Friends screen.',
    cause: 'getUser(friendUid) returned null.',
  },
  'SNAP-SOC-02': {
    code: 'SNAP-SOC-02',
    title: "That's you",
    message: "You can't add yourself as a friend.",
    cause: 'addFriend() called with currentUid === friendUid.',
  },

  // ── Sprites / assets ─────────────────────────────────────────────────────
  'SNAP-SPR-01': {
    code: 'SNAP-SPR-01',
    title: 'Unknown cat type',
    message: "We didn't recognise that cat's coat, so we've shown a stand-in.",
    cause:
      'getSpriteSheet() fell back — the sprite id is not in SPRITE_SHEETS. Usually a ' +
      'renamed breed or a document written by an older build.',
  },
};

/**
 * An error carrying a stable code.
 *
 * Throw this instead of a bare Error wherever the failure is one a user might
 * report, so the code survives all the way to the screen.
 */
export class SnapError extends Error {
  readonly code: SnapErrorCode;
  readonly info: SnapErrorInfo;

  constructor(code: SnapErrorCode, options?: { cause?: unknown }) {
    const info = ERROR_CODES[code];
    super(`[${code}] ${info.cause}`);
    this.name = 'SnapError';
    this.code = code;
    this.info = info;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Type guard — narrows to SnapError without relying on instanceof across bundles. */
export function isSnapError(err: unknown): err is SnapError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code in ERROR_CODES
  );
}

/**
 * Resolves anything thrown into something renderable.
 *
 * Unknown errors map to SNAP-BOOT-01 rather than surfacing a raw message —
 * exception text is written for developers and routinely leaks internals.
 */
export function describeError(
  err: unknown,
  fallback: SnapErrorCode = 'SNAP-BOOT-01',
): SnapErrorInfo {
  if (isSnapError(err)) return err.info;
  return ERROR_CODES[fallback];
}

/**
 * Logs a coded error at a consistent shape.
 *
 * Deliberately logs the CODE and not the caught object. Auth and network errors
 * routinely carry emails, tokens and request payloads, and this ships to release
 * — there is no transform-remove-console in the babel config.
 */
export function logError(code: SnapErrorCode, detail?: string): void {
  console.warn(`[${code}] ${ERROR_CODES[code].title}${detail ? ` — ${detail}` : ''}`);
}
