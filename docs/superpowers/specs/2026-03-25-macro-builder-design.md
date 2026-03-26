# Macro Builder — Design Spec

**Date:** 2026-03-25
**Status:** Approved

## Overview

A macro management system that syncs FFXI macros between the game client and the Vanalytics web UI. Players can view, edit, and organize their macros in a full-featured browser-based editor, with changes pushed back to the game via the Windower addon.

**MVP scope:** Backup/restore — the addon reads existing in-game macros, uploads them to Vanalytics, and the web UI allows viewing and editing with push-back to the game.

## FFXI Macro Structure

```
Character
  └── 20 Books
       └── 10 Pages per book
            └── 2 Sets per page (Ctrl + Alt)
                 └── 10 Macros per set
```

- **4,000 macros per character** (20 books × 10 pages × 2 sets × 10 macros)
- Each macro has: name (max 8 chars), icon (byte 0-255), 6 command lines (max 57 chars each)
- Macros are stored on disk as DAT files at `USER/<character_content_id>/mcr{0-19}.dat`
- Each DAT file contains one book (all 10 pages, both sets)

## Approach

**Approach 2 (Structured API, addon-parsed)** was selected:

- The addon parses DAT files into structured JSON for upload, and writes DAT files from structured JSON on download
- The API stores macro data relationally and serves clean JSON
- The web UI works with structured JSON throughout
- DAT binary format knowledge stays in one place (the Lua addon)

This was chosen over blob storage (duplicates parsing across Lua and TypeScript) and server-side DAT generation (duplicates binary format knowledge across Lua and C#).

## Data Model

### MacroBooks

| Column | Type | Description |
|--------|------|-------------|
| Id | Guid | Primary key |
| CharacterId | Guid | FK to Characters |
| BookNumber | int | 1-20 |
| ContentHash | string | Hash of the book's DAT file content for change detection |
| PendingPush | bool | True if edited in web UI, awaiting addon pickup |
| UpdatedAt | DateTimeOffset | Last modification time |

Unique constraint on `(CharacterId, BookNumber)`.

### MacroPages

| Column | Type | Description |
|--------|------|-------------|
| Id | Guid | Primary key |
| MacroBookId | Guid | FK to MacroBooks |
| PageNumber | int | 1-10 |

Unique constraint on `(MacroBookId, PageNumber)`.

### Macros

| Column | Type | Description |
|--------|------|-------------|
| Id | Guid | Primary key |
| MacroPageId | Guid | FK to MacroPages |
| Set | string | "Ctrl" or "Alt" |
| Position | int | 1-10 |
| Name | string | Max 8 characters |
| Icon | int | 0-255 |
| Line1 | string | Max 57 characters |
| Line2 | string | Max 57 characters |
| Line3 | string | Max 57 characters |
| Line4 | string | Max 57 characters |
| Line5 | string | Max 57 characters |
| Line6 | string | Max 57 characters |

Unique constraint on `(MacroPageId, Set, Position)`.

## API Endpoints

### Addon Endpoints (ApiKey auth, under `/api/sync/macros`)

**Upload macros (addon → API):**
```
POST /api/sync/macros
```
Payload is an array of books with changed content. Each book includes its book number, content hash, and full macro data (all pages, both sets). The API upserts the book and all child records. On first sync, all 20 books are sent. On subsequent syncs, only books whose hash has changed since the last upload.

Request body:
```json
{
  "books": [
    {
      "bookNumber": 1,
      "contentHash": "abc123...",
      "pages": [
        {
          "pageNumber": 1,
          "macros": [
            {
              "set": "Ctrl",
              "position": 1,
              "name": "Cure IV",
              "icon": 5,
              "line1": "/ma \"Cure IV\" <stpt>",
              "line2": "",
              "line3": "",
              "line4": "",
              "line5": "",
              "line6": ""
            }
          ]
        }
      ]
    }
  ]
}
```

**Check for pending changes (addon polls):**
```
GET /api/sync/macros/pending
```
Returns an array of book numbers that have `PendingPush = true`. Returns empty array if nothing pending. Lightweight — called on every sync interval.

Response:
```json
{ "pendingBooks": [3, 7] }
```

**Download a book (addon pulls):**
```
GET /api/sync/macros/{bookNumber}
```
Returns the full structured JSON for a single book. Called for each pending book number.

**Acknowledge receipt:**
```
DELETE /api/sync/macros/pending/{bookNumber}
```
Clears `PendingPush` for the specified book after the addon has successfully written the DAT file. The addon updates its local content hash to match.

### Web UI Endpoints (JWT auth, under `/api/macros`)

**List all books for a character:**
```
GET /api/macros/{characterId}
```
Returns all 20 books with summary info (book number, content hash, updated timestamp, whether any macros are non-empty, preview label derived from first non-empty macro name).

**Get a single book with all macro data:**
```
GET /api/macros/{characterId}/{bookNumber}
```
Returns the full book including all pages and macros.

**Update a book from the web UI:**
```
PUT /api/macros/{characterId}/{bookNumber}
```
Accepts the same page/macro structure as the sync upload. Sets `PendingPush = true` and recalculates `ContentHash`. Returns the updated book.

## Addon Flow

### Sync Interval (piggybacks on existing timer)

1. Locate macro DAT files at `USER/<content_id>/mcr{0-19}.dat`
2. Read and hash each file's content (simple string hash, pure Lua)
3. Compare hashes against stored values in `settings.xml`
4. Changed books → parse DAT binary into structured JSON
5. Upload changed books via `POST /api/sync/macros`
6. Update stored hashes for successfully uploaded books
7. After character sync completes, `GET /api/sync/macros/pending`
8. For each pending book → `GET /api/sync/macros/{bookNumber}`
9. Write structured JSON back to DAT file format
10. Acknowledge receipt via `DELETE /api/sync/macros/pending/{bookNumber}`
11. Update local hash for the written book
12. Execute `windower.send_command('input /reloadmacros')` to apply changes in-game without re-zoning

### New Commands

- `//va macros pull` — Force-check for pending macro updates immediately
- `//va macros push` — Force-upload all 20 books regardless of hash (initial setup / recovery)
- `//va macros status` — Show last macro sync time and book tracking info

### Change Detection

Hash-based comparison (Approach B):
- On each sync interval, read each DAT file and compute a hash
- Compare against the 20 hashes stored in `settings.xml`
- Only upload books whose hash differs
- Pure Lua, no dependencies, definitively detects content changes regardless of source

### DAT File Writing Safety

- Write the new DAT file first, then trigger `/reloadmacros`
- If the player is actively editing a macro at the exact moment of write, their edit may be overwritten — this is an acceptable edge case for MVP (the web UI shows the canonical version)
- Document this behavior for users

## Web UI

### Dedicated Macro Panel

The macro editor is a standalone panel on the character detail page (not a tab within existing content). It only appears for characters that have synced macro data via the addon.

### Layout

**Book selector (left sidebar):**
- Vertical list of books 1-20
- Each entry shows book number and a preview label (derived from first non-empty macro name, or "Empty")
- Visual indicator for books with `PendingPush = true` (pending sync to game)
- Click to load that book's data

**Macro page reel (center):**
- The current page's macro grid is front-and-center: 2 columns (Ctrl | Alt) × 10 rows
- Adjacent pages are visible above and below with 3D perspective/depth effect — like a vertical film strip or rolodex
- Previous/next pages recede with reduced scale, opacity, and perspective transform
- Navigate pages via click, scroll, or keyboard arrows
- Page number indicator
- Mirrors the in-game Ctrl+Up/Down page switching concept, but with spatial visualization FFXI lacks

**Macro editor (right panel):**
- Opens when clicking a macro cell in the grid
- Name field (8 char max, enforced)
- Icon selector (grid of FFXI macro icons, ~30 standard icons rendered as sprites)
- Six line fields (57 char max each, enforced)
- Slash-command autocomplete for common FFXI commands: `/ma`, `/ja`, `/ws`, `/equip`, `/wait`, `/echo`, `/p`, `/l`, `/s`, etc.
- Save button → API call → sets `PendingPush = true`
- Status feedback: "Saved — will sync to game on next addon interval"

**Macro grid cells:**
- Show macro icon and name
- Empty slots rendered as dimmed placeholders
- Visual distinction between Ctrl and Alt columns

### FFXI Styling

Follows the established Vanalytics dark theme and FFXI-inspired aesthetic. The macro grid should evoke the in-game macro palette feel.

### 3D Page Reel Detail

The reel effect gives spatial context to page navigation:
- Current page: full size, full opacity, no transform
- Adjacent pages (±1): ~80% scale, ~60% opacity, slight Y-axis perspective tilt
- Further pages (±2): ~60% scale, ~30% opacity, more pronounced tilt
- Pages beyond ±2: hidden or barely visible
- Smooth CSS transitions when navigating between pages
- Click on an adjacent page to navigate to it

## Future Considerations (Out of Scope for MVP)

- **Template library** — Pre-built macro sets per job/role, shareable between characters
- **Job-swap automation** — Auto-switch macro books when changing jobs in-game
- **Always-available editor** — Build macros in the web UI before the addon has synced (Approach B from brainstorming)
- **Macro sharing** — Export/import macro books between Vanalytics users
- **Macro versioning** — History of changes, ability to roll back
