# SnapaCat 🐾

A neighborhood cat-collection game for Android. Snap real cats, log Field Notes,
build your personal **Cat-a-log**, and furnish virtual **Hoods** to attract visitors.

## Stack

- React Native 0.85 + TypeScript, NativeWind v4
- Firebase (Firestore, Auth, Storage) — currently running in mock mode
- react-native-vision-camera + ML Kit on-device cat detection
- Deterministic sprite matching via color extraction (no generative AI, no GPS)

## Getting started

```bash
npm install
npm run android   # see RUN_ANDROID.md for device/emulator setup
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run android` | Build & launch on Android |
| `npm test` | Jest suite |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

Project conventions and the data schema live in [CLAUDE.md](CLAUDE.md).
