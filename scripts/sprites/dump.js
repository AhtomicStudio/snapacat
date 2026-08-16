#!/usr/bin/env node
/**
 * Prints a rig frame's slot buffer as characters.
 *
 * Squinting at an 8x PNG tells you something is wrong; this tells you which
 * pixel. Every geometry fix in this pipeline has come from reading one of
 * these dumps rather than from looking at the render.
 *
 * Usage:  node scripts/sprites/dump.js [frameIndex]     (default 0)
 *         node scripts/sprites/dump.js 3 --outline      (run the outline pass first)
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

const frameIndex = Number(process.argv[2] ?? 0);
const withOutline = process.argv.includes('--outline');

const frames = buildFrames();
const frame = frames[frameIndex];
if (!frame) {
  console.error(`No frame ${frameIndex}; buildFrames() returned ${frames.length}.`);
  process.exit(1);
}

const buf = withOutline
  ? finishFrame(frame.buf.slice(), frame.whiskers)
  : frame.buf.slice();

// Column ruler — tens digit then units, so x can be read off directly.
const tens = Array.from({ length: FRAME_SIZE }, (_, x) => (x % 10 === 0 ? String(x / 10 | 0) : ' ')).join('');
const ones = Array.from({ length: FRAME_SIZE }, (_, x) => String(x % 10)).join('');
console.log(`frame ${frameIndex}${withOutline ? ' (outlined)' : ''}   shadow=${JSON.stringify(frame.shadow)}`);
console.log(`    ${tens}`);
console.log(`    ${ones}`);

for (let y = 0; y < FRAME_SIZE; y++) {
  let row = '';
  for (let x = 0; x < FRAME_SIZE; x++) row += CHARS[buf[y * FRAME_SIZE + x]] ?? '?';
  if (row.trim() === '') continue; // skip fully empty rows
  console.log(`${String(y).padStart(3)} ${row}`);
}

// Slot histogram — catches "this feature is 3 pixels" problems.
const counts = {};
for (const v of buf) counts[v] = (counts[v] ?? 0) + 1;
const summary = Object.entries(counts)
  .filter(([slot]) => Number(slot) !== SLOT.EMPTY)
  .sort((a, b) => b[1] - a[1])
  .map(([slot, n]) => `${CHARS[slot]}:${n}`)
  .join('  ');
console.log(`\n${summary}`);
