# Getting SnapaCat to AAA-Grade Pixel Animation

**Status:** planning brief · **Written:** 2026-08-18 · **Owner:** twotales89

A working document for raising SnapaCat's sprite work from "good procedural placeholder"
to something that reads as a professionally animated game — using AI where AI is
actually good, and deterministic code everywhere else.

---

## 0. The constraint in CLAUDE.md, and what it does *not* say

You asked whether the project constitution restricts art work. One line does:

> **No Dynamic AI Cost**: Do not implement dynamic image-generation APIs. Sprite
> selection must be derived entirely from local asset sheets via automated color
> extraction.

Read it carefully — it constrains **the shipped app at runtime**, not the studio.
It says the app must not call an image API while a user is using it, and that
which sprite a cat gets must be decided by local colour matching.

It does **not** forbid:

- generating art offline with AI and committing the PNGs
- paying for an art tool or an API during authoring
- any build-time step, however expensive, that produces static sheets

Everything in this document is offline authoring that ends in committed PNGs, so
the invariant holds. **Recommended amendment** so a future agent doesn't
over-apply it:

```md
* **No Dynamic AI Cost**: Do not implement dynamic image-generation APIs *at
  runtime*. Offline/build-time asset generation is permitted and encouraged;
  the shipped app must only ever read static local sheets.
```

The things actually holding the art back are mundane:

| Blocker | Effect |
|---|---|
| `scripts/sprites/png.js` is **write-only** by design | Art can only be *born in code*. Nothing external can be imported. **This is the #1 blocker.** |
| No font files linked | Design tokens ask for Quicksand/Outfit; everything renders in Roboto |
| No drawing tool in the loop | Every pixel is placed by a JS expression, which caps how organic anything can look |

---

## 1. The honest truth about AI and pixel art

Generic image models (Midjourney, SDXL, Flux, Higgsfield, DALL·E) **cannot produce
production pixel art.** They produce *pixel-art-flavoured raster images*. The
difference is not stylistic, it's structural:

| What you need | What a generic model gives you |
|---|---|
| A true 32×32 grid | ~512×512 with "blocks" that are 14.3px wide and drift out of alignment |
| A fixed palette of 12–24 colours | 4,000–30,000 colours with gradients |
| Hard 1px keyline | Anti-aliased, feathered edges |
| The *same character* across 80 frames | A different cat every generation |
| Readable silhouette at final display size | Detail tuned for a 512px canvas |

The last two are fatal for animation. Temporal consistency at 32px is the hard
problem, and no general-purpose image model solves it.

**So the rule is:** AI generates *concepts, references and source material*.
Deterministic code produces *shipped frames*. Anything that skips the second step
produces assets that can't be animated, palette-swapped, or kept consistent —
which is exactly the trap this project already avoided.

> Worth saying plainly: **SnapaCat's existing architecture is already the correct
> one.** A part atlas + per-part integer offsets + composite invariants
> (`scripts/sprites/parts.js`, `animations.js`, `verify.js`) is how real 2D games
> are built. The gap is *content volume and authoring throughput*, not design.
> Point AI at feeding this pipeline; do not let it replace the pipeline.

---

## 2. What "AAA pixel animation" actually means

Measurable, not vibes. Current state vs. target:

| Property | SnapaCat today | Target |
|---|---|---|
| Unique frames — idle | 3 | 4–6 |
| Unique frames — walk | 4 | 6–8 |
| Directions | 8 (5 authored + 3 mirrored) | keep |
| Blink cycle | none | on its own period, off-phase from breathing |
| Flavour idles (groom, stretch, look around, ear-flick) | none | 3–4, fired every 8–20s |
| State transitions (sit→stand, walk→sit, wake) | none | at least sit↔stand |
| Secondary motion (tail/ear lag) | tail only | tail + ears + whisker follow-through |
| Per-frame durations | ✅ already supported | keep and exploit — hold frames are free easing |
| Sub-pixel motion | ✅ correctly forbidden | keep forbidden |
| Cats actually moving between zones | ❌ never move | zone drift using the walk cycle |

### The four things that separate AAA from asset-flip

1. **Anticipation and follow-through.** A cat about to stand dips *first*. Its
   tail arrives *after* the body stops. You already learned this the hard way on
   the head-lag bug — delaying a period-2 bob is inversion, not lag; lag needs
   real frames.
2. **Idle variation.** A cat that loops one 4-frame breath forever reads as a
   texture. A cat that occasionally grooms reads as alive. This is the single
   highest-value addition available and it needs **no new tech** — just more
   frames in the existing atlas plus a scheduler.
3. **Transitions.** Popping from sit to walk is the clearest "this is a
   prototype" tell. Even a 2-frame transition fixes it.
4. **Non-uniform timing.** Hold the extreme, rush the pass. Your `durations`
   arrays already do this for idle (560/130/420/130) — extend the discipline
   everywhere.

---

## 3. The pipeline

Three lanes. Only lane C ships bytes.

```
LANE A — Concept & reference          (AI heavy, throwaway output)
  goal: decide what a pose/prop looks like before authoring it
  tools: any image model, ComfyUI, Retro Diffusion web, real cat video
  output: reference PNGs in scratch/, never committed

LANE B — Source art                   (AI-assisted, human-approved)
  goal: produce a clean 32×32 part or key pose in the project palette
  tools: PixelLab / Retro Diffusion / Aseprite (hand) → importer
  output: src/assets/parts/*.png, committed, palette-conformant
                 │
                 ▼  requires a PNG *reader* — see §4
LANE C — Production                   (100% deterministic, no AI)
  goal: 8 directions × N animations × 20 breeds, provably correct
  tools: the pipeline you already have
  output: src/assets/sprites/*.png + verify.js invariants
```

The arrow marked "requires a PNG reader" is the whole bottleneck. Lane B cannot
reach Lane C today.

---

## 4. Unblock first: a PNG reader (30 minutes, free)

```bash
npm i -D sharp
```

`png.js` was deliberately write-only — a good call at the time, documented in its
own header. But it means external art has no way in. With a decoder, we can build
`scripts/sprites/import.js`:

1. **Decode** any PNG (AI output, Aseprite export, a photo).
2. **Downscale** to 32×32 with a pixel-art-aware method (dominant-colour per
   cell, not bilinear — bilinear invents colours that aren't in the palette).
3. **Quantise** to the project palette via `slots.js` `TEMPLATE_COLORS`, mapping
   each colour to its nearest semantic slot in Lab space (you already have ΔE
   machinery from the breed work).
4. **Snap** to the grid and de-speckle using the existing `despeckle`.
5. **Re-outline** with the existing outward-dilating `applyOutline`.
6. **Verify** against `verify.js` invariants and reject anything that fails.

Output: any input image becomes a slot buffer that the existing compositor can
palette-swap across all 20 breeds. *That* is what makes AI output usable rather
than decorative.

Optional extras: `image-q` (npm, palette quantisation — RgbQuant/NeuQuant) and
`pngquant`/`libimagequant` if `sharp`'s quantiser isn't tight enough.

---

## 5. Tools — free first, paid where it's genuinely worth it

### Free / open source

| Tool | What it's for | Notes |
|---|---|---|
| **[Lospec Palette List](https://lospec.com/palette-list)** | 2,500+ curated palettes, 6 export formats | Free. Start here before inventing another palette. A proven 16–32 colour ramp will do more for cohesion than any model. |
| **[Pixelorama](https://github.com/Orama-Interactive/Pixelorama)** | Full pixel editor **with animation timeline**, GPL | The free Aseprite alternative. Onion skinning, frame tags. |
| **[LibreSprite](https://libresprite.github.io/)** | Fork of Aseprite from before it went proprietary | Free, older feature set, familiar UX. |
| **[Kenney](https://kenney.nl/)** | 40,000+ **CC0** game assets | Public domain — usable directly, no attribution. Excellent for props/UI reference. |
| **[OpenGameArt](https://opengameart.org/)** | Community archive, mixed licences | Filter to CC0/CC-BY. Check licences per asset. |
| **[Open Pixel Project](https://www.openpixelproject.com/)** | 2,000+ tiles, 100+ animated sprites | Good study material for animation timing. |
| **[itch.io asset packs](https://itch.io/game-assets/free/tag-pixel-art)** | Thousands of free packs | Filterable by licence. |
| **ComfyUI** + pixel-art LoRAs (Civitai, HuggingFace `nerijs/pixel-art-xl`) | Local generation, free | Lane A only, unless paired with §4's importer. |
| **[EbSynth](https://ebsynth.com/)** | Free — propagates one stylised keyframe across a video | Genuinely interesting for cat animation: film a real cat, style one frame, propagate, then downsample through the importer. Experimental. |
| **[SpriteCook](https://www.spritecook.ai/)** | Sprites, props, backgrounds, animation presets — **and an MCP server on the free tier** | 40 credits / 30 days, no card. ~8 cr per image, ~20 cr per animation → **≈5 images *or* 2 animations a month.** Commercial use is granted on free too ("the underlying model's usage policies also apply" — read the ToS before shipping). Paid: $8/800cr, $30/3,000cr, $70/7,000cr. See §5.1 for where this does and doesn't fit. |
| **`sharp` / `image-q` / `pngquant`** | Decode, downscale, quantise | The §4 unblock. |

### Paid, ranked by value for this project

| Tool | Price | Verdict |
|---|---|---|
| **[PixelLab](https://www.pixellab.ai/)** + [official MCP](https://github.com/pixellab-code/pixellab-mcp) | credits | **Best fit for our actual gap.** Purpose-built for game pixel art: directional character sprites, 360° rotation, template animations (walk/run), and **`animate_with_skeleton`** — skeleton-driven animation, which maps almost exactly onto our part-based rig. MCP means I can drive it from here directly. |
| **[Aseprite](https://aseprite.org/)** | ~$20 one-time (or compile the source yourself, free) | The industry standard, and it has a **real CLI** (`aseprite -b in.ase --sheet out.png --data out.json`). I'd wire it into `npm run sprites` so your hand edits rebuild automatically. Buy this if you ever want to nudge pixels yourself. |
| **[Retro Diffusion for Aseprite](https://astropulse.itch.io/retrodiffusion)** | $20 Lite / $65 Full, one-time, **no credits** | The one model actually trained to emit *true* pixel art — correct grid, limited palette, hard edges — rather than pixel-flavoured raster. Runs locally in the extension. (The [website](https://retrodiffusion.ai/) uses bigger models on credits; the extension is the one-time purchase.) Trained on licensed art with artist consent, which matters if you're shipping commercially. |
| **Aseprite MCP servers** (e.g. [willibrandon/pixel-mcp](https://github.com/willibrandon/pixel-mcp)) | free, needs Aseprite | Lets me drive Aseprite by natural language — animation, palettes, dithering, spritesheet export. Community projects; I have not vetted their quality. |

### 5.1 The structural mismatch — why no generator can make our *cats*

This is the trap to understand before spending anything, and it applies to
SpriteCook, PixelLab and Retro Diffusion equally.

SnapaCat derives **20 breeds from one rig**. `rig.js` authors *semantic slot
buffers* — a pixel isn't "brown", it's `COAT_BASE`; another isn't "cream", it's
`FUR_LIGHT`. `slots.js` then resolves those slots against a breed palette, and
`patterns.js` paints tabby stripes or tortie patches over them. That indirection
is the entire reason one authored pose covers every cat in the game.

**An AI generator returns a finished, coloured image. It has no slot semantics.**
A generated calico is a calico forever — it cannot be palette-swapped into a
seal point, cannot take a pattern painter, and cannot be verified against the
composite invariants. Re-deriving slots from finished colour is lossy and
error-prone (it's guessing which brown was "coat" and which was "shadow"), and
it is exactly the ambiguity the slot system exists to avoid.

So:

| Asset class | Generator a good fit? | Why |
|---|---|---|
| Cat sprites & their animations | ❌ **No** | Must feed the 20-breed slot pipeline |
| Props / goodies | ⚠️ Marginal | We already generate 25 of these procedurally in `props.js` |
| **Backgrounds & environment art** | ✅ **Yes** | No breed swap, no palette indirection, one-off per environment |
| Tilesets, UI icons, shop art | ✅ Yes | Same reason |
| Concept & reference (Lane A) | ✅ Yes | Output is throwaway |

**Backgrounds are the right target.** They're currently the weakest thing on
screen — the night sky is ~28% of the display with nothing in it, and each
environment gets one flat colour plus a procedural wall. That's a genuine gap a
generator can fill, and it needs no slot semantics at all.

> **On SpriteCook — evaluated 2026-08-18, deferred on cost.** Free tier is 40
> credits / 30 days (~5 images *or* 2 animations), which is a spike budget, not
> a production budget; the first useful tier is $8/mo. Its MCP does work on the
> free plan, so it stays worth revisiting if the backgrounds below ever need
> more variety than procedural generation can give. Pricing and caveats are in
> the table above.
>
> **The decision this forces is a good one:** backgrounds get built the same way
> the props and the brick wall were — procedurally, in `scripts/sprites/`, on
> our grid and in our palette by construction. That is strictly better than
> importing generated art, because it palette-swaps with themes and time-of-day
> for free. The generator was only ever going to be a shortcut.

> **My recommendation, in order:** `sharp` (free, unblocks everything) →
> Aseprite (~$20, unblocks hand-authoring + CLI) → PixelLab credits (skeleton
> animation is precisely our gap) → Retro Diffusion Lite ($20) if you want
> local, offline, true-pixel generation.
>
> **Skip Higgsfield and general image APIs for this.** They're built for
> photoreal/cinematic output; you'd be paying per image for Lane A material you
> can get free from ComfyUI.

---

## 6. Animation spec for SnapaCat

Concrete work items, in dependency order. Each is independently shippable.

### 6.1 Blink — *2 frames, no new tech*
Add a `blink` overlay part (eyelid closed) to the part atlas. Schedule it on a
period coprime with the breathing loop so the two never sync. Cheapest possible
"alive" signal.

### 6.2 Flavour idles — *the highest-value item*
Three new animations reusing the existing part atlas:
- `groom` (6–8 frames): head dips to paw, licks, resets
- `stretch` (6 frames): anticipation dip → extend → settle
- `look` (4 frames): head turns to a neighbouring direction and back

Scheduler: after every idle loop, roll for a flavour idle (~1-in-6), pick one,
play it once, return to idle. Stagger by `phase` so six cats never groom in
unison — the same bug class as the breathing-in-unison fix in `CatSprite`.

### 6.3 Transitions — *2–3 frames each*
`sit→stand`, `stand→sit`, `sleep→wake`. Without these, zone drift will pop.

### 6.4 Zone drift — *makes the walk cycle earn its 32 frames*
You have 8-direction walk frames that **no screen renders**. Give each cat a
target anchor, walk it there on integer offsets, face the direction of travel,
settle into idle. Per-cat item preferences decide the target — the design you
already wrote down months ago.

### 6.5 Squash & stretch on landing / settling
1px squash for one frame when a cat settles. Integer only. Trivial, and it's a
large part of why good pixel animation feels weighty.

### 6.6 Extend `verify.js`
Every new animation gets the same invariants the existing ones have: component
count, per-part visible pixels, head/body join distance, frame bounds, hole
count. **New animations must not ship without passing.** This is what has caught
every regression so far.

---

## 7. Acceptance criteria

Do not call any of this done until:

- [ ] `npm run sprites` regenerates every sheet from source with 0 verify failures
- [ ] Every animation has non-uniform `durations` (no flat frame timing)
- [ ] Six cats on screen never perform the same flavour idle simultaneously
- [ ] Every part in the atlas is drawn on the 32×32 grid with the `#2B2B33`
      keyline — imported art included
- [ ] Total palette across a single sprite ≤ 24 colours
- [ ] Silhouette test: at final display size, greyscale the sprite to solid
      black. Every pose is still identifiable. *(This is the test that caught
      the yarn ball reading as a gemstone.)*
- [ ] Any AI-sourced art has passed through `import.js` and been slot-quantised —
      no raw generations committed

---

## 8. Ordered action plan

| # | Action | Cost | Blocks |
|---|---|---|---|
| 1 | `npm i -D sharp`, build `scripts/sprites/import.js` | free | everything in Lane B |
| 2 | Link Quicksand + Nunito (Google Fonts, OFL) | free | UI polish |
| 3 | Amend the CLAUDE.md invariant (§0) | free | future agent confusion |
| 4 | Pick a Lospec palette; conform `slots.js` to it | free | visual cohesion |
| 5 | Blink + 3 flavour idles + transitions (§6.1–6.3) | free | the "alive" feeling |
| 6 | Zone drift (§6.4) | free | the walk cycle paying off |
| 7 | Buy Aseprite; wire its CLI into `npm run sprites` | ~$20 | hand authoring |
| 8 | PixelLab MCP for skeleton animation | credits | volume + new species |
| 9 | Retro Diffusion Lite for local true-pixel generation | $20 | offline iteration |

**Items 1–6 are free and account for most of the perceived quality gain.** Do
those before spending anything.

---

## 9. If you hand this to an agent

Paste this with the following framing:

> Read `docs/pixel-animation-pipeline.md`. Work only in Lane C unless §4's
> importer exists. Every frame you add must pass `scripts/sprites/verify.js`.
> Never place a pixel off the 32×32 grid, never use sub-pixel motion, never
> exceed 24 colours in one sprite, and never commit a raw AI generation. When a
> pose doesn't read, fix the **silhouette** before adding interior detail.

---

## Appendix — why silhouette-first keeps coming up

Three separate rounds of prop work on this project failed the same way: detail
was added to a shape that was already unreadable. The yarn ball got winding
lines and became a gemstone. The feather wand got barbs and became a badminton
racquet. The neon paw got bright toe centres and became a flower.

Every one was fixed by changing the **outline**, not the interior. At 32px there
are roughly 400 meaningful pixels in an object; the boundary carries the
identity and everything inside is texture. This holds for animation too — a pose
reads from its silhouette across frames, which is why the composite invariants in
`verify.js` measure component counts and join distances rather than colour.
