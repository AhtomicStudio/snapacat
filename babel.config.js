// Bare React Native + NativeWind v4.
// 'nativewind/babel' must come after the core RN preset so it can transform the
// className -> style props on every component.
module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
};
