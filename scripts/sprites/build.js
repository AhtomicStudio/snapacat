#!/usr/bin/env node
/**
 * Sprite build pipeline.
 *
 *   rig (slot buffer) -> pattern mask -> outline/whiskers -> breed palette -> PNG
 *
 * Outlining runs AFTER pattern painting so a keyline can take its colour from
 * whichever marking it borders, rather than always deriving from the base coat
 * (which gave seal_point a cream outline around its near-black tail).
 *
 * Breed definitions are read straight out of src/utils/spriteLibrary.ts so the
 * palettes stay a single source of truth.
 *
 * Usage:  node scripts/sprites/build.js
 */
const fs = require('node:fs');
const path = require('node:path');

const { encodePNG, upscaleRGBA } = require('./png');
const {
  SLOT,
  SLOT_ALPHA,
  TEMPLATE_COLORS,
  resolvePalette,
  hexToRgb,
  isNearWhite,
} = require('./slots');
const { FRAME_SIZE, buildFrames, finishFrame, ANIMATIONS } = require('./rig');
const { applyPattern } = require('./patterns');

const ROOT = path.resolve(__dirname, '..', '..');
const LIBRARY_TS = path.join(ROOT, 'src', 'utils', 'spriteLibrary.ts');
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'sprites');
const TEMPLATE_DIR = path.join(OUT_DIR, 'template');

/** Shipped sheets are pre-scaled; see upscaleRGBA in png.js for why. */
const DISPLAY_SCALE = 4;

// ---------------------------------------------------------------------------
// Breed definitions
// ---------------------------------------------------------------------------

/**
 * Extracts breed records from the TypeScript source. Field order in
 * SpriteDefinition is stable, so a single ordered regex is enough — and the
 * expected-count assertion below turns any future refactor into a loud build
 * failure rather than silently missing breeds.
 */
function loadBreeds() {
  const src = fs.readFileSync(LIBRARY_TS, 'utf8');
  const re =
    /id:\s*'([^']+)'[\s\S]*?label:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?palette:\s*\[([^\]]+)\][\s\S]*?pattern:\s*'([^']+)'[\s\S]*?rarity:\s*'([^']+)'[\s\S]*?tier:\s*(\d)/g;

  const breeds = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const palette = m[3]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    breeds.push({
      id: m[1],
      label: m[2].replace(/\\'/g, "'"),
      palette,
      pattern: m[4],
      rarity: m[5],
      tier: Number(m[6]),
      hasWhite: palette.some(isNearWhite),
      // The palette is ordered by area coverage, so a white first entry means
      // the cat is mostly white and its markings should invert.
      whiteDominant: isNearWhite(palette[0]),
    });
  }

  if (breeds.length === 0) {
    throw new Error(`No breeds parsed from ${LIBRARY_TS} — has SpriteDefinition changed shape?`);
  }
  return breeds;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Lays frames out left-to-right and resolves slot indices to RGBA.
 *
 * The ground shadow is composited UNDER the sprite from a descriptor rather
 * than living in the slot buffer. Occupying a buffer cell meant the outline
 * pass — which only writes into EMPTY — skipped that row entirely, deleting
 * the bottom keyline and dissolving the paws into the ground.
 */
function composeSheet(frames, palette, shadows = []) {
  const width = FRAME_SIZE * frames.length;
  const height = FRAME_SIZE;
  const rgba = Buffer.alloc(width * height * 4); // zero-filled == transparent

  frames.forEach((frame, frameIndex) => {
    const offsetX = frameIndex * FRAME_SIZE;

    const sh = shadows[frameIndex];
    const shadowHex = palette[SLOT.SHADOW];
    if (sh && shadowHex) {
      const { r, g, b } = hexToRgb(shadowHex);
      const alpha = Math.round(255 * (SLOT_ALPHA[SLOT.SHADOW] ?? 0.2));
      for (let y = Math.floor(sh.cy - sh.ry); y <= Math.ceil(sh.cy + sh.ry); y++) {
        for (let x = Math.floor(sh.cx - sh.rx); x <= Math.ceil(sh.cx + sh.rx); x++) {
          if (x < 0 || y < 0 || x >= FRAME_SIZE || y >= FRAME_SIZE) continue;
          const dx = (x - sh.cx) / sh.rx;
          const dy = (y - sh.cy) / sh.ry;
          if (dx * dx + dy * dy > 1) continue;
          const di = (y * width + (offsetX + x)) * 4;
          rgba[di] = r;
          rgba[di + 1] = g;
          rgba[di + 2] = b;
          rgba[di + 3] = alpha;
        }
      }
    }

    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const slot = frame[y * FRAME_SIZE + x];
        if (slot === SLOT.EMPTY) continue;

        const hex = palette[slot];
        if (!hex) continue;

        const { r, g, b } = hexToRgb(hex);
        const di = (y * width + (offsetX + x)) * 4;
        rgba[di] = r;
        rgba[di + 1] = g;
        rgba[di + 2] = b;
        rgba[di + 3] = Math.round(255 * (SLOT_ALPHA[slot] ?? 1));
      }
    }
  });

  return { rgba, width, height };
}

function writeSheet(filePath, rgba, width, height, scale) {
  const scaled = upscaleRGBA(rgba, width, height, scale);
  fs.writeFileSync(filePath, encodePNG(width * scale, height * scale, scaled));
}

/** rig frames -> finished, patterned slot buffers for one breed. */
function renderBreed(frames, breed) {
  return frames.map((frame) =>
    finishFrame(applyPattern(frame.buf, breed), frame.whiskers),
  );
}

const shadowsOf = (frames) => frames.map((f) => f.shadow);

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function writeManifest(breeds, frameCount) {
  const entries = breeds.map((b) => `  ${b.id}: require('./${b.id}.png'),`).join('\n');

  const anims = Object.entries(ANIMATIONS)
    .map(
      ([name, a]) =>
        `  ${name}: { frames: [${a.frames.join(', ')}], durations: [${a.durations.join(', ')}] },`,
    )
    .join('\n');

  const contents = `/**
 * AUTO-GENERATED by scripts/sprites/build.js — do not edit by hand.
 * Run \`npm run sprites\` to regenerate.
 *
 * Metro requires static require() calls, so the sheet map has to be written
 * out literally rather than resolved at runtime.
 */
import type { ImageSourcePropType } from 'react-native';

/** Size of one frame in the shipped (pre-scaled) sheet, in pixels. */
export const FRAME_SIZE = ${FRAME_SIZE * DISPLAY_SCALE};

/** Size of one frame in the authoring template, in pixels. */
export const SOURCE_FRAME_SIZE = ${FRAME_SIZE};

/** Number of frames per sheet, laid out left-to-right. */
export const FRAME_COUNT = ${frameCount};

export interface SpriteAnimation {
  /**
   * Sheet frame indices to play in order, looping. Referencing frames by index
   * lets a rest-mid-peak-mid cycle reuse the mid pose instead of shipping a
   * duplicate frame.
   */
  frames: number[];
  /** Per-frame hold time in ms, parallel to \`frames\`. Asymmetric timings carry the ease. */
  durations: number[];
}

export const ANIMATIONS: Record<'idle' | 'sleep', SpriteAnimation> = {
${anims}
};

export const SPRITE_SHEETS: Record<string, ImageSourcePropType> = {
${entries}
};

/**
 * Returns the sheet for a sprite id, falling back to the first breed.
 *
 * The fallback is deliberate — a renamed breed or a legacy Firestore document
 * should still render a cat — but it is silent, which turns "every cat is a
 * brown tabby" into a mystery. Warn in development.
 */
export function getSpriteSheet(spriteId: string): ImageSourcePropType {
  const sheet = SPRITE_SHEETS[spriteId];
  if (!sheet) {
    // typeof guard: __DEV__ is a React Native global, and this module is also
    // loaded by the Jest suite, which runs in a plain node environment.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(\`[sprites] Unknown sprite id "\${spriteId}" — falling back to ${breeds[0].id}.\`);
    }
    return SPRITE_SHEETS['${breeds[0].id}']!;
  }
  return sheet;
}
`;

  fs.writeFileSync(path.join(OUT_DIR, 'index.ts'), contents);
}

// ---------------------------------------------------------------------------
// Authoring template
// ---------------------------------------------------------------------------

/**
 * Emits the unscaled rig in template colours plus a palette swatch strip.
 * These are what you open in Aseprite to draw real art over — matching the
 * template colours exactly is what lets art be mapped back to slots.
 */
function writeTemplate(frames) {
  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });

  const finished = frames.map((f) => finishFrame(f.buf.slice(), f.whiskers));
  const { rgba, width, height } = composeSheet(finished, TEMPLATE_COLORS, shadowsOf(frames));
  writeSheet(path.join(TEMPLATE_DIR, 'rig_1x.png'), rgba, width, height, 1);
  writeSheet(path.join(TEMPLATE_DIR, 'rig_8x.png'), rgba, width, height, 8);

  // Palette strip: one 8x8 swatch per slot, in slot order.
  const slots = Object.entries(TEMPLATE_COLORS).filter(([, hex]) => hex);
  const sw = 8;
  const stripW = slots.length * sw;
  const strip = Buffer.alloc(stripW * sw * 4);
  slots.forEach(([, hex], i) => {
    const { r, g, b } = hexToRgb(hex);
    for (let y = 0; y < sw; y++) {
      for (let x = 0; x < sw; x++) {
        const di = (y * stripW + i * sw + x) * 4;
        strip[di] = r;
        strip[di + 1] = g;
        strip[di + 2] = b;
        strip[di + 3] = 255;
      }
    }
  });
  writeSheet(path.join(TEMPLATE_DIR, 'palette.png'), strip, stripW, sw, 4);

  // Aseprite-compatible palette file.
  const slotName = (value) =>
    Object.keys(SLOT).find((k) => String(SLOT[k]) === String(value)) ?? String(value);
  const gpl = [
    'GIMP Palette',
    'Name: SnapaCat Sprite Slots',
    'Columns: 4',
    '#',
    ...Object.entries(TEMPLATE_COLORS)
      .filter(([, hex]) => hex)
      .map(([slot, hex]) => {
        const { r, g, b } = hexToRgb(hex);
        return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${slotName(slot)}`;
      }),
  ].join('\n');
  fs.writeFileSync(path.join(TEMPLATE_DIR, 'snapacat-slots.gpl'), gpl + '\n');
}

// ---------------------------------------------------------------------------
// Contact sheet (visual QA)
// ---------------------------------------------------------------------------

/**
 * Every breed's idle frame in one grid, on alternating cell backgrounds so
 * both pale and dark coats can be judged against a realistic Hood backdrop.
 * Purely a review aid — never bundled into the app.
 */
function writeContactSheet(breeds, frames) {
  const COLS = 5;
  const scale = 4;
  const cell = FRAME_SIZE * scale;
  const rows = Math.ceil(breeds.length / COLS);
  const W = COLS * cell;
  const H = rows * cell;
  const out = Buffer.alloc(W * H * 4);

  const BG = [hexToRgb('#FAF6F0'), hexToRgb('#E8DFD2')];

  breeds.forEach((breed, i) => {
    const palette = resolvePalette(breed);
    const rendered = renderBreed([frames[0]], breed);
    const { rgba } = composeSheet(rendered, palette, [frames[0].shadow]);
    const scaled = upscaleRGBA(rgba, FRAME_SIZE, FRAME_SIZE, scale);

    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const bg = BG[(col + row) % 2];
    const ox = col * cell;
    const oy = row * cell;

    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const si = (y * cell + x) * 4;
        const di = ((oy + y) * W + ox + x) * 4;
        const a = scaled[si + 3] / 255;
        out[di] = scaled[si] * a + bg.r * (1 - a);
        out[di + 1] = scaled[si + 1] * a + bg.g * (1 - a);
        out[di + 2] = scaled[si + 2] * a + bg.b * (1 - a);
        out[di + 3] = 255;
      }
    }
  });

  fs.writeFileSync(path.join(TEMPLATE_DIR, 'contact.png'), encodePNG(W, H, out));
}

/** All frames of one breed, enlarged — for judging the animation cycle. */
function writeAnimStrip(breed, frames) {
  const palette = resolvePalette(breed);
  const rendered = renderBreed(frames, breed);
  const { rgba, width, height } = composeSheet(rendered, palette, shadowsOf(frames));
  writeSheet(path.join(TEMPLATE_DIR, 'anim_8x.png'), rgba, width, height, 8);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const breeds = loadBreeds();
  const frames = buildFrames();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const breed of breeds) {
    const rendered = renderBreed(frames, breed);
    const palette = resolvePalette(breed);
    const { rgba, width, height } = composeSheet(rendered, palette, shadowsOf(frames));
    writeSheet(path.join(OUT_DIR, `${breed.id}.png`), rgba, width, height, DISPLAY_SCALE);
  }

  writeManifest(breeds, frames.length);
  writeTemplate(frames);
  writeContactSheet(breeds, frames);
  writeAnimStrip(breeds[0], frames);

  const sheetPx = `${FRAME_SIZE * frames.length * DISPLAY_SCALE}x${FRAME_SIZE * DISPLAY_SCALE}`;
  console.log(`✓ ${breeds.length} sprite sheets  (${frames.length} frames, ${sheetPx})`);
  console.log(`  → src/assets/sprites/`);
  console.log(`✓ template, palette, contact sheet, anim strip`);
  console.log(`  → src/assets/sprites/template/`);
}

main();
