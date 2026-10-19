#!/usr/bin/env node
/**
 * Can you tell these two cats apart at the size they ship at?
 *
 * The Cat-a-log is a collection game, so two breeds that read as the same
 * animal are a gameplay bug wearing an art costume. This measures it, because
 * eyeballing it does not work: a previous round of review found tortoiseshell
 * and torbie 5.77 CIE76 apart — indistinguishable in a list — while both
 * looked fine on their own.
 *
 * TWO NUMBERS, AND ONLY ONE OF THEM IS THE ALARM
 *
 *   mean   average colour difference per pixel, over the whole frame
 *   block  the same after averaging 4x4 source-pixel tiles first
 *
 * `block` is the one that matters, because it is the one that approximates
 * squinting: it throws away detail and asks whether two cats share a GIST.
 *
 * These are not independent measurements and must not be combined as though
 * they were. CIE76 is a Euclidean distance, so the distance between two tile
 * averages can never exceed the average of the per-pixel distances inside that
 * tile — the norm of a mean is at most the mean of the norms. Measured on the
 * real sheets, `block <= mean` holds for 189 of 190 pairs, and `assertGist()`
 * below keeps it honest.
 *
 * That makes `mean < T && block < T` a trap, and this file shipped with it:
 * since a low mean forces a low block, the conjunction silently reduces to
 * `mean < T` and reports six pairs where gating on `block` reports seventeen.
 * Worse, the eleven it drops are precisely the dangerous ones — two tabbies
 * whose stripes sit in different places differ a lot pixel-for-pixel (high
 * mean) while looking identical across a Cat-a-log row (low block). The gate
 * excluded them for having the kind of difference block-averaging exists to
 * discount.
 *
 * So: ALARM ON `block`. `mean` is printed beside it as context — a pair with a
 * low block and a high mean is "same cat, different freckles", which is still
 * a collision, just one with an obvious fix.
 *
 * COMPOSITE OVER A BACKGROUND, ALWAYS
 *
 * The subtle part, and the one that produced a set of over-optimistic numbers
 * when it was skipped. Sprites have alpha, so a block may be half empty. If
 * you average only the painted pixels, a block holding two pixels counts for
 * as much as a block holding sixteen, and any two breeds with different
 * silhouettes score as more distinct than they look. Compositing over a flat
 * ground first makes coverage part of the colour, which is what an eye does.
 *
 *   node scripts/sprites/separation.js
 *   node scripts/sprites/separation.js --sheet act
 *   node scripts/sprites/separation.js --dir E --threshold 8
 */
const { SLOT, SLOT_ALPHA, resolvePalette } = require('./slots');
const { FRAME_SIZE, finishFrame } = require('./rig');
const { renderFrame, buildPartAtlas } = require('./compositor');
const { ALL: ALL_DIRS } = require('./directions');
const { DIR_ANIMATIONS, ANIM_ORDER, ACT_ORDER } = require('./animations');
const { loadBreeds } = require('./breeds');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const SHEET = flag('--sheet', 'dir');
const ONE_DIR = flag('--dir', null);
const THRESHOLD = Number(flag('--threshold', 8));
const BLOCK = 4;

/**
 * The ground the cats are judged against.
 *
 * A mid-tone, slightly warm neutral — close to the Hood's lighter environments
 * and to the Cat-a-log's card background. Judging against white would flatter
 * every dark breed and judging against black would flatter every pale one.
 */
const GROUND = [222, 214, 200];

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** sRGB -> CIE L*a*b*, D65. */
function toLab(r, g, b) {
  const lin = (v) => {
    const s = v / 255;
    return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);

  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Mirror partner of each facing, so a single-direction query covers both. */
const MIRROR_OF = { E: 'W', W: 'E', SE: 'SW', SW: 'SE', NE: 'NW', NW: 'NE', S: 'S', N: 'N' };

/**
 * Guards the relationship the collision rule depends on.
 *
 * Averaging a tile before measuring it can only ever shrink the distance, so
 * `block <= mean` is a property of the maths rather than of the art. It is
 * asserted because the first version of this file combined the two with `&&`
 * as though they were independent, which silently turned the rule into
 * `mean < T` and hid eleven of seventeen colliding pairs. If this ever stops
 * holding, the metric has changed shape and the rule below needs rethinking.
 */
function assertGist(rows) {
  const inverted = rows.filter((r) => r.block > r.mean + 1e-6);
  // One pair sits on the boundary from float noise; a handful would be fine.
  if (inverted.length > rows.length * 0.05) {
    console.warn(
      `⚠ block exceeds mean on ${inverted.length}/${rows.length} pairs — ` +
        'the two measures are no longer ordered, so gating on block alone may ' +
        'no longer be the conservative choice. Re-read the header.',
    );
  }
}

// ---------------------------------------------------------------------------
// Rendering a breed to flat RGB
// ---------------------------------------------------------------------------

/** One finished frame as RGB, composited over GROUND so alpha counts. */
function frameRGB(breed, atlas, dir, animName, frameIdx) {
  const palette = resolvePalette(breed);
  const { buf, whiskers } = renderFrame(dir, animName, frameIdx, atlas, breed);
  const finished = finishFrame(buf.slice(), whiskers);

  const out = new Float64Array(FRAME_SIZE * FRAME_SIZE * 3);
  for (let i = 0; i < FRAME_SIZE * FRAME_SIZE; i++) {
    const slot = finished[i];
    let r = GROUND[0];
    let g = GROUND[1];
    let b = GROUND[2];

    if (slot !== SLOT.EMPTY) {
      const hex = palette[slot];
      if (hex) {
        const [sr, sg, sb] = hexToRgb(hex);
        const a = SLOT_ALPHA[slot] ?? 1;
        r = GROUND[0] * (1 - a) + sr * a;
        g = GROUND[1] * (1 - a) + sg * a;
        b = GROUND[2] * (1 - a) + sb * a;
      }
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** Downsamples an RGB frame into BLOCK x BLOCK tile averages. */
function blocks(rgb) {
  const per = FRAME_SIZE / BLOCK;
  const out = [];
  for (let by = 0; by < per; by++) {
    for (let bx = 0; bx < per; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const i = ((by * BLOCK + y) * FRAME_SIZE + (bx * BLOCK + x)) * 3;
          r += rgb[i];
          g += rgb[i + 1];
          b += rgb[i + 2];
        }
      }
      const n = BLOCK * BLOCK;
      out.push([r / n, g / n, b / n]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const atlas = buildPartAtlas();
  const breeds = loadBreeds();

  const order = SHEET === 'act' ? ACT_ORDER : ANIM_ORDER;
  // A single facing means its mirror too: W is E flipped, so asking for one
  // and not the other halves the sample for no reason.
  const dirs =
    SHEET === 'act'
      ? ['S']
      : ONE_DIR
        ? ALL_DIRS.filter((d) => d === ONE_DIR || d === MIRROR_OF[ONE_DIR])
        : ALL_DIRS;

  /**
   * Every shipped frame of every breed, as flat Lab.
   *
   * Typed arrays rather than arrays of 3-element arrays. The frame count here
   * is 20 breeds x 8 facings x 7 columns x 1024 pixels; as boxed arrays that
   * is well over a hundred megabytes of object headers, and it grows every
   * time a column joins ANIM_ORDER.
   */
  const profiles = new Map();
  let pixelCount = 0;
  let tileCount = 0;

  for (const breed of breeds) {
    const frames = [];
    for (const dir of dirs) {
      for (const animName of order) {
        const anim = DIR_ANIMATIONS[animName];
        for (let f = 0; f < anim.frames.length; f++) frames.push([dir, animName, f]);
      }
    }

    const perFrame = FRAME_SIZE * FRAME_SIZE;
    const perTile = (FRAME_SIZE / BLOCK) ** 2;
    const pixels = new Float32Array(frames.length * perFrame * 3);
    const tiles = new Float32Array(frames.length * perTile * 3);

    frames.forEach(([dir, animName, f], n) => {
      const rgb = frameRGB(breed, atlas, dir, animName, f);
      for (let i = 0; i < perFrame; i++) {
        const lab = toLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
        const o = (n * perFrame + i) * 3;
        pixels[o] = lab[0];
        pixels[o + 1] = lab[1];
        pixels[o + 2] = lab[2];
      }
      blocks(rgb).forEach(([r, g, b], t) => {
        const lab = toLab(r, g, b);
        const o = (n * perTile + t) * 3;
        tiles[o] = lab[0];
        tiles[o + 1] = lab[1];
        tiles[o + 2] = lab[2];
      });
    });

    pixelCount = frames.length * perFrame;
    tileCount = frames.length * perTile;
    profiles.set(breed.id, { pixels, tiles });
  }

  const flatDelta = (a, b, n) => {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      sum += Math.hypot(a[o] - b[o], a[o + 1] - b[o + 1], a[o + 2] - b[o + 2]);
    }
    return sum / n;
  };

  const rows = [];
  for (let i = 0; i < breeds.length; i++) {
    for (let j = i + 1; j < breeds.length; j++) {
      const a = profiles.get(breeds[i].id);
      const b = profiles.get(breeds[j].id);
      rows.push({
        pair: `${breeds[i].id} / ${breeds[j].id}`,
        mean: flatDelta(a.pixels, b.pixels, pixelCount),
        block: flatDelta(a.tiles, b.tiles, tileCount),
      });
    }
  }

  assertGist(rows);
  rows.sort((x, y) => x.block - y.block);

  const label = SHEET === 'act' ? 'action sheet (S)' : ONE_DIR ? `${ONE_DIR} only` : 'directional, 8 facings';
  console.log(`breed separation — ${label}, ${rows.length} pairs, CIE76 over #DED6C8\n`);
  console.log('pair                                              mean   block');
  console.log('------------------------------------------------  -----  -----');

  // The alarm is `block` alone. See the header: a low mean cannot coexist with
  // a high block, so requiring both only drops pairs that look alike while
  // differing in detail — the ones most worth catching.
  const collisions = rows.filter((r) => r.block < THRESHOLD);

  for (const r of rows.slice(0, Math.max(14, collisions.length))) {
    const detail = r.mean - r.block;
    console.log(
      `${r.pair.padEnd(48)}  ${r.mean.toFixed(2).padStart(5)}  ${r.block.toFixed(2).padStart(5)}` +
        (r.block < THRESHOLD
          ? detail > 2
            ? '  ← collision (same gist, different detail)'
            : '  ← collision'
          : ''),
    );
  }

  console.log('');
  if (collisions.length) {
    console.log(`⚠ ${collisions.length} pair(s) under ${THRESHOLD} block ΔE — alike at a glance:`);
    for (const r of collisions) {
      console.log(`   ${r.pair}  (block ${r.block.toFixed(2)}, mean ${r.mean.toFixed(2)})`);
    }
  } else {
    console.log(`✓ no pair is under ${THRESHOLD} block ΔE.`);
  }
  return collisions.length;
}

process.exitCode = main() ? 1 : 0;
