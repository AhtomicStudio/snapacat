# SnapaCat Tech Stack & Coding Restrictions

This document specifies the technical boundaries, architectural invariants, and coding conventions for the SnapaCat project.

## 1. Architectural Invariants

> [!IMPORTANT]
> These invariants are absolute. Do not propose or write code that violates them.

* **No Dynamic AI Cost**:
  * **Rule**: Do not implement dynamic image-generation APIs (e.g., DALL-E, Midjourney, or other generative model endpoints).
  * **Mechanism**: Sprite selection and dynamic styling must be derived entirely from local SVG or PNG asset sheets via automated color extraction or tinting algorithms.
* **No Geolocation Hardware**:
  * **Rule**: Do not integrate Google Play Services Location APIs, CoreLocation, Web Geolocation APIs, or any GPS/Cell/Wi-Fi positioning hardware queries.
  * **Mechanism**: Location data must be restricted to user-defined, arbitrary text strings representing "Hoods" (e.g., "Work Parking Lot", "Backyard Deck") to keep the experience deterministic and privacy-focused.
* **Bounded Rendering**:
  * **Rule**: The interactive Hood rendering canvas must cap simultaneously rendered cat sprites to a maximum of **6** at any given time.
  * **Mechanism**: When rendering the Hood screen, verify the number of active cat objects and discard or hide any exceeding the limit of 6 to protect runtime performance and battery life.

---

## 2. Domain Vocabulary

Ensure variable names, database keys, UI headers, and documentation use the official project vocabulary:
* **The Index**: Refers to **"Cat-a-log"** (do not call it "CatDex" or "Catalog").
* **The Sightings**: Refers to **"Field Notes"** or **"Scrapbook Entries"** (do not call them "Sightings" or "CatList").
* **The Virtual Space**: Refers to **"The Hood"** (do not call it "Lobby", "Home", "Playground", or "Room").

---

## 3. Data Schema & Persistence (Source of Truth: Firestore)

All persistent data models must align with the Firestore schema structure.

### Users Document Model (`users` collection)
```json
{
  "uid": "string",
  "username": "string",
  "friends": ["string_uid"],
  "hoods": {
    "hood_id_1": {
      "name": "Work Parking Lot",
      "custom_bg_url": "string",
      "placed_items": ["item_toy_mouse", "item_premium_kibble"]
    }
  }
}
```

### Cat Document Model (`cats` collection)
```json
{
  "cat_id": "string",
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

---

## 4. Coding Conventions & Quality Rules
1. **Local State Offline Support**: Since SnapaCat is an Android-first project, local caching and state management must support offline-first rendering (using Room DB or equivalent local stores mapping directly to Firestore schemas).
2. **Deterministic Randomness**: Any cat spawn algorithms must rely on local timestamp seeds and item modifiers (e.g., placing `item_toy_mouse` increases likelihood of playful cats) rather than external server-side randomness.
