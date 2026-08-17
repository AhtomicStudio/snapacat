# 8-direction sprite critique — 2026-08-17

Expert pixel-art review of the directional sheets produced by Antigravity
(commit `cc10b74`). Preserved verbatim in substance because it is dense with
measured pixel data that would be expensive to regenerate.

**Verdict: 3/10 as shippable placeholder art. 7/10 as a foundation.**
Does **not** clear the `template/rig_8x.png` bar (which scored 8/10).

The one direction that holds up (S) does so because it reuses `rig.js`'s span
tables near-verbatim. The new work is the part that fails.

---

## Root cause — one design decision causes most defects

`makeBuilder(partId, dir)` (`parts.js:105`) lets parts be authored in frame
coordinates, then **silently discards anything landing outside the fixed cell**
from `PART_CELLS`, because `cellSet` (`parts.js:73`) returns early on
out-of-bounds.

**208 authored pixels are dropped during `buildPartAtlas()`** — 155 off the left
edge, 53 off the right. Nothing warns.

Visible (post-occlusion) pixel contribution per part, idle frame 0:

| dir | head | body | tail | legFL | legFR | legBL | legBR |
|---|---|---|---|---|---|---|---|
| S  | 202 | 164 | 42 | 17 | 17 | **0** | **0** |
| SE | 153 | 158 | **16** | 20 | 20 | **0** | **0** |
| E  | 125 | 205 | **0** | **0** | 23 | **0** | 2 |
| NE | 136 | 170 | 12 | **0** | **0** | 11 | 5 |
| N  | 201 | 195 | 46 | **0** | **0** | **0** | **0** |

Twenty leg instances across five directions contribute **115 visible pixels
total**.

---

## BLOCKERS

### 1. Six of eight directions have no usable legs
`buildLeg_N` paints at frame x9–13 (the S-facing position) but `ANCHORS.N` puts
N legs at dx ±4, placing the cell at x16–21. The art is entirely left of its own
cell — **all four N legs render 0 pixels.** A copy-paste from S without flipping
the sign. Same mechanism clips E (four legs collapse to one 3px column at
x16–18), NE (`legFL` = 0 px), and SE (8 px of an intended 20). In S/SE the back
legs share anchors exactly with the front legs and sit under the body, so the
walk's back-leg motion is invisible.

**Fix:** make part cells self-sizing. Two-pass `makeBuilder` — record
`fset`/`fspan` calls, compute the bbox, allocate the cell at bbox size, derive
`ax/ay` from the anchor, store `{w,h,ax,ay}` on the cell, and have
`compositor.js:63` read `cell.ax/ay` instead of `PART_CELLS`. Preserves the
frame-space authoring ergonomics and makes the bug class structurally
impossible. Add a throw or a counter to `cellSet` — this would have been caught
on run one.

Then give each leg its own frame x-range. For E, with body x5–24:

| leg | frame x | rows | slot |
|---|---|---|---|
| legFR (near front) | 18–21 | y23–30 | COAT_BASE, paw FUR_LIGHT y29–30 |
| legFL (far front) | 16–19 | y23–30 | **COAT_DARK throughout** |
| legBR (near back) | 8–11 | y23–30 | COAT_BASE, paw FUR_LIGHT |
| legBL (far back) | 6–9 | y23–30 | **COAT_DARK throughout** |

with `ANCHORS.E` → `legFR:[+4,0]`, `legFL:[+2,0]`, `legBR:[-6,0]`,
`legBL:[-8,0]`.

Front-vs-back is currently distinguished by paw colour. That's the wrong axis —
in profile the meaningful distinction is **near vs far**. Painting both far legs
entirely in `COAT_DARK` is the cheapest depth cue available at this size.

### 2. The walk cycle does not animate
`DIR_ANIMATIONS.walk` (`animations.js:42`) gives every leg `dy: ±1` and **no `dx`
at all**. No stride, no reach, no push — a vertical jitter.

Pixel deltas between walk frames (idle silhouette ~350 px):

| dir | f0↔f2 (contact↔contact) | f1↔f3 (passing↔passing) |
|---|---|---|
| S | 79 | 34 |
| SE | 54 | 20 |
| E | **17** | **2** |
| NE | **2** | **0 — byte-identical** |

Four frames of walk deliver roughly one pose.

**Fix:** rewrite with horizontal travel, ±2px minimum to read at 32px:

```
f0 left contact:   legFL{dx:+2,dy:0}  legBR{dx:+2,dy:0}
                   legFR{dx:-2,dy:-1} legBL{dx:-2,dy:-1}
                   body{dy:0} head{dy:0} tail{dx:+1}
f1 left passing:   legFL{dx:0,dy:0}   legBR{dx:0,dy:0}
                   legFR{dx:0,dy:-2}  legBL{dx:0,dy:-2}
                   body{dy:-1} head{dy:-1} tail{dx:0,dy:-1}
f2 right contact:  legFR{dx:+2,dy:0}  legBL{dx:+2,dy:0}
                   legFL{dx:-2,dy:-1} legBR{dx:-2,dy:-1}
                   body{dy:0} head{dy:0} tail{dx:-1}
f3 right passing:  legFR{dx:0,dy:0}   legBL{dx:0,dy:0}
                   legFL{dx:0,dy:-2}  legBR{dx:0,dy:-2}
                   body{dy:-1} head{dy:-1} tail{dx:0,dy:-1}
```

Body bobs **up** on passing, **down** on contact — that's the weight. Offset the
head bob to frames 0/2 so the head **lags** the body; that follow-through is what
separates a walk from a bounce.

**Also: the planted foot punches out of frame.** E walk f0 occupies row y31 —
the last row, where `SHADOWS.E` also sits. Legs must bottom out at y30.

### 3. Head detached from body in four of eight directions
`buildHead_SE` and `buildHead_NE` skulls end at **y17**; `buildBody_SE` and
`buildBody_NE` start at **y19**. **Row y18 is empty** — the head floats, and
after outlining it reads as a decapitation seam. This is the "snowman" look in
`solid_grey_dir.png` rows 4 and 6. In SE it is currently bridged only by three
accidental tail pixels.

S and N avoid it by reusing `HEAD_HALF` from `rig.js`, whose comment documents
y6–18 with `BODY` starting at y19 and a deliberate neck pinch. The directional
builders dropped that discipline.

**Fix:** append `[18, 13, 20]` to both `skullSpans`. Better, make it a real
pinch — ~8px chin over a ~14px shoulder.

### 4. The tail is invisible in E/W, a smudge in SE/NE
**E tail contributes exactly 0 visible pixels.** `PART_CELLS.tail.ax = 2` against
`ANCHORS.E.tail = [-7,-4]` clips 4 columns (24 of 52 pixels survive), and
`DRAW_ORDER.E` puts `tail` before `body`, so all 24 survivors sit inside the
body footprint and are overpainted. On walk frames 2–3 the `dx:-1` shifts it just
far enough that **2 stray pixels appear at x5** — so the tail sparkles on and off
mid-walk, which is worse than absent.

SE tail = 16 px hugging the body edge, reads as a lighting artifact. NE tail =
12 px at hip height, reads as a bite out of the haunch.

**Fix:** self-sizing cells solve the clipping. For visibility the E tail must
clear the body silhouette — root at (7,26) sweeping up-left to a tip near (3,17)
so rows y17–21 sit outside the body's top edge. A raised tail is the strongest
"cat, not duck" signal available in profile.

### 5. E/W reads as a duck
Measured from `buildHead_E` (`parts.js:259`): skull is an **11×11 circle**;
muzzle protrudes **2px**; `SLOT.PINK` is a **2px block at the tip**; neck is
**0 rows**; visible legs are one 3px column. That is the anatomical definition of
a rubber duck, and the mackerel pattern's dark body blotch finishes it as a
folded wing.

A cat's profile head is a **wedge**: sloping cranium, brow, then a step down and
forward to a **low** muzzle with a chin undercutting it.

**Fix** — replace `skullSpans` (cell covers x12–29, y4–19, so this fits):

```
y7:  17..24   cranium top
y8:  16..25
y9:  15..26   brow — widest
y10: 15..26
y11: 15..26   eye row
y12: 15..27   cheek; muzzle begins
y13: 16..28   muzzle full extension
y14: 16..28
y15: 17..27   jaw
y16: 18..24   throat
y17: 19..23   neck
```

- Muzzle `FUR_LIGHT` x26–28, y12–14
- Nose `PINK` **1px at (28,12)** — top-front, not a 2px block at the tip. This
  single change removes most of the bill read
- Chin `OUTLINE_SOFT` x26–27, y15, undercutting the muzzle
- Eye `SLOT.EYE` x22–24, y10–11 (currently y12–13 — too low, too close to the bill)
- Ear x18–21, y4–6, angled back

Then raise `buildBody_E`'s top to y17 as a 6px neck: `[17,17,22]`, `[18,12,23]`,
`[19,9,23]`. **Note the body cell is `h:14, ay:13` = rows y17–30 only — exactly
one row of headroom.** Going higher needs `ay`/`h` changed too.

**Delete `WHISKER_OFFSETS.E`** — it resolves to (28,14) and (29,13), extending
the bill by two pixels. SE whiskers resolve to (24,16)/(25,15) while the SE
muzzle ends at x22, leaving an empty column — they are **detached from the face**
and read as a cigarette. `rig.js:628` already states the rule: *"a whisker has to
grow out of the face, not hover beside it."*

---

## HIGH VALUE

- **NE/NW has one ear and it's invisible** — drawn in `COAT_BASE` on a
  `COAT_BASE` skull with no outline between, so it merges as a lump. From a rear
  three-quarter you see **both** ear backs. Add a far ear at x11–14, y6–8 and
  separate both with an `OUTLINE_SOFT` inner base. Add a haunch — the rear view's
  readable feature is hip mass, and `buildBody_NE` is a plain oval.
- **N is S with the face deleted** — identical `HEAD_HALF`, `EAR`, `BODY_SPANS`,
  `TAIL_SPANS`. A player cannot tell toward from away except by absent eyes.
  Narrow the rear skull, add visible hind paws, root the tail at centre.
- **11 of 80 frames are byte-identical duplicates.** In N/NE/NW the entire
  3-frame sleep animation is pixel-identical to idle, because the head builders
  accept a `variant` and ignore it (correct — no eyes to close — but nothing
  replaces the cue). **A sleeping cat facing away is indistinguishable from an
  awake one.** With 6 cats on screen and state readability as the core loop,
  that's a gameplay bug in an art costume. Give rear sleep `body {dy:+1}` and a
  tail curled tight to the flank.
- **No lying-down sleep pose** — the new sleep is idle-with-closed-eyes, a
  straight regression against `rig_8x`, whose loaf is its most charming frame.

## POLISH

- `BREATH_ROWS` inflates rows 21–25 in every direction, but in E those are the
  back and flank, so the breath fattens the whole animal. In E, inflate 22–24 on
  the left half only.
- `buildBody_E`'s belly highlight is a 7px flat bar with hard ends. Taper:
  `[27,12,15]`, `[28,10,17]`, `[29,11,16]`.
- `buildLeg_S`'s toe split uses `fset(x,y)` beside dozens of `fspan(y,x0,x1)`
  calls — correct, but reads as a transposition bug on every review.
- `SHADOWS` is `rx:8` everywhere except E at 9. A profile cat's ground contact is
  much longer — E/W should be `rx:11`, NE/SE around 9.

---

## The five fixes, in order

1. **Self-sizing part cells** (`parts.js` `makeBuilder`, `compositor.js:63`) —
   recovers 208 dropped pixels, makes the bug class impossible
2. **Four real legs per direction with near/far depth** — far pair `COAT_DARK`
3. **A walk with stride** — `dx: ±2` per leg, head lagging body
4. **Rebuild the E head as a wedge with muzzle and neck** — kills the duck
5. **Close the y18 head/body gap in SE/NE**, make the E tail clear the back line

Items 1 and 2 are prerequisites for the rest. Doing all five takes this from
3/10 to roughly 7 — genuinely shippable, level with `rig_8x`.
