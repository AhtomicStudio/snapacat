/**
 * Imports external art into the sprite pipeline.
 *
 * WHY THIS EXISTS
 *
 * `png.js` is write-only by design, which was a reasonable call — the pipeline
 * only ever needed to emit sheets, and Node ships zlib. The cost only showed up
 * later: art could be BORN in code and nowhere else. A drawing from Aseprite, a
 * generation from a pixel-art model, a photo reference — none of it had a way
 * in, so every asset had to be expressed as JavaScript.
 *
 * This is the way in. It decodes any image and lands it on the project's grid,
 * in the project's palette, with the project's keyline — so imported art can be
 * palette-swapped, pattern-painted and verified exactly like art authored here.
 *
 * WHAT IT DOES NOT DO
 *
 * It will not make bad source good. Generic image models emit ~512px raster
 * with thousands of colours and soft edges; downsampling that produces mush no
 * matter how careful the quantiser is. Source should already be pixel art, or
 * close to it — see docs/pixel-animation-pipeline.md §1.
 *
 * USAGE
 *
 *   node scripts/sprites/import.js in.png --png out.png
 *       Finished 32x32 art in the project palette, shipped at 4x. For props.
 *
 *   node scripts/sprites/import.js in.png --slots out.json
 *       A SEMANTIC SLOT buffer. This is the one that matters: slots are what
 *       let one authored pose cover all 20 breeds, because the compositor
 *       resolves them against a breed palette at build time. A finished
 *       coloured image cannot do that.
 *
 *   Options:
 *     --size N        target frame size (default 32)
 *     --no-outline    skip the keyline pass (source already has one)
 *     --no-despeckle  keep 1px features the despeckler would eat
 *     --report        print the palette mapping and per-slot pixel counts
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { encodePNG, upscaleRGBA } = require('./png');
const { SLOT, TEMPLATE_COLORS, hexToRgb } = require('./slots');

// ---------------------------------------------------------------------------
// Colour distance
// ---------------------------------------------------------------------------

/**
 * sRGB -> CIE Lab.
 *
 * Nearest-colour in raw RGB picks visibly wrong slots: it will map a mid brown
 * to the outline before it maps it to COAT_BASE, because RGB distance is not
 * perceptual. Lab is what makes "nearest" mean what a person means by it.
 */
function srgbToLab(r, g, b) {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = f(r), G = f(g), B = f(b);

  // sRGB D65 -> XYZ
  let x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  let z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;

  const k = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  x = k(x); y = k(y); z = k(z);

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76. Good enough for choosing between 18 well-separated slot colours. */
function deltaE(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------------------------------------------------------------------------
// Downsample
// ---------------------------------------------------------------------------

/**
 * Box-samples the source into an N x N grid, taking the DOMINANT colour of
 * each cell rather than the average.
 *
 * Averaging is what ruins pixel art. Two adjacent authored colours average into
 * a third that exists in neither the source nor the palette, and every keyline
 * turns to fog. Taking the most common colour in the cell keeps every output
 * pixel a colour that was actually in the source.
 *
 * Transparency wins a cell only when it is the clear majority — otherwise a
 * one-pixel limb bordered by empty space gets eroded away.
 */
function dominantDownsample(data, srcW, srcH, size) {
  const out = new Uint8Array(size * size * 4);

  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const x0 = Math.floor((tx * srcW) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * srcW) / size));
      const y0 = Math.floor((ty * srcH) / size);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * srcH) / size));

      const counts = new Map();
      let opaque = 0;
      let total = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * srcW + x) * 4;
          total++;
          if (data[i + 3] < 128) continue;
          opaque++;
          const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }

      const d = (ty * size + tx) * 4;
      if (opaque * 2 < total) continue; // majority-transparent cell stays empty

      let best = -1;
      let bestN = -1;
      for (const [key, n] of counts) {
        if (n > bestN) { bestN = n; best = key; }
      }
      if (best < 0) continue;

      out[d] = (best >> 16) & 0xff;
      out[d + 1] = (best >> 8) & 0xff;
      out[d + 2] = best & 0xff;
      out[d + 3] = 255;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Slot mapping
// ---------------------------------------------------------------------------

/** Slots a source pixel can legitimately become. SHADOW is composited, not authored. */
const MAPPABLE = Object.entries(TEMPLATE_COLORS)
  .filter(([slot, hex]) => hex && Number(slot) !== SLOT.SHADOW)
  .map(([slot, hex]) => {
    const { r, g, b } = hexToRgb(hex);
    return { slot: Number(slot), hex, lab: srgbToLab(r, g, b) };
  });

const SLOT_NAME = Object.fromEntries(Object.entries(SLOT).map(([k, v]) => [v, k]));

/** Maps every opaque pixel to its nearest authoring slot. */
function toSlots(rgba, size) {
  const buf = new Uint8Array(size * size).fill(SLOT.EMPTY);
  const hits = new Map();

  for (let i = 0; i < size * size; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const lab = srgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);

    let best = MAPPABLE[0];
    let bestD = Infinity;
    for (const cand of MAPPABLE) {
      const d = deltaE(lab, cand.lab);
      if (d < bestD) { bestD = d; best = cand; }
    }

    buf[i] = best.slot;
    const rec = hits.get(best.slot) ?? { n: 0, worst: 0 };
    rec.n++;
    rec.worst = Math.max(rec.worst, bestD);
    hits.set(best.slot, rec);
  }

  return { buf, hits };
}

// ---------------------------------------------------------------------------
// Cleanup passes — same conventions as rig.js
// ---------------------------------------------------------------------------

/** Removes lone pixels whose neighbours all disagree. */
function despeckle(buf, size) {
  const src = buf.slice();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const s = src[i];
      if (s === SLOT.EMPTY || s === SLOT.OUTLINE) continue;
      let same = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (src[ny * size + nx] === s) same++;
      }
      if (same === 0) {
        // Inherit the dominant neighbour rather than punching a hole.
        const tally = new Map();
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
          const n = src[ny * size + nx];
          tally.set(n, (tally.get(n) ?? 0) + 1);
        }
        let pick = SLOT.EMPTY, pickN = -1;
        for (const [k, n] of tally) if (n > pickN) { pickN = n; pick = k; }
        buf[i] = pick;
      }
    }
  }
}

/**
 * Dilates a keyline OUTWARD into transparency.
 *
 * Identical to rig.js's applyOutline, and for the same reason: overwriting
 * solid pixels that touch transparency erodes the silhouette and eats thin
 * geometry entirely.
 */
function outline(buf, size) {
  const src = buf.slice();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (src[i] !== SLOT.EMPTY) continue;
      let touches = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const n = src[ny * size + nx];
        if (n !== SLOT.EMPTY && n !== SLOT.SHADOW) { touches = true; break; }
      }
      if (touches) buf[i] = SLOT.OUTLINE;
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function slotsToRGBA(buf, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const slot = buf[i];
    if (slot === SLOT.EMPTY) continue;
    const hex = TEMPLATE_COLORS[slot];
    if (!hex) continue;
    const { r, g, b } = hexToRgb(hex);
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function importArt(input, opts = {}) {
  const size = opts.size ?? 32;

  const img = sharp(input).ensureAlpha();
  const meta = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });

  const small = dominantDownsample(data, meta.width, meta.height, size);
  const { buf, hits } = toSlots(small, size);

  if (opts.despeckle !== false) despeckle(buf, size);
  if (opts.outline !== false) outline(buf, size);

  return { buf, hits, size, source: { width: meta.width, height: meta.height } };
}

function report(result) {
  const { hits, source, size } = result;
  console.log(`source ${source.width}x${source.height} -> ${size}x${size}`);
  const rows = [...hits.entries()].sort((a, b) => b[1].n - a[1].n);
  console.log('slot                 px   worst ΔE');
  for (const [slot, rec] of rows) {
    const name = (SLOT_NAME[slot] ?? String(slot)).padEnd(18);
    const flag = rec.worst > 30 ? '  <- far from any slot' : '';
    console.log(`${name} ${String(rec.n).padStart(4)}   ${rec.worst.toFixed(1)}${flag}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const input = argv.find((a) => !a.startsWith('--'));
  if (!input) {
    console.error('usage: node scripts/sprites/import.js <in.png> [--png out.png] [--slots out.json] [--size N] [--report]');
    process.exit(1);
  }
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };

  const result = await importArt(input, {
    size: flag('--size') ? Number(flag('--size')) : 32,
    outline: !argv.includes('--no-outline'),
    despeckle: !argv.includes('--no-despeckle'),
  });

  if (argv.includes('--report')) report(result);

  const pngOut = flag('--png');
  if (pngOut) {
    const rgba = slotsToRGBA(result.buf, result.size);
    const scale = 4;
    fs.mkdirSync(path.dirname(path.resolve(pngOut)), { recursive: true });
    fs.writeFileSync(
      pngOut,
      encodePNG(result.size * scale, result.size * scale, upscaleRGBA(rgba, result.size, result.size, scale)),
    );
    console.log(`wrote ${pngOut} (${result.size * scale}px)`);
  }

  const slotsOut = flag('--slots');
  if (slotsOut) {
    fs.mkdirSync(path.dirname(path.resolve(slotsOut)), { recursive: true });
    fs.writeFileSync(
      slotsOut,
      JSON.stringify({ size: result.size, slots: Array.from(result.buf) }, null, 0),
    );
    console.log(`wrote ${slotsOut} (${result.size}x${result.size} slot buffer)`);
  }

  if (!pngOut && !slotsOut && !argv.includes('--report')) report(result);
}

module.exports = { importArt, dominantDownsample, toSlots, srgbToLab, deltaE };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
