# Task: 8-direction part-based cat animation system

You are working in `G:\Projects\SnapaCat`, a React Native 0.85 + TypeScript app.
Read this whole brief before writing code. It contains constraints that are not
obvious from the codebase and that will waste your time if you discover them the
hard way.

---

## 1. What the project is

SnapaCat is a cosy Android-first game. Players photograph neighbourhood cats,
which are matched to one of 20 sprite breeds by colour extraction, and collect
them in a "Cat-a-log". Collected cats appear in "The Hood" — a single-screen
customisable environment that is where players spend most of their time.

Up to 6 cat sprites render in the Hood at once. Today they are static poses
(sit / sleep) facing the camera. The goal of this task is to make them able to
face 8 directions and eventually roam.

## 2. Hard constraints — do not violate these

These are architectural invariants, some declared in `CLAUDE.md`:

1. **Sprites are 32x32 source pixels.** Shipped upscaled 4x (128px per frame).
2. **NEVER rotate a part.** At this resolution a cat's leg is ~3px wide.
   Rotation resamples, and there is nothing to resample — the result is mush.
   Animation happens by **translating parts on integer pixel offsets** and
   swapping between a small number of authored part variants. This is the same
   technique the Pokémon Mystery Dungeon sprite format uses; its `-Offsets.png`
   sheets encode exactly these per-frame anchor points.
3. **No new dependencies.** The existing pipeline encodes PNGs with a ~80-line
   zero-dependency encoder over `node:zlib` (`scripts/sprites/png.js`). Keep it
   that way. No sharp, no canvas, no image libraries.
4. **Parts are authored in semantic SLOTS, never literal colours.** See
   `scripts/sprites/slots.js` — `COAT_BASE`, `COAT_DARK`, `PATTERN`, `WHITE`,
   `EYE`, etc. A slot buffer plus a breed palette produces a finished sprite.
   This indirection is the entire reason one rig serves 20 breeds. If you emit
   RGB directly, palette swapping and pattern masks stop working.
5. **Max 6 simultaneous cat sprites.** `MAX_HOOD_CATS` in
   `src/utils/spawnCalculator.ts`.
6. **No generative AI at runtime, no GPS.** Not relevant to this task, but do
   not add either.

## 3. Current state — read these files first

```
scripts/sprites/
  build.js       orchestrator: reads breeds, composes sheets, writes PNGs + manifest
  rig.js         the WORKING whole-frame rig (sit + sleep), hand-authored span tables
  slots.js       slot table + per-breed palette role inference
  patterns.js    coat pattern painters (tabby, tortie, pointed, smoke, bicolor...)
  png.js         zero-dep PNG encoder + nearest-neighbour upscale
  dump.js        prints a frame's slot buffer as characters — USE THIS, see §7
  directions.js  8-way direction tables            <-- SCAFFOLDED, INERT
  parts.js       part cell geometry + placeholder art  <-- SCAFFOLDED, INERT
  README.md      pipeline documentation
```

`directions.js` and `parts.js` were written as scaffolding and **nothing imports
them** except `parts.js` importing `directions.js`. `build.js` does not know they
exist. They are a starting point, not a contract — restructure them freely if you
have a better design, but keep the invariants in §2.

What already works and must keep working:

- `npm run sprites` regenerates 20 breed sheets (6 frames each, 768x128) plus a
  template, palette, contact sheet and animation strip into `src/assets/sprites/`.
- The whole-frame rig scores 8/10 as placeholder art from an expert review. It is
  the current shipping art. **Do not degrade or replace it.**

Already decided, so you do not need to re-derive it:

- 8 directions = **5 authored** (S, SE, E, NE, N) + **3 mirrored** (SW←SE, W←E,
  NW←NE). Nothing about a cat is chiral at 32px. This is a 37.5% saving before a
  pixel is drawn.
- Draw order flips as the cat turns: facing the viewer the head reads on top;
  facing away the tail comes forward and the head tucks behind the shoulders.
  `DRAW_ORDER` in `directions.js` has a first pass at this.
- Leg names in the part tables are from the CAT's perspective, so "front left" is
  the far leg once it has turned around.

## 4. What to build

### 4a. Animation format (data, not code)

A representation where an animation is a list of frames, and each frame is a set
of per-part `[dx, dy]` integer offsets plus an optional part-variant index.
Adding a new animation should mean writing a table, not drawing 8 new sheets.

Animations to support at minimum: `idle`, `sleep`, `walk`. `walk` is the one that
proves the format — it needs alternating leg positions across 4+ frames in 8
directions.

Design it so per-rarity animation unlocks are possible later (a legendary cat
unlocking a stretch-and-yawn should be a data row, not an art commission).

### 4b. Compositor

`parts + direction + animation frame -> 32x32 slot buffer`, identical in shape to
what `rig.js` currently produces. This is important: the existing pattern
painters (`applyPattern`) and palette resolution (`resolvePalette`) must run on
the composited buffer unchanged, so all 20 breeds come out for free.

Mirrored directions must mirror the part cell AND remap its anchor.

### 4c. Build integration

`npm run sprites` should additionally emit the 8-direction sheets and extend the
generated manifest at `src/assets/sprites/index.ts`.

**Acceptance criterion:** the 20 existing whole-frame breed PNGs must be
**byte-identical** after your change. `git status` should show them unmodified.
This is the guard that you have added a path rather than disturbed one.

### 4d. HTML preview harness

A single self-contained `.html` file (inline CSS/JS, no CDN, no build step) that
loads the generated sheets and plays the animations, with controls to switch
direction, animation and breed. 8-way work cannot be judged from a static contact
sheet — it has to be watched.

This is the highest-value deliverable for review. Prioritise it.

### 4e. Contact sheet

Extend the existing contact-sheet output to show all 8 directions of one breed,
for visual QA.

### 4f. Stretch: better placeholder parts

The parts in `parts.js` are crude procedural shapes I wrote as a placeholder.
Improving them is welcome but is the LAST priority — the format, compositor,
build integration and preview harness matter more. Hand-authored per-row span
tables (as `rig.js` uses) beat ellipse maths; an ellipse cannot give you a neck,
and its widest-row-only artifact leaves 1px shelves that sparkle at 4x.

## 5. Do NOT touch

This repo has parallel work happening in the app layer. Staying out of these
prevents conflicts:

- **Anything in `src/` except `src/assets/sprites/`** (which is generated output)
- `src/services/dbService.ts`, `App.tsx`, `src/screens/`, `src/hooks/`,
  `src/components/`
- `CLAUDE.md` — it declares the Firestore schema as the project's source of truth
  and is the owner's document
- `Reference/` — third-party PMD sprite sheets, gitignored, Nintendo-derived.
  Study the format if useful; do not copy, derive from, or ship any of it

You may read anything. Additive changes to `build.js` are expected.

## 6. Verify before you report done

```bash
node scripts/sprites/build.js     # must succeed
npx tsc --noEmit                  # must be clean
npx jest                          # 141 tests, 9 suites, all passing
git status --short                # existing breed PNGs must be UNMODIFIED
```

The build already asserts every frame leaves a transparent margin (frames are
packed with no gutter, and the slack is exactly one source pixel). If your
composited parts widen a pose into its neighbour, the build will fail with a
message naming the frame — that is intentional.

## 7. How to work on this — the part that actually matters

**Measure, do not squint.** Every real defect in this pipeline was found by
dumping data structures, and every one was invisible in the rendered PNG:

- A palette-role heuristic silently swallowed nine warm colours, so calico
  rendered as a black-and-white tuxedo. Found by printing resolved palettes.
- The outline pass eroded the silhouette instead of dilating it, deleting 97% of
  the highlight pass. Found by counting slot histograms — 13 lit pixels out of
  483.
- A de-speckle pass was deleting the authored features it ran after. Found by
  diffing an authored span table against the rendered buffer.

`scripts/sprites/dump.js` prints a frame's slot buffer as characters with a
column ruler and a slot histogram:

```bash
node scripts/sprites/dump.js 0            # sit rest frame
node scripts/sprites/dump.js 3 --outline  # sleep, with the outline pass applied
```

Extend it for parts. Use it constantly. When something looks wrong, dump it and
read the pixels rather than adjusting numbers until the picture changes.

Two specific traps that have already cost time here:

- **Symmetry.** Compute from distance-to-centreline (`Math.abs(x - 15.5)`), not
  from raw `x`. A stripe function using `Math.sign(x - 15.5)` flipped phase
  across the spine and left 36% of mirrored pixel pairs disagreeing.
- **1px diagonal lines are not 4-connected.** A separator stepping one pixel per
  row renders as detached dots, not a line. Bridge each step horizontally.

## 8. Deliverable

A working `npm run sprites` that emits 8-direction animated sheets alongside the
existing ones, plus the HTML preview harness. Report what you changed, what you
verified, and anything you found that contradicts this brief — the brief was
written from memory and may be wrong somewhere.
