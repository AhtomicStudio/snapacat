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
   * - **Horizontal travel, as a SWING and not a slide.** The legs used to
   *   translate whole on dx ±2, which detaches the top of the leg from the
   *   hip: four pegs sliding under a torso that never moves, and at
   *   contact the pairs bunch into two clusters 4px apart, which is an
   *   insect\u2019s stance rather than a cat\u2019s. `swing` ramps the offset down
   *   the leg instead, so the hip stays where it is joined and the paw
   *   carries the stride. ±3 was tried first and reads as a lunge — the
   *   front and hind paws end up six pixels apart and the cat is doing the
   *   splits. ±2 front, ±1 hind is a toddle, which is what we want.
   * - **The front pair reaches further than the hind pair.** Equal travel
   *   front and back is what makes a four-legged walk look mechanical; a
   *   cat reaches with the front and drives with the back.
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
      // Frame 0: left contact — FL reaches forward, BR planted under the
      // hip and driving; the right pair is lifted and swung back.
      {
        legFL: { swing: 2, dy: 0 }, legBR: { swing: 1, dy: 0 },
        legFR: { swing: -2, dy: -1 }, legBL: { swing: -1, dy: -1 },
        body: { dy: 0 }, head: { dy: 0 }, tail: { dx: 1, dy: 0 },
      },
      // Frame 1: left passing — body up, lifted pair at full clearance and
      // hanging straight below the hip as it swings through.
      {
        legFL: { swing: 0, dy: 0 }, legBR: { swing: 0, dy: 0 },
        legFR: { swing: 0, dy: -2 }, legBL: { swing: 0, dy: -2 },
        body: { dy: -1 }, head: { dy: -1 }, tail: { dx: 0, dy: 0 },
      },
      // Frame 2: right contact — the mirror of frame 0. The tail is a frame
      // behind the body here, which is where the follow-through lives.
      {
        legFR: { swing: 2, dy: 0 }, legBL: { swing: 1, dy: 0 },
        legFL: { swing: -2, dy: -1 }, legBR: { swing: -1, dy: -1 },
        body: { dy: 0 }, head: { dy: 0 }, tail: { dx: -1, dy: -1 },
      },
      // Frame 3: right passing.
      {
        legFR: { swing: 0, dy: 0 }, legBL: { swing: 0, dy: 0 },
        legFL: { swing: 0, dy: -2 }, legBR: { swing: 0, dy: -2 },
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
    /**
     * Only the HEAD settles. Dropping the body a pixel pushed its bottom row to
     * y31 — the last row of the frame — so applyOutline had nowhere to draw the
     * bottom keyline and all 24 sleep frames rendered flush against the border
     * with a flat cut where every other pose has a contour.
     *
     * This is the same mistake the walk table already documents: dy:+1 on
     * something already resting on the ground line does not settle it, it
     * clips it. A head sinking into the shoulders is the readable cue anyway.
     */
    frames: [
      // Frame 0: doze rest — head settled into the shoulders
      { head: { v: 1, dy: 1 }, body: {} },
      // Frame 1: doze mid breath
      { head: { v: 1, dy: 1 }, body: { v: 1 } },
      // Frame 2: doze peak breath
      { head: { v: 1, dy: 1 }, body: { v: 2 } },
    ],
    sequence: [0, 1, 2, 1],
    durations: [1400, 220, 700, 220],
  },

  // ─────────────────────────────────────────────────────────────────────
  // Flavour idles
  //
  // A cat looping one four-frame breath forever reads as a texture. A cat that
  // occasionally blinks, grooms, yawns or flicks an ear reads as alive, and it
  // is the highest-value thing available here because it needs no new tech —
  // only more part variants and a scheduler to pick between these.
  //
  // Every one of them STARTS AND ENDS AT REST, and that is load-bearing. The
  // runtime switches between whole animations rather than splicing frames, so
  // if two neighbouring loops did not share a resting pose the switch would pop
  // — which is the same class of bug as the sit-to-walk pop the pipeline doc
  // warns about, arriving through a different door.
  //
  // They also carry the breathing through wherever there is room. A cat that
  // stops breathing to blink is a cat that stops being alive for 240ms.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Blink. Two lids on the way down, two on the way up.
   *
   * Going straight from eyes-open to eyes-shut and back is a one-frame pop that
   * reads as a glitch rather than a blink; the squint frame either side is what
   * buys the motion. The timings are deliberately lopsided — a real blink shuts
   * fast and opens slower.
   */
  blink: {
    frames: [
      {},
      { body: { v: 1 } },
      { body: { v: 2 } },
      // The lid frames keep the chest where the breath had it. Dropping back to
      // body v0 for the blink deflated the ribcage at the exact instant the eye
      // closed — a 12px chest movement wrapped around a 6px eye movement, which
      // is why the measured "blink" delta was mostly not the blink.
      { head: { v: 2 }, body: { v: 1 } },   // squint
      { head: { v: 1 }, body: { v: 1 } },   // shut
    ],
    // Ends on frame 1, not frame 0. Returning to rest the instant the eye
    // reopens put the chest's 13px deflation on exactly the frame the lids
    // lift — which is the same coupling that used to sit on the way IN, just
    // moved to the other end. Ending mid-breath lets the two events separate.
    sequence: [0, 1, 2, 1, 3, 4, 3, 1, 2, 1, 0, 1],
    durations: [560, 130, 420, 130, 60, 110, 90, 130, 420, 130, 460, 130],
  },

  /**
   * Groom. The head dips to the chest, licks twice, and comes back up.
   *
   * Deliberately no raised paw. A front-facing cat has its forelegs tucked
   * under the torso at this size — lifting one to the face would mean authoring
   * a leg that is three pixels wide and travels eleven rows, and the result
   * reads as a flipper. Washing the chest needs no new limb art and is just as
   * legible, which is the better trade at 32px.
   *
   * Eyes close on the way DOWN, a frame before the tongue appears. Closing them
   * on arrival makes the head look like it switched off; closing them early is
   * the anticipation that makes the dip look intended.
   */
  groom: {
    frames: [
      {},
      { head: { v: 1, dy: 1 } },            // shut, starting down
      { head: { v: 4, dy: 3 }, body: { v: 1 } },  // lick, at the chest
      { head: { v: 4, dy: 2 } },            // the stroke
    ],
    sequence: [0, 1, 2, 3, 2, 3, 2, 1, 0],
    durations: [700, 90, 170, 130, 150, 130, 210, 110, 820],
  },

  /**
   * Yawn. Head tips back, jaw drops, settles.
   *
   * The chest takes its peak-breath variant on the gape frame, because a yawn
   * is an inhale — holding the ribcage still through one makes the whole thing
   * read as a silent scream. The long hold on the open mouth is the joke.
   */
  yawn: {
    frames: [
      {},
      { head: { v: 2, dy: -1 } },                 // squint, tipping back
      { head: { v: 3, dy: -1 }, body: { v: 2 } }, // gape
      { head: { v: 2 } },                          // settling
    ],
    // A yawn opens slowly and snaps shut. The previous table moved at the same
    // rate in both directions (0.82 px/ms opening, 0.88 closing), which reads
    // as a mouth being operated rather than a jaw letting go.
    sequence: [0, 1, 2, 3, 0],
    durations: [900, 300, 540, 120, 900],
  },

  /**
   * Look around. A glance one way with an ear flick, then the other way.
   *
   * dx 2, not 1: at 32px a single pixel of head travel disappears into the
   * keyline. The neck stub spans six pixels against an eleven-pixel shoulder,
   * so a 2px shift stays well inside the joint and the head cannot detach.
   */
  look: {
    frames: [
      {},
      { head: { dx: 2 }, body: { v: 1 } },
      { head: { v: 5, dx: 2 }, body: { v: 1 } },  // ear flick, mid-glance
      // v1, not v2. The idle cycle is 0-1-2-1 precisely so the chest never
      // changes breath level by more than one step; a v0 frame next to a v2
      // frame un-widens five rows at once inside a single 320ms beat, which
      // reads as a catch of breath rather than a breath.
      { head: { dx: -2 }, body: { v: 1 } },
    ],
    sequence: [0, 1, 2, 1, 0, 3, 0],
    durations: [680, 260, 180, 200, 320, 440, 700],
  },

  /**
   * Tail flick. Out, back, out again, settle.
   *
   * The bend lives in the part art rather than in a dx — see buildTail_S. A
   * whole-part translation would slide the root off the hip and open a gap the
   * outline pass is one pixel short of closing.
   */
  tailflick: {
    frames: [
      {},
      { tail: { v: 1 }, body: { v: 1 } },
      // v1 both sides, for the same reason as `look` — a v0 to v2 step is two
      // breath levels at once.
      { tail: { v: 2 }, body: { v: 1 } },
    ],
    // Slower than a flick, because a settled cat's tail swishes rather than
    // twitches. The previous table ran out-in-out at about 3.3Hz, which reads
    // as agitation; a contented cat is nearer 1Hz with more travel in it.
    sequence: [0, 1, 0, 2, 0],
    durations: [760, 320, 240, 320, 820],
  },

  // ─────────────────────────────────────────────────────────────────────
  // Object interactions
  //
  // What a cat does AT the thing you put down. The flavour idles above are
  // what a cat does anywhere; these are the ones that only make sense
  // beside a bowl, a toy or a bed, and they are the payoff for placing an
  // item at all — before them, a cat at a food bowl and a cat on bare
  // ground were doing identical things.
  //
  // Composed from the parts that already exist rather than from new art.
  // The head has a lick variant and a squint, the legs take an offset, and
  // between them that is enough for eating, batting and sniffing. Authoring
  // new head cells would have been the obvious move and the wrong one: it
  // multiplies across 20 breeds and 6 variants for poses the player sees at
  // 44 points.
  //
  // Same contract as the flavour idles: start and end at rest, and keep
  // breathing through the middle.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Eating. The head goes down to the bowl and the jaw works.
   *
   * The dip is two pixels and no more. Three put the muzzle through the
   * chest — the head is anchored above a torso that does not move, so a
   * deep dip does not lower the head so much as bury it.
   */
  eat: {
    frames: [
      {},
      { head: { dy: 1, v: 2 }, body: { v: 1 } },
      { head: { dy: 2, v: 4 }, body: { v: 1 } },
      { head: { dy: 2, v: 2 }, body: { v: 2 } },
    ],
    sequence: [0, 1, 2, 3, 2, 3, 2, 1, 0],
    durations: [520, 120, 260, 200, 220, 200, 260, 130, 620],
  },

  /**
   * Batting at something — the toy animation.
   *
   * A forepaw comes up and bats, twice.
   *
   * This is the one interaction that needed new art. Offsetting the
   * standing leg hides it behind the chest; shearing it sideways buys
   * three visible pixels. The pose is a dedicated leg cell instead —
   * LEG_V.RAISED in parts.js, which explains the geometry. Here the leg
   * just alternates between the two cells while the cat keeps breathing,
   * and the ear flick on the last beat stops the loop reading as a
   * two-frame toggle.
   */
  paw: {
    frames: [
      {},
      { legFL: { v: 1 }, body: { v: 1 } },
      { body: { v: 2 } },
      { legFL: { v: 1 }, head: { v: 5 }, body: { v: 1 } },
    ],
    sequence: [0, 1, 2, 3, 2, 1, 0],
    durations: [620, 150, 130, 160, 130, 150, 660],
  },

  /**
   * Sniffing. Head forward, ears working.
   *
   * The quietest of the three on purpose: it is the one that fits anything
   * you can put down, so it is the one that will play most often, and a big
   * gesture at that frequency becomes wallpaper. The ear flick carries it.
   */
  sniff: {
    frames: [
      {},
      { head: { dy: 1 }, body: { v: 1 } },
      { head: { dy: 2, v: 5 }, body: { v: 1 } },
    ],
    sequence: [0, 1, 2, 1, 2, 1, 0],
    durations: [620, 140, 120, 120, 120, 160, 660],
  },
};

/**
 * Animations on the 8-direction sheet: locomotion and the states a cat can be
 * in while facing any way.
 *
 * This list is the expensive one. The directional sheet is 8 rows tall, so each
 * column added here costs 8 frames per breed across 20 breeds — a 32px frame at
 * 4x is 128px square, so ten columns is already a 1280x1024 texture, and six of
 * those resident is most of a mid-range device's bitmap budget. Flavour idles
 * stay off it for that reason alone.
 */
/**
 * `sleep` is NOT here, and that is worth three columns of explanation.
 *
 * It used to be, and nothing ever rendered it: useCatLife routes a dozing cat
 * to `{ kind: 'settled', animation: 'sleep' }`, which reads the action sheet,
 * and the only other sleep call site is ApartmentCanvas on the whole-frame
 * sheet. So three of this sheet's ten columns were decoded on every Hood and
 * displayed on none — 1.5MB per breed, 9MB at the six-cat cap, on the one
 * texture this whole two-sheet split exists to keep small.
 *
 * It was also the worst place for it. A sleeping cat facing away has no eyes
 * to close, so N, NE and NW differed from their idle frames by 17-20 pixels of
 * skull outline moving one row — you could not tell a sleeping cat from an
 * awake one. Front-facing, on the action sheet, the closed eyes do the work.
 */
const ANIM_ORDER = ['idle', 'walk'];

/**
 * Animations on the single-row action sheet, rendered front-facing only.
 *
 * WHY THIS SHEET EXISTS
 *
 * Flavour idles play on a cat that has settled somewhere, and a settled cat in
 * the Hood faces the player — that is already how the scene reads and it is the
 * friendliest pose for a cosy game. So they need exactly one direction, which
 * makes them an eighth the cost of anything on the directional sheet: all six
 * of these together come to roughly 1.5MB per breed where a single extra
 * directional column is 0.5MB.
 *
 * `idle` and `sleep` appear on both sheets on purpose. It means a settled cat
 * never has to touch the directional sheet, so the two are independently
 * loadable and a Hood full of dozing cats never decodes the expensive one at
 * all — which is the common case after dark, when half the Hood is asleep.
 */
const ACT_ORDER = [
  'idle', 'blink', 'groom', 'yawn', 'look', 'tailflick', 'sleep',
  // Object interactions — see the block above.
  'eat', 'paw', 'sniff',
];

/**
 * Returns the column offset where each animation starts in the sheet row,
 * and the total column count.
 */
/**
 * Where each animation sits on its sheet.
 *
 * `maxCols` wraps the strip into bands. It exists because a single row
 * has a hard ceiling: the action sheet was 26 frames at 128px, which is
 * a 3328px texture — already past the 2048 that GLES2 guarantees, and
 * adding the object-interaction animations would have pushed it past
 * 4096 too. Wrapping costs nothing at runtime because an animation is
 * never split across bands: the row stays constant for the whole of one
 * animation, so the renderer selects it with a static offset and only
 * the column is animated.
 */
function sheetLayout(order = ANIM_ORDER, maxCols = Infinity) {
  const layout = {};
  let row = 0;
  let col = 0;
  let widest = 0;
  for (const name of order) {
    const anim = DIR_ANIMATIONS[name];
    const count = anim.frames.length;
    if (col > 0 && col + count > maxCols) {
      row += 1;
      col = 0;
    }
    layout[name] = { startCol: col, frameCount: count, row };
    col += count;
    if (col > widest) widest = col;
  }
  return { layout, totalCols: widest, rows: row + 1 };
}

/**
 * Band width for the action sheet. Fourteen keeps the texture at 1792px
 * with room for several more animations before it needs another band.
 */
const ACT_MAX_COLS = 14;

module.exports = { DIR_ANIMATIONS, ANIM_ORDER, ACT_ORDER, ACT_MAX_COLS, sheetLayout };
