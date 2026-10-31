#!/usr/bin/env node
/**
 * Renders composed directional frames large, for judging art rather than data.
 *
 * dump.js answers "which pixel is wrong". This answers "does this read as a
 * cat", which is a different question and needs a different output: big, in
 * colour, with every frame of a cycle side by side so timing and silhouette can
 * be judged together.
 *
 * It also renders the SILHOUETTE test the pipeline doc keeps coming back to —
 * every pose flattened to solid black. Three rounds of prop work on this
 * project failed by adding interior detail to a shape that was already
 * unreadable, and the flattened view is the only one that makes that obvious.
 *
 *   node scripts/sprites/inspect.js                      all dirs, idle
 *   node scripts/sprites/inspect.js --anim walk          all dirs, walk cycle
 *   node scripts/sprites/inspect.js --dir E --all        one dir, every anim
 *   node scripts/sprites/inspect.js --breed calico
 *   node scripts/sprites/inspect.js --silhouette
 *   node scripts/sprites/inspect.js --out path/to.png
 */
const fs = require('node:fs');
const path = require('node:path');
const { encodePNG, upscaleRGBA } = require('./png');
const { SLOT, SLOT_ALPHA, resolvePalette } = require('./slots');
const { FRAME_SIZE, finishFrame } = require('./rig');
const { renderFrame, buildPartAtlas } = require('./compositor');
const { ALL: ALL_DIRS } = require('./directions');
const { DIR_ANIMATIONS, ANIM_ORDER, ACT_ORDER } = require('./animations');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(name);

const SCALE = Number(flag('--scale', 7));
const SILHOUETTE = has('--silhouette');
const BREED_ID = flag('--breed', 'brown_mackerel_tabby');
const ONE_DIR = flag('--dir', null);
const ANIM = flag('--anim', 'idle');

const { breedById } = require('./breeds');

// ---------------------------------------------------------------------------
// Grid render
// ---------------------------------------------------------------------------

const BG_LIGHT = [250, 246, 240, 255];
const BG_DARK = [34, 32, 38, 255];

function cellsToRender() {
  const atlas = buildPartAtlas();
  const cells = [];

  if (ONE_DIR && has('--all')) {
    // --all on S means the action sheet too; that is where the flavour idles are.
    const order = ONE_DIR === 'S' ? [...new Set([...ANIM_ORDER, ...ACT_ORDER])] : ANIM_ORDER;
    for (const animName of order) {
      const anim = DIR_ANIMATIONS[animName];
      for (let f = 0; f < anim.frames.length; f++) {
        cells.push({ dir: ONE_DIR, animName, frame: f, label: `${animName}${f}` });
      }
    }
    return { atlas, cells, cols: Math.min(cells.length, 10) };
  }

  if (ONE_DIR) {
    const anim = DIR_ANIMATIONS[ANIM];
    for (let f = 0; f < anim.frames.length; f++) {
      cells.push({ dir: ONE_DIR, animName: ANIM, frame: f, label: `${ANIM}${f}` });
    }
    return { atlas, cells, cols: cells.length };
  }

  const anim = DIR_ANIMATIONS[ANIM];
  for (const dir of ALL_DIRS) {
    for (let f = 0; f < anim.frames.length; f++) {
      cells.push({ dir, animName: ANIM, frame: f, label: `${dir}` });
    }
  }
  return { atlas, cells, cols: anim.frames.length };
}

function main() {
  const { atlas, cells, cols } = cellsToRender();
  const breed = breedById(BREED_ID);
  const palette = resolvePalette(breed);

  const rows = Math.ceil(cells.length / cols);
  const W = cols * FRAME_SIZE;
  const H = rows * FRAME_SIZE;
  const rgba = Buffer.alloc(W * H * 4);

  // Checkerboard the cells so neighbouring frames stay distinguishable.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cellX = Math.floor(x / FRAME_SIZE);
      const cellY = Math.floor(y / FRAME_SIZE);
      const bg = SILHOUETTE
        ? [255, 255, 255, 255]
        : (cellX + cellY) % 2
          ? BG_LIGHT
          : [243, 237, 229, 255];
      const i = (y * W + x) * 4;
      rgba[i] = bg[0]; rgba[i + 1] = bg[1]; rgba[i + 2] = bg[2]; rgba[i + 3] = 255;
    }
  }

  cells.forEach((cell, n) => {
    const { buf, whiskers } = renderFrame(cell.dir, cell.animName, cell.frame, atlas, breed);
    const finished = finishFrame(buf.slice(), whiskers);
    const ox = (n % cols) * FRAME_SIZE;
    const oy = Math.floor(n / cols) * FRAME_SIZE;

    for (let y = 0; y < FRAME_SIZE; y++) {
      for (let x = 0; x < FRAME_SIZE; x++) {
        const slot = finished[y * FRAME_SIZE + x];
        if (slot === SLOT.EMPTY) continue;
        const d = ((oy + y) * W + (ox + x)) * 4;

        if (SILHOUETTE) {
          rgba[d] = 20; rgba[d + 1] = 20; rgba[d + 2] = 24; rgba[d + 3] = 255;
          continue;
        }

        const hex = palette[slot];
        if (!hex) continue;
        const a = SLOT_ALPHA[slot] ?? 1;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        rgba[d] = Math.round(rgba[d] * (1 - a) + r * a);
        rgba[d + 1] = Math.round(rgba[d + 1] * (1 - a) + g * a);
        rgba[d + 2] = Math.round(rgba[d + 2] * (1 - a) + b * a);
      }
    }
  });

  const out = flag('--out', path.join(__dirname, 'inspect.png'));
  fs.writeFileSync(out, encodePNG(W * SCALE, H * SCALE, upscaleRGBA(rgba, W, H, SCALE)));
  const what = ONE_DIR ? `${ONE_DIR} ${has('--all') ? 'all anims' : ANIM}` : `8 dirs ${ANIM}`;
  console.log(`${out}  ${what}  ${BREED_ID}${SILHOUETTE ? '  [silhouette]' : ''}`);
}

main();
