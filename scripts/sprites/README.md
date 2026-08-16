# Cat sprite pipeline

One rig → 20 breeds. Geometry is authored once; markings and palette are
generated per breed.

```bash
npm run sprites
```

Outputs to `src/assets/sprites/`:

| File | Purpose |
|---|---|
| `<breed_id>.png` | Shipped sheet — 6 frames, 128px each, laid out horizontally |
| `index.ts` | Generated manifest (Metro needs static `require()`s) |
| `template/rig_1x.png` | The bare rig at authoring resolution |
| `template/rig_8x.png` | Same, enlarged for review |
| `template/anim_8x.png` | All 6 frames with a real breed palette |
| `template/contact.png` | All 20 breeds side by side — visual QA |
| `template/palette.png` | Slot swatches, in slot order |
| `template/snapacat-slots.gpl` | Aseprite/GIMP palette file |

`template/` is a review and authoring aid. Only the breed PNGs and `index.ts`
are bundled into the app.

## How it works

```
rig slot buffer  →  pattern mask  →  outline + whiskers  →  breed palette  →  PNG
   (rig.js)         (patterns.js)        (rig.js)            (slots.js)      (png.js)
```

The rig is authored in **semantic slots**, never literal colours — `COAT_BASE`,
`PATTERN`, `WHITE`, `EYE` and so on (full table at the top of `slots.js`). A slot
buffer plus a breed's palette produces a finished sprite. That indirection is
the entire reason one rig can serve every breed.

Breed definitions are read out of `src/utils/spriteLibrary.ts` at build time, so
palettes have exactly one home. If that file's shape changes the build fails
loudly rather than silently dropping breeds.

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
