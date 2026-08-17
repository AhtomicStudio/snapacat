/**
 * Animation data tables.
 *
 * An animation is a list of UNIQUE frames plus a playback sequence and per-frame
 * durations. Each frame specifies per-part offsets (dx, dy) and an optional
 * variant index (v). Unmentioned parts default to { dx: 0, dy: 0, v: 0 }.
 *
 * The format is direction-independent: the compositor selects the correct part
 * cell per direction and mirrors derived directions automatically. This means
 * adding a new animation is a data table addition — no new art required.
 *
 * Per-rarity animation unlocks are supported via the `rarity` field. The runtime
 * checks whether a cat's rarity qualifies before offering the animation.
 *
 * Body variants:
 *   0 = resting   (normal ribcage)
 *   1 = mid-breath (ribcage widened 1px each side on 3 rows)
 *   2 = peak-breath (widened on 5 rows)
 *
 * Head variants:
 *   0 = eyes open  (normal)
 *   1 = eyes closed (for sleep/doze)
 */

const DIR_ANIMATIONS = {
  idle: {
    /** Unique frames laid out in the sheet. */
    frames: [
      // Frame 0: rest
      {},
      // Frame 1: mid breath
      { body: { v: 1 } },
      // Frame 2: peak breath
      { body: { v: 2 } },
    ],
    /** Index into frames[], looping. Reuses frame 1 for the down-beat. */
    sequence: [0, 1, 2, 1],
    /** Per-sequence-step hold time in ms. Asymmetric timings carry the ease. */
    durations: [560, 130, 420, 130],
  },

  walk: {
    frames: [
      // Frame 0: left contact — FL+BR plant, FR+BL lift
      {
        legFL: { dy: 1 }, legBR: { dy: 1 },
        legFR: { dy: -1 }, legBL: { dy: -1 },
        tail: { dx: 1 },
      },
      // Frame 1: left passing — body+head bob up
      {
        body: { dy: -1 }, head: { dy: -1 },
        tail: { dx: -1 },
      },
      // Frame 2: right contact — FR+BL plant, FL+BR lift
      {
        legFR: { dy: 1 }, legBL: { dy: 1 },
        legFL: { dy: -1 }, legBR: { dy: -1 },
        tail: { dx: -1 },
      },
      // Frame 3: right passing — body+head bob up
      {
        body: { dy: -1 }, head: { dy: -1 },
        tail: { dx: 1 },
      },
    ],
    sequence: [0, 1, 2, 3],
    durations: [180, 140, 180, 140],
  },

  sleep: {
    /**
     * Dozing while sitting: same posture as idle but with closed eyes (head
     * variant 1) and a slower breathing rhythm. A proper lying-down sleep is
     * a future animation — the format supports it via larger dy offsets and a
     * lying body variant, but the part art doesn't need to exist yet.
     */
    frames: [
      // Frame 0: doze rest
      { head: { v: 1 } },
      // Frame 1: doze mid breath
      { head: { v: 1 }, body: { v: 1 } },
      // Frame 2: doze peak breath
      { head: { v: 1 }, body: { v: 2 } },
    ],
    sequence: [0, 1, 2, 1],
    durations: [1400, 220, 700, 220],
  },

  // ── Stretch: per-rarity animation unlock example ─────────────────────
  // stretch: {
  //   rarity: 'legendary',
  //   frames: [...],
  //   sequence: [...],
  //   durations: [...],
  // },
};

/** Animation names in the order they appear as column groups in the sheet. */
const ANIM_ORDER = ['idle', 'walk', 'sleep'];

/**
 * Returns the column offset where each animation starts in the sheet row,
 * and the total column count.
 */
function sheetLayout() {
  let col = 0;
  const layout = {};
  for (const name of ANIM_ORDER) {
    const anim = DIR_ANIMATIONS[name];
    layout[name] = { startCol: col, frameCount: anim.frames.length };
    col += anim.frames.length;
  }
  return { layout, totalCols: col };
}

module.exports = { DIR_ANIMATIONS, ANIM_ORDER, sheetLayout };
