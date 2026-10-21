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
 * Darken toward near-black rather than to pure black.
 *
 * Shading a warm colour toward #000 drags it grey, because every channel falls
 * at the same rate and the hue goes with it. Mixing toward a dark brown keeps
 * plaster and wood warm in shadow, which is the difference between a room at
 * dusk and a room with the colour drained out of it.
 */
export function shade(hex: string, t: number): string {
  return mixHex(hex, '#2A211A', t);
}

/** Lighten toward a warm white, for the same reason `shade` avoids black. */
export function tint(hex: string, t: number): string {
  return mixHex(hex, '#FFF8EE', t);
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
