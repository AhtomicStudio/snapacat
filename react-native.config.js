/**
 * Asset linking for React Native.
 *
 * `npx react-native-asset` copies everything under these paths into the
 * platform bundles — on Android that means android/app/src/main/assets/fonts.
 *
 * ANDROID FONT NAMING, which is the part that trips people up: React Native
 * resolves `fontFamily` on Android by the FILENAME, not by the family name
 * inside the TTF. `Quicksand-Bold.ttf` is reachable as
 * `fontFamily: 'Quicksand-Bold'`, and combining `fontFamily: 'Quicksand'`
 * with `fontWeight: '700'` does NOT find it. So src/theme.ts names each
 * weight explicitly and never sets fontWeight alongside a custom family.
 */
module.exports = {
  project: {
    android: {},
  },
  assets: ['./src/assets/fonts'],
};
