# SnapaCat Sprint & Active Task Plan

This document tracks active sprints, phases, and validation checklists for SnapaCat.

## Active Sprint Phases

### Phase 1: Brand Identity & Guidelines Router Setup
* [x] Set up base project constitution (`claude.md`)
* [x] Initialize project-specific brand guidelines skill (`.agent/skills/brand-identity/`)
  * [x] Design token definition (`design-tokens.json`)
  * [x] Technical stack restrictions document (`tech-stack.md`)
* [x] Set up validation checklist and setup scripts

### Phase 2: Image Color-Matching Extraction Logic
* [x] **Plan**: Design the color extraction & brand matching algorithm (`src/utils/colorExtractor.ts`)
* [x] **Execute**: Implement the pure JS palette extractor (e.g. histogram-based or preset mapping) and CIEDE2000/Euclidean distance matching to map colors to nearest brand design tokens
* [x] **Validate**: Write unit tests (`src/utils/__tests__/colorExtractor.test.ts`) using mock sprite colors to verify correct mapping to `design-tokens.json` values

### Phase 3: Core Data Architecture & Mock Firestore Store
* [x] Implement local/mock schemas for `users` and `cats` collections (embedding the `scrapbook` array in `cats` documents)
* [x] Validate that the layout can fetch cat configurations from local JSON
* [x] Write validation tests for cat configurations

### Phase 4: "Cat-a-log" (The Index) and "Field Notes" (The Sightings)
* [x] Implement layout for the Cat-a-log displaying discovered/undiscovered cats
* [x] Implement Field Notes / Scrapbook page showing details of cat sightings (scrapbook entries)
* [x] Ensure styling aligns with playful, warm colors from design tokens

### Phase 5: "The Hood" (The Virtual Space)
* [x] Implement the Hood single-screen customizable environment
* [x] Limit simultaneous cat sprite renders to a maximum of 6 (Bounded Rendering invariant)
* [x] Build interactive drag/drop or place options for items (e.g. `item_toy_mouse`, `item_premium_kibble`)
* [x] Integrate color-matching logic with local cat asset sheets for dynamic sprite styling without AI cost

### Phase 6: Social Handshake and Friend Hood Viewer
* [x] Implement the bi-directional social handshake utilities (`src/utils/socialHandler.ts`)
* [x] Implement the read-only friend virtual space viewer (`src/screens/FriendHoodScreen.tsx`)
* [x] Validate friend schemas integration and write unit tests for social helpers

### Phase 7: Verification & Production Polish
* [ ] Verify performance limits (max 6 cats rendering simultaneously)
* [ ] Validate no external AI image-gen calls are made
* [ ] Final user acceptance testing and UI polish

---

## Validation Checklists

### Architectural Check
- [ ] No API calls for image generation exist.
- [ ] No geolocation hardware queries exist (only user-entered text Hoods).
- [ ] Render limits are strictly checked (<= 6 sprites in Hood).

### UI/UX Consistency
- [ ] Colors use values from `design-tokens.json`.
- [ ] Typography uses defined Google Font (Outfit / Quicksand).
