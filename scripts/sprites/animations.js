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

  /**
   * Diagonal-pair walk: FL+BR swing together, then FR+BL.
   *
   * The previous table moved legs on dy ONLY, so there was no stride, no reach
   * and no push — measured, the two passing frames in NE were byte-identical
   * and the two contact frames differed by 2 pixels out of 335. Four frames of
   * walk delivered about one pose.
   *
   * Three things make this read as walking rather than jittering:
   *
   * - **Horizontal travel.** dx ±2 is the minimum that registers at 32px; ±1
   *   disappears into the outline.
   * - **The body sits DOWN on contact and rises on passing.** That is the
   *   weight. Note contact legs use dy 0, not +1 — pushing the planted foot
   *   down put it on row y31, which is where the ground shadow lives.
   * - **The head rides WITH the body; the tail carries the follow-through.**
   *   Delaying the head by a frame does not produce lag — against a period-2
   *   body bob it produces antiphase, a 2px relative excursion every ~160ms
   *   that reads as a pigeon nod. Worse, lifting the head off a joint owned by
   *   the torso opened a gap on 12 of 80 frames. The tail has the length to
   *   carry a lag and no joint to break.
   */
  walk: {
    frames: [
      // Frame 0: left contact — FL+BR planted forward, FR+BL lifted and back.
      {
        legFL: { dx: 2, dy: 0 }, legBR: { dx: 2, dy: 0 },
        legFR: { dx: -2, dy: -1 }, legBL: { dx: -2, dy: -1 },
        body: { dy: 0 }, head: { dy: 0 }, tail: { dx: 1, dy: 0 },
      },
      // Frame 1: left passing — body up, lifted pair at full clearance.
      {
        legFL: { dx: 0, dy: 0 }, legBR: { dx: 0, dy: 0 },
        legFR: { dx: 0, dy: -2 }, legBL: { dx: 0, dy: -2 },
        body: { dy: -1 }, head: { dy: -1 }, tail: { dx: 0, dy: 0 },
      },
      // Frame 2: right contact — the mirror of frame 0. The tail is a frame
      // behind the body here, which is where the follow-through lives.
      {
        legFR: { dx: 2, dy: 0 }, legBL: { dx: 2, dy: 0 },
        legFL: { dx: -2, dy: -1 }, legBR: { dx: -2, dy: -1 },
        body: { dy: 0 }, head: { dy: 0 }, tail: { dx: -1, dy: -1 },
      },
      // Frame 3: right passing.
      {
        legFR: { dx: 0, dy: 0 }, legBL: { dx: 0, dy: 0 },
        legFL: { dx: 0, dy: -2 }, legBR: { dx: 0, dy: -2 },
        body: { dy: -1 }, head: { dy: -1 }, tail: { dx: 0, dy: -1 },
      },
    ],
    sequence: [0, 1, 2, 3],
    durations: [180, 140, 180, 140],
  },

  sleep: {
    /**
     * Dozing while sitting: closed eyes, a settled posture, and a slower
     * breathing rhythm. A proper lying-down sleep is a future animation — the
     * format supports it via larger dy offsets and a lying body variant, but
     * the part art doesn't need to exist yet.
     *
     * The head and body settle by a pixel, which is not decoration. Closed eyes
     * are the only thing distinguishing sleep from idle, and the rear-facing
     * heads have no eyes to close — so N, NE and NW rendered sleep frames that
     * were byte-identical to idle. Nine of the sheet's eighty frames were
     * duplicates, and a sleeping cat facing away looked exactly like an awake
     * one. With six cats on screen and state readability as the core loop,
     * that is a gameplay bug wearing an art costume.
     */
    frames: [
      // Frame 0: doze rest — settled a pixel lower than idle
      { head: { v: 1, dy: 1 }, body: { dy: 1 } },
      // Frame 1: doze mid breath
      { head: { v: 1, dy: 1 }, body: { v: 1, dy: 1 } },
      // Frame 2: doze peak breath
      { head: { v: 1, dy: 1 }, body: { v: 2, dy: 1 } },
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
