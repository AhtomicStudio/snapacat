/**
 * Stand-in for image imports under Jest.
 *
 * The suite runs on ts-jest with a plain `node` environment rather than the
 * react-native preset, so it has no asset transformer. At runtime Metro
 * resolves `require('./cat.png')` to an opaque numeric asset id; returning a
 * number here keeps that shape.
 */
module.exports = 1;
