/**
 * Colour arithmetic for the hand-drawn scenes.
 *
 * Every environment in the app is built from plain Views, which means there is
 * no gradient primitive and no filter — a gradient is a stack of flat bands,
 * and shading is a colour computed per band. That makes blending a hot path
 * for the look of the whole app rather than a utility, so it lives here where
 * both HoodScene and ApartmentCanvas can share one implementation.
 *
 * Everything is pure and takes hex in, hex out.
 */

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Linear blend between two hex colours. Used to fake a gradient in bands. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${to2(ar + (br - ar) * t)}${to2(ag + (bg - ag) * t)}${to2(ab + (bb - ab) * t)}`;
}

/**
 * Shadow, which is COOL — and that is the whole point.
 *
 * This used to mix toward #2A211A, a warm dark brown, with a comment arguing
 * that it kept plaster and wood warm in shadow. The intent was sound and the
 * result was the opposite of the convention: measured on every real base
 * colour in the game, the SHADED band came out yellower than the lit one. The
 * apartment floor ran -1.2 on b*, the garden grass -1.3, a wood plank -2.1.
 * Warm light with warm shadow is a single flat hue at two values, which is
 * what "flat and muddy" means.
 *
 * Mixing toward a deep blue-violet instead puts roughly +7 b* between lit and
 * shaded on the same surfaces, and costs at most 1.9 of L* at t=0.6, so no
 * banded gradient jumps a step.
 *
 * NOT for material variation. A plank being a different colour from its
 * neighbour is albedo, not lighting — use `vary()`, or you invent a light
 * direction that does not exist and a fence reads as striped.
 */
export function shade(hex: string, t: number): string {
  return mixHex(hex, '#23283F', t);
}

/** Highlight, warm, as the counterpart to `shade`'s cool. */
export function tint(hex: string, t: number): string {
  return mixHex(hex, '#FFF6E2', t);
}

/**
 * Material variation: the same surface, a different batch.
 *
 * Weathered timber, differently-cured concrete, tiles from two firings. These
 * were going through `shade`/`tint`, which was wrong in a way that only shows
 * once those two carry a hue: a hash picking between a warm and a cool version
 * of a plank is not light falling on it, and shifting hue by hash makes a
 * fence stripe. This moves value only and leaves hue where it was.
 */
export function vary(hex: string, t: number): string {
  return mixHex(hex, t < 0 ? '#1A1A1A' : '#E8E8E8', Math.abs(t));
}

/**
 * Small deterministic hash, for per-plank and per-brick variation.
 *
 * Scenery wants variety that is stable across renders — a floorboard that
 * changes tone on every re-render reads as a flicker, not as wood. Seeding off
 * the index gives both.
 */
export function hashIndex(i: number, salt = 0): number {
  const n = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
