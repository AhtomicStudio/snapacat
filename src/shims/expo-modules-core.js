/**
 * Stub for `expo-modules-core`, aliased in metro.config.js.
 *
 * WHY THIS EXISTS
 *
 * `react-native-image-colors@2.x` is built on Expo's module system and does
 * `import { requireNativeModule } from 'expo-modules-core'` at the top of its
 * entry file. SnapaCat is a bare React Native app with no Expo runtime, so
 * Metro cannot resolve that import and the whole bundle fails — a red screen on
 * launch, before any app code runs. The import is static, so a lazy require in
 * photoColorExtractor would not have helped: Metro resolves it at bundle time
 * regardless of where it appears.
 *
 * WHAT THIS DOES
 *
 * `requireNativeModule` returns a proxy whose methods throw when CALLED, rather
 * than throwing on import. That distinction is the whole point:
 *
 *   - the bundle builds
 *   - mock mode never touches it, so the camera flow works end to end
 *   - a real photo extraction fails loudly, is caught by the existing
 *     try/catch in photoColorExtractor, and degrades to the grey fallback that
 *     code already implements
 *
 * THE REAL FIX
 *
 * Run `npx install-expo-modules@latest`, which wires the Expo module runtime
 * into a bare RN project properly, then delete this shim and its Metro alias.
 * Until then, colour extraction from real camera photos returns grey — sprite
 * matching still works from the mock palettes.
 */

const ERROR_CODE = 'SNAP-CAM-02';

function unavailable(moduleName, methodName) {
  return () => {
    throw new Error(
      `[${ERROR_CODE}] Native module "${moduleName}.${methodName}" is unavailable: ` +
        'expo-modules-core is stubbed in this bare React Native build. ' +
        'Run `npx install-expo-modules@latest` to enable it.',
    );
  };
}

/** Returns a proxy that resolves on import and throws on use. */
function requireNativeModule(moduleName) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        // Let interop checks (`then`, Symbol.toPrimitive, etc.) fail quietly
        // rather than throwing while something merely inspects the object.
        if (prop === 'then' || prop === 'constructor') return undefined;
        return unavailable(moduleName, prop);
      },
    },
  );
}

/** Same contract, but returns null instead of throwing — matches Expo's API. */
function requireOptionalNativeModule() {
  return null;
}

/** Minimal EventEmitter surface; nothing in this app subscribes to Expo events. */
class EventEmitter {
  addListener() {
    return { remove() {} };
  }
  removeAllListeners() {}
  emit() {}
}

class NativeModule {}
class SharedObject {}

module.exports = {
  requireNativeModule,
  requireOptionalNativeModule,
  EventEmitter,
  NativeModule,
  SharedObject,
  NativeModulesProxy: {},
  Platform: { OS: 'android' },
  __esModule: true,
  default: { requireNativeModule, requireOptionalNativeModule },
};
