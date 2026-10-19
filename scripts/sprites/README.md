# Cat sprite pipeline

One rig → 20 breeds. Geometry is authored once; markings and palette are
generated per breed.

```bash
npm run sprites
```

Outputs to `src/assets/sprites/`:

| File | Purpose |
|---|---|
| `<breed_id>.png` | Whole-frame sheet — 6 frames, the hand-authored sit and sleep poses |
| `<breed_id>_dir.png` | Directional sheet — 7 columns × 8 facings, idle and walk |
| `<breed_id>_act.png` | Action sheet — 26 columns × 1 facing, the flavour idles and sleep |
| `index.ts` | Generated manifest (Metro needs static `require()`s) |
| `template/rig_1x.png` | The bare rig at authoring resolution |
| `template/rig_8x.png` | Same, enlarged for review |
| `template/anim_8x.png` | All 6 frames with a real breed palette |
| `template/contact.png` | All 20 breeds side by side — visual QA |
| `template/contact_dir.png` | All 8 facings of one breed |
| `template/palette.png` | Slot swatches, in slot order |
| `template/snapacat-slots.gpl` | Aseprite/GIMP palette file |

`template/` is a review and authoring aid. Only the breed PNGs and `index.ts`
are bundled into the app.

### Why three sheets

They cost wildly different amounts, and the split is the single biggest memory
decision in the Hood.

A directional sheet is eight rows tall, so every column added to it costs eight
128px frames per breed, and the scene can have six distinct breeds on screen at
once. Putting the six flavour idles on it as well would have taken it past 13MB
a breed, or about 80MB resident, which is most of a mid-range device's bitmap
budget.

The flavour idles do not need eight directions. A cat that is grooming is a cat
that has settled, and a settled cat in the Hood faces the player. So they live
on their own one-row sheet, and `idle` and `sleep` are duplicated onto it so a
cat that never moves never decodes the expensive texture at all.

| Sheet | Used when | Decoded size |
|---|---|---|
| `_act` | the cat is settled — idling, grooming, dozing | 1.7MB |
| `_dir` | the cat is walking between spots in its zone | 3.5MB |
| whole-frame | Cat-a-log rows, portraits, the reveal screen | 0.4MB |

**Only put an animation on the directional sheet if something renders it in
more than one facing.** `sleep` was on it for a while and nothing ever asked
for it — a dozing cat is routed to the action sheet — so three of ten columns
were decoded on every Hood and displayed on none: 1.5MB per breed, 9MB at the
six-cat cap, on the one texture this whole split exists to keep small. It was
also the worst place for it, because a cat facing away has no eyes to close and
those frames differed from idle by about twenty pixels of outline.

## How it works

```
whole-frame:  rig slot buffer ─┐
                   (rig.js)    │
                               ├→ pattern mask → outline + whiskers → palette → PNG
composed:     part atlas ──────┘   (patterns.js)      (rig.js)      (slots.js)  (png.js)
              (parts.js → compositor.js, posed by poses.js)
```

The rig is authored in **semantic slots**, never literal colours — `COAT_BASE`,
`PATTERN`, `WHITE`, `EYE` and so on (full table at the top of `slots.js`). A slot
buffer plus a breed's palette produces a finished sprite. That indirection is
the entire reason one rig can serve every breed.

Breed definitions are read out of `src/utils/spriteLibrary.ts` at build time, so
palettes have exactly one home. If that file's shape changes the build fails
loudly rather than silently dropping breeds.

### Markings need to know which way the cat is facing

`patterns.js` was written against the sit pose and encoded it as raw screen
coordinates: mackerel bars indexed off `|x - 15.5|`, the tortie face split at
`x >= 16`, the colourpoint muzzle an ellipse at (15.5, 16). Every one of those
is a statement about a cat facing the camera, and every one is false in profile
— the spine is horizontal there, so bars indexed by distance-from-centre stop
following the body and band across it. The profile frames read as wood grain.

`poses.js` publishes the body frame per direction — where the spine runs, which
way the stripes fall, where the face is — and `compositor.js` swaps it alongside
`REGIONS` for the frame it is rendering. The sit pose is the default and is a
byte-exact transcription of what the painters used to hard-code, so the
whole-frame sheets are unchanged by the indirection.

Mirrored directions (NW, W, SW) are patterned on an **already-flipped** buffer,
so the pose is flipped too. Without that a west-facing cat gets its muzzle
markings on its tail.

### Order matters

Outlining runs **after** pattern painting, so a keyline can take its colour from
whichever marking it borders rather than always deriving from the base coat.
Whiskers are stamped **after** outlining, or the dilation pass would thicken
them from 1px to 3px.

## Replacing the placeholder art

The rig in `rig.js` is deliberate but crude. It exists so the pipeline could be
built and shipped before any hand-drawn art existed. Two ways to replace it:

### Edit the rig in place

The silhouette is explicit per-row span tables — `HEAD_HALF`, `BODY`, `EAR`,
`TAIL`, and the sleep pose's `dome`/`head`/`ears`. Every number is a pixel
decision. Change a span, run `npm run sprites`, look at `template/rig_8x.png`.
The shading, outline and de-speckle passes are algorithmic on purpose: they stay
correct as you retune the profiles.

Features (eyes, muzzle, paws, whiskers) are placed at explicit coordinates
further down `poseSit` / `poseSleep`.

### Draw over the template

1. Open `template/rig_1x.png` in Aseprite — 6 frames, 32×32 each.
2. Load `template/snapacat-slots.gpl` as the palette.
3. Draw using **only** those colours. Each one maps back to a semantic slot, and
   that mapping is what lets 20 breeds come out of your one drawing.
4. Key slots: `COAT_BASE`/`COAT_DARK`/`COAT_LIGHT` are recoloured per breed.
   `PATTERN` is where markings land — leave it unused when drawing the base rig.
   `WHITE` is for spotting. `PINK`, `EYE` and `OUTLINE` are mostly constant.
5. Export as a horizontal strip and point the build at it.

Note that an importer for step 5 does not exist yet — the build currently only
consumes the procedural rig. Writing one is roughly 40 lines: decode the PNG,
match each pixel to the nearest template colour, emit a slot buffer.

## Adding a breed

Add it to `SPRITE_LIBRARY` in `src/utils/spriteLibrary.ts` and rerun the build.
Palettes are ordered **by area coverage in a photo**, not by semantic role —
`resolvePalette` in `slots.js` infers roles from the pattern plus colour
properties. If a new breed comes out wrong, that inference is where to look.

## Adding a pattern

Write a painter in `patterns.js` and register it in `applyPattern`. Painters
repaint coat pixels; they must never change the silhouette. Use the
`PATTERN_FOR` / `WHITE_FOR` maps rather than assigning `SLOT.PATTERN` directly,
so markings inherit the underlying shading band — a stripe crossing a lit
shoulder should not be the same value as one crossing a shadowed flank.

Use the `REGIONS` predicates from `rig.js` (`isEar`, `isTail`, `isPaw`,
`isMuzzle`, `isHead`) instead of raw coordinate thresholds. They're derived from
the same authored tables that draw the rig, so they stay correct when the
profiles move.

## Reviewing the art

Four tools, each answering a different question. They exist because every
geometry fix in this pipeline has come from a measurement rather than from
looking at a render.

```bash
npm run sprites:preview     # watch it move, in a browser
npm run sprites:motion      # does each animation actually move?
npm run sprites:separation  # can you tell two breeds apart?
npm run sprites:inspect     # render frames large, or as silhouettes
node scripts/sprites/dump.js --dir E   # which pixel is wrong
```

**`preview`** serves the repo and opens `preview.html`, which plays any
animation on any sheet across all eight facings, plus a row of six cats started
at staggered offsets — the Hood's cap, and the arrangement that makes "all six
are doing the same thing on the same frame" obvious. Its tables are generated
by the build into `preview-data.js`, so the page can never describe a sheet that
does not exist. It still works from `file://`; the server is there because
embedded viewers load local files without a filesystem base, and every relative
path then resolves to a blank sprite with no error.

**`motion`** reports the pixel delta between consecutive frames of each played
sequence. This catches the failure neither the verifier nor the eye can see: an
animation that does nothing. The walk cycle once shipped with its two passing
frames byte-identical and its contact frames two pixels apart — four frames
delivering one pose, with no warning and a contact sheet that looked fine.
Current numbers: walk moves 46–56% of the sprite, the flavour idles 28–38%,
breathing a deliberate 2.4%.

**`separation`** reports CIE76 ΔE between all 190 breed pairs, both per pixel
and after 4×4 block averaging. The Cat-a-log is a collection game, so two
breeds that read as the same animal are a gameplay bug wearing an art costume —
and this is not something you can eyeball, since each cat looks fine on its
own. Read BOTH numbers: a low mean with a high block score just means two cats
share an average colour and are still told apart by pattern. Only a pair under
the threshold on both is a collision. **Composite over a ground before
comparing** — averaging only the painted pixels ignores coverage and flatters
any two breeds with different silhouettes, which is how a set of measurements
once showed four collisions resolved when only one was.

**`inspect`** renders frames at any scale, and with `--silhouette` flattens them
to solid black. Use the silhouette first. Three rounds of prop work on this
project failed by adding interior detail to a shape that was already
unreadable, and the flattened view is the only one that makes that obvious — it
is what showed that the raised tails were making E and NE read as ducks.

**`dump`** prints a frame's slot buffer as characters, for when you know
something is wrong and need the coordinate.

`verify.js` runs inside the build and checks what ships: one connected
component, every part visible, the head attached, nothing on the frame border,
no enclosed holes surviving the outline pass. It is checked for the directional
animations in all eight facings and the action animations front-facing, which
is exactly the set that ends up in a sheet.

### Known breed collisions

**Gate on `block`, never on both.** CIE76 is a Euclidean distance, so averaging
a tile before measuring it can only shrink the distance: `block <= mean` holds
for 189 of 190 pairs. Combining them with `&&` therefore collapses to
`mean < T` and hides the pairs that look alike while differing in detail —
which is exactly the set worth catching. This file shipped with that bug and it
reported 6 collisions where the correct rule reports 17.

Seventeen pairs sit under 8 block ΔE. The burden is essentially what it was
before the 8-way work — the count moved because two pairs drifted just under a
hard threshold, not because anything got meaningfully worse:

| | before | now |
|---|---|---|
| pairs under 8 | 15 | 17 |
| worst pair | 4.71 | 4.69 |
| pairs under 6 | 4 | 4 |
| collision debt (Σ 8−block) | 20.1 | 20.4 |

Nearly all of it is **palette**, not geometry. Four of the five worst are the
grey cluster — `grey_mackerel_tabby`, `grey_tabby_white`, `grey_tuxedo` and
`solid_grey` all sit in one narrow value range, so no amount of pattern work
separates them. The clearest single fix is `lynx_point`, whose palette is
`['#EEE8D8', '#C4B090', '#806040']`: its "points" at `#C4B090` are barely
darker than its own `#EEE8D8` body, so it reads as an almost-uniform pale cat,
collides with `solid_white`, and has an outline only 5.1 ΔE from the darkest
ground theme. Compare `seal_point` at `#3C2018`. One palette edit would clear a
collision and give the breed a contour.

These are content decisions about canonical breed colours, so they are recorded
here rather than made.
