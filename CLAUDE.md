# SnapaCat Project Constitution

You are building SnapaCat: a creative, playful Android-first application that functions as a neighborhood "Cat-a-log" collection game paired with a virtual environment manager.

## Core Architectural Invariants
* **No Dynamic AI Cost**: Do not implement dynamic image-generation APIs. Sprite selection must be derived entirely from local asset sheets via automated color extraction.
* **No Geolocation Hardware**: Location data must be restricted to user-defined text string "Hoods" to keep code deterministic and privacy-focused.
* **Bounded Rendering**: The interactive Hood view must cap simultaneously rendered cat sprites to a maximum of 6 to protect performance.

## Domain Vocabulary
* **The Index**: "Cat-a-log"
* **The Sightings**: "Field Notes" or "Scrapbook Entries"
* **The Virtual Space**: "The Hood" (Single-screen customizable environment)

## Data Schema (Source of Truth: Firestore)
### `users` Collection
```json
{
  "uid": "string",
  "username": "string",
  "friends": ["string_uid"],
  "hoods": {
    "hood_id_1": {
      "name": "Work Parking Lot",
      "custom_bg_url": "string",
      "placed_items": ["item_toy_mouse", "item_premium_kibble"],
      "item_placements": { "slot_id": "item_toy_mouse" }
    }
  }
}
```

### `cats` Collection
Identity model: each cat belongs to the user who logged it (`owner_uid`) — the Cat-a-log is a personal collection, viewable by friends, not a global shared index. Cross-user matching of real-world cats is out of scope (no geolocation ⇒ no reliable matching key).
```json
{
  "cat_id": "string",
  "owner_uid": "string",
  "name": "string",
  "gender": "male | female | unknown",
  "sprite_template_id": "string",
  "scrapbook": [
    {
      "sighting_id": "string",
      "user_id": "string",
      "cat_id": "string",
      "timestamp": "timestamp",
      "hood_name": "string",
      "note_text": "string",
      "extracted_colors": ["#HEX1", "#HEX2"]
    }
  ]
}
```
