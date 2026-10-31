#!/usr/bin/env node
/**
 * Measures how much each animation actually MOVES.
 *
 * verify.js answers "is this frame well formed". This answers a question that
 * has bitten this project before and is invisible to both the verifier and the
 * eye: does the animation do anything?
 *
 * The walk cycle shipped once with its two passing frames byte-identical and
 * its two contact frames differing by two pixels out of 335 — four frames of
 * animation delivering about one pose. Nothing failed, nothing warned, and the
 * contact sheet looked fine, because a contact sheet shows one frame.
 *
 * So: per animation, the pixel delta between consecutive frames of the played
 * sequence, and the number of distinct frames the sequence visits. A flavour
 * idle whose biggest step is a handful of pixels is a flavour idle nobody will
 * ever notice is playing.
 *
 *   node scripts/sprites/motion.js
 *   node scripts/sprites/motion.js --dir E
 */
const { FRAME_SIZE, finishFrame } = require('./rig');
const { SLOT } = require('./slots');
const { renderFrame, buildPartAtlas } = require('./compositor');
const { DIR_ANIMATIONS, ANIM_ORDER, ACT_ORDER } = require('./animations');
const { breedById } = require('./breeds');

const argv = process.argv.slice(2);
const flagAt = argv.indexOf('--dir');
const ONLY_DIR = flagAt === -1 ? null : argv[flagAt + 1];

/** Pixels that differ between two finished frames. */
function delta(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** Non-empty pixels, for expressing a delta as a share of the sprite. */
function filled(buf) {
  let n = 0;
  for (const s of buf) if (s !== SLOT.EMPTY) n++;
  return n;
}

/**
 * Below this many changed pixels, a step between two frames is not visible at
 * the size cats render. Derived from the walk-cycle regression: its contact
 * frames differed by 2px and read as frozen, while the 1px head lift that
 * caused a visible detachment bug touched roughly 12.
 */
const INVISIBLE = 6;

function main() {
  const atlas = buildPartAtlas();
  const breed = breedById('brown_mackerel_tabby');
  const pairs = ONLY_DIR
    ? [[ONLY_DIR, [...new Set([...ANIM_ORDER, ...ACT_ORDER])]]]
    : [['S', [...new Set([...ANIM_ORDER, ...ACT_ORDER])]], ['E', ANIM_ORDER], ['N', ANIM_ORDER]];

  let worst = 0;
  console.log('anim           dir  uniq  steps  min    median  max    % of sprite');
  console.log('-------------  ---  ----  -----  -----  ------  -----  -----------');

  for (const [dir, order] of pairs) {
    for (const animName of order) {
      const anim = DIR_ANIMATIONS[animName];

      // Render each unique frame once, then walk the PLAYED sequence — which
      // is the thing the viewer sees, and is not the same as the frame list.
      const rendered = anim.frames.map((_, f) => {
        const { buf, whiskers } = renderFrame(dir, animName, f, atlas, breed);
        return finishFrame(buf.slice(), whiskers);
      });

      const steps = [];
      for (let i = 0; i < anim.sequence.length; i++) {
        const a = rendered[anim.sequence[i]];
        const b = rendered[anim.sequence[(i + 1) % anim.sequence.length]];
        steps.push(delta(a, b));
      }

      const moving = steps.filter((s) => s > 0);
      const sorted = [...steps].sort((x, y) => x - y);
      const median = sorted[Math.floor(sorted.length / 2)];
      const max = Math.max(...steps);
      const pixels = filled(rendered[0]);

      const uniq = new Set(rendered.map((f) => f.join(','))).size;
      const flag = max < INVISIBLE ? '  ← barely moves' : uniq < anim.frames.length ? '  ← duplicate frames' : '';
      if (max < INVISIBLE || uniq < anim.frames.length) worst++;

      console.log(
        `${animName.padEnd(13)}  ${dir.padEnd(3)}  ${String(uniq).padStart(4)}  ` +
          `${String(moving.length).padStart(5)}  ${String(Math.min(...steps)).padStart(5)}  ` +
          `${String(median).padStart(6)}  ${String(max).padStart(5)}  ` +
          `${((100 * max) / pixels).toFixed(1).padStart(11)}${flag}`,
      );
    }
  }

  console.log('');
  console.log(
    worst
      ? `⚠ ${worst} animation(s) either barely move or ship duplicate frames.`
      : '✓ every animation moves, and every authored frame is distinct.',
  );
  return worst;
}

process.exitCode = main() ? 1 : 0;
