---
name: brand-identity
description: Reference guidelines, style tokens, and architecture constraints for SnapaCat.
---

# brand-identity

This skill guides development workflows for the SnapaCat project, ensuring all code, UI styling, and system designs adhere to the strict brand identity and architectural rules of the project.

## Resources
- [design-tokens.json](file:///g:/Projects/SnapaCat/.agent/skills/brand-identity/resources/design-tokens.json): Source of truth for colors, typography, borders, spacing, and transition styling.
- [tech-stack.md](file:///g:/Projects/SnapaCat/.agent/skills/brand-identity/resources/tech-stack.md): Coding rules, framework definitions, Firestore schema models, and architectural invariants.

## Instructions
1. **Design Alignment**: Always read `resources/design-tokens.json` before writing style/CSS rules. Colors and fonts must exactly match the defined brand colors (warm colors, playful gradients, soft radii).
2. **Architectural Guardrails**: Ensure any new features align with the rules in `resources/tech-stack.md` (e.g., maximum 6 cat sprites in the Hood, absolute separation of location data from hardware, color-extraction instead of dynamic AI generation).
3. **Naming Consistency**: Use the domain vocabulary (e.g., "Cat-a-log", "Field Notes" or "Scrapbook Entries", "The Hood").
