#!/usr/bin/env node
/**
 * Prints a frame's slot buffer as characters.
 *
 * Squinting at an 8x PNG tells you something is wrong; this tells you which
 * pixel. Every geometry fix in this pipeline has come from reading one of
 * these dumps rather than from looking at the render.
 *
 * Whole-frame rig:
 *   node scripts/sprites/dump.js 0                  sit rest
 *   node scripts/sprites/dump.js 3 --outline        sleep, outline pass applied
 *
 * Composited directional frame:
 *   node scripts/sprites/dump.js --dir E                    idle frame 0
 *   node scripts/sprites/dump.js --dir NE --anim walk --f 2
 *   node scripts/sprites/dump.js --dir E --regions          anatomical regions
 *   node scripts/sprites/dump.js --parts E                  per-part placement
 */
const { SLOT } = require('./slots');
const { FRAME_SIZE, buildFrames, finishFrame } = require('./rig');

/** One character per slot. Chosen so shape reads at a glance in a terminal. */
const CHARS = {
  [SLOT.EMPTY]: '.',
  [SLOT.OUTLINE]: '#',
  [SLOT.COAT_DARK]: 'd',
  [SLOT.COAT_BASE]: 'b',
  [SLOT.COAT_LIGHT]: 'L',
  [SLOT.PATTERN]: 'p',
  [SLOT.WHITE]: 'W',
  [SLOT.EYE]: 'e',
  [SLOT.PINK]: 'k',
  [SLOT.EYE_SHINE]: '*',
  [SLOT.COAT_SHADOW]: 'S',
  [SLOT.PATTERN_LIGHT]: 'P',
  [SLOT.PATTERN_DARK]: 'q',
  [SLOT.WHITE_DARK]: 'w',
  [SLOT.OUTLINE_SOFT]: '-',
  [SLOT.EYE_DARK]: 'E',
  [SLOT.SHADOW]: '_',
  [SLOT.FUR_LIGHT]: 'F',
};

/** One character per anatomical region, for --regions. */
const REGION_CHARS = ['.', 'B', 'H', 'T', 'L', 'E', 'M']; // NONE BODY HEAD TAIL LEG EAR MUZZLE

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

/** Prints a 32x32 buffer with a column ruler, skipping fully empty rows. */
function printBuffer(buf, chars, title) {
  const tens = Array.from({ length: FRAME_SIZE }, (_, x) =>
    x % 10 === 0 ? String((x / 10) | 0) : ' ').join('');
  const ones = Array.from({ length: FRAME_SIZE }, (_, x) => String(x % 10)).join('');
  console.log(title);
  console.log(`    ${tens}`);
  console.log(`    ${ones}`);

  for (let y = 0; y < FRAME_SIZE; y++) {
    let row = '';
    for (let x = 0; x < FRAME_SIZE; x++) row += chars[buf[y * FRAME_SIZE + x]] ?? '?';
    if (row.trim() === '') continue;
    console.log(`${String(y).padStart(3)} ${row}`);
  }

  const counts = {};
  for (const v of buf) counts[v] = (counts[v] ?? 0) + 1;
  console.log('\n' + Object.entries(counts)
    .filter(([s]) => Number(s) !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${chars[s]}:${n}`)
    .join('  '));
}

// ---------------------------------------------------------------------------
// --parts: where each part actually lands, and how much of it survives
// ---------------------------------------------------------------------------

if (argv[0] === '--parts') {
  const dir = argv[1] ?? 'S';
  const { buildPartAtlas } = require('./parts');
  const { ROOTS, ANCHORS, DRAW_ORDER, RESOLVE } = require('./directions');

  const source = RESOLVE[dir].source;
  const atlas = buildPartAtlas();
  const root = ROOTS[source];

  console.log(`\nparts for ${dir} (source ${source}), root ${root.x},${root.y}\n`);
  console.log('part    cell   anchor   authored frame box     painted');
  console.log('------  -----  -------  ----------------------  -------');

  for (const partId of DRAW_ORDER[source]) {
    const cell = atlas[partId][source][0];
    const a = ANCHORS[source][partId];
    const fx = root.x + a[0] - cell.ax;
    const fy = root.y + a[1] - cell.ay;
    console.log(
      `${partId.padEnd(6)}  ${String(cell.w).padStart(2)}x${String(cell.h).padEnd(2)}  ` +
      `${String(a[0]).padStart(3)},${String(a[1]).padStart(3)}  ` +
      `x${String(fx).padStart(2)}..${String(fx + cell.w - 1).padStart(2)}  ` +
      `y${String(fy).padStart(2)}..${String(fy + cell.h - 1).padStart(2)}   ` +
      `${String(cell.painted).padStart(5)}`,
    );
  }
  console.log('\nOut-of-frame boxes (x<0, x>31, y<0, y>31) are art that will be clipped.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --dir: composited directional frame
// ---------------------------------------------------------------------------

if (argv.includes('--dir')) {
  const dir = flag('--dir') ?? 'S';
  const animName = flag('--anim') ?? 'idle';
  const frameIdx = Number(flag('--f') ?? 0);
  const showRegions = argv.includes('--regions');

  const { compose, shadeComposite } = require('./compositor');
  const { buildPartAtlas } = require('./parts');

  const atlas = buildPartAtlas();
  const { buf, regionBuf, whiskers, shadow } = compose(dir, animName, frameIdx, atlas);
  if (!argv.includes('--raw')) shadeComposite(buf, regionBuf);
  if (argv.includes('--outline')) finishFrame(buf, whiskers);

  printBuffer(
    showRegions ? regionBuf : buf,
    showRegions ? REGION_CHARS : CHARS,
    `\n${dir} ${animName} frame ${frameIdx}${showRegions ? ' (regions)' : ''}` +
    `   shadow=${JSON.stringify(shadow)}`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Whole-frame rig (default)
// ---------------------------------------------------------------------------

const frameIndex = Number(argv[0] ?? 0);
const withOutline = argv.includes('--outline');

const frames = buildFrames();
const frame = frames[frameIndex];
if (!frame) {
  console.error(`No frame ${frameIndex}; buildFrames() returned ${frames.length}.`);
  process.exit(1);
}

const buf = withOutline
  ? finishFrame(frame.buf.slice(), frame.whiskers)
  : frame.buf.slice();

printBuffer(buf, CHARS,
  `frame ${frameIndex}${withOutline ? ' (outlined)' : ''}   shadow=${JSON.stringify(frame.shadow)}`);
