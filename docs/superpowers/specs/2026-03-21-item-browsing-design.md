# Item Browsing, Discovery & Comparison — Design Spec

**Goal:** Improve the Vanalytics Item Database with tiered category browsing, granular stat filtering, and side-by-side item comparison.

**Approach:** Hybrid — category hierarchy is frontend-only (maps to existing API params), stat filtering adds new server-side query params, comparison is frontend-only (fetches existing item detail endpoints).

---

## 1. API Changes

### 1.1 New Query Parameters on `GET /api/items`

**`stats` (repeatable)** — Format: `StatName:Min:Max`. Either min or max may be omitted.

Examples:
- `stats=STR:10:` — STR >= 10
- `stats=DEF::50` — DEF <= 50
- `stats=Haste:5:10` — Haste between 5 and 10

Valid stat names (match GameItem property names):
`HP`, `MP`, `STR`, `DEX`, `VIT`, `AGI`, `INT`, `MND`, `CHR`, `Damage`, `Delay`, `DEF`, `Accuracy`, `Attack`, `RangedAccuracy`, `RangedAttack`, `MagicAccuracy`, `MagicDamage`, `MagicEvasion`, `Evasion`, `Enmity`, `Haste`, `StoreTP`, `TPBonus`, `PhysicalDamageTaken`, `MagicDamageTaken`

Invalid stat names return 400 Bad Request.

**`slots` (string, optional)** — Comma-separated equipment slot filter. Accepts slot names: `Main`, `Sub`, `Range`, `Ammo`, `Head`, `Body`, `Hands`, `Legs`, `Feet`, `Neck`, `Waist`, `Ear`, `Ring`, `Back`. Multiple values are OR'd together. Compound slots: `Ear` maps to bitmask OR of EarL + EarR slots; `Ring` maps to bitmask OR of RingL + RingR slots. This means selecting "Ear" in the Armor subcategory matches items equippable in either ear slot.

**`flags` (string, optional)** — Comma-separated item flag filter: `rare`, `exclusive`, `auctionable`. Filters against the `Flags` bitmask field (Rare=32, Exclusive=8192, Auctionable=32768).

### 1.2 Implementation

In `ItemsController.GetItems()`:
- Parse each `stats` entry by splitting on `:` → `(statName, min?, max?)`
- Validate stat name against a static allowlist dictionary mapping name → Expression accessor for the GameItem property
- Build dynamic LINQ `Where` clauses: `query = query.Where(i => i.{Stat} != null && i.{Stat} >= min && i.{Stat} <= max)`
- Parse `slots` to bitmask, filter: `query = query.Where(i => (i.Slots & slotMask) != 0)`
- Parse `flags`, filter against `Flags` bitmask

### 1.3 No Other API Changes

- Category hierarchy is frontend-only (uses existing `category` + `skill` params)
- Comparison uses existing `GET /api/items/{id}` to fetch full item details
- No new endpoints needed

---

## 2. Category Hierarchy (Frontend)

### 2.1 Accordion Tree

Replace the flat category dropdown with a collapsible accordion tree. Top-level categories expand to show subcategories.

**Hierarchy mapping:**

| Category | Subcategory Source | Subcategory Values |
|----------|-------------------|-------------------|
| Weapon | `skill` field | Hand-to-Hand (1), Dagger (2), Sword (3), Great Sword (4), Axe (5), Great Axe (6), Scythe (7), Polearm (8), Katana (9), Great Katana (10), Club (11), Staff (12), Archery (25), Marksmanship (26) |
| Armor | `slots` field | Head, Body, Hands, Legs, Feet, Back, Waist, Neck, Ear (EarL+EarR), Ring (RingL+RingR) |
| General | none | — |
| Furnishing | none | — |
| Crystal | none | — |
| (others) | none | — |

**Behavior:**
- Clicking a top-level category sets the `category` API param and clears any subcategory filter
- Expanding a category reveals its subcategories
- Clicking a subcategory sets both `category` and the relevant param (`skill` for Weapon, `slots` for Armor)
- Item counts next to categories are deferred (not MVP) — can be added later via a lightweight count endpoint
- Only one category can be active at a time
- A "Clear" action deselects the current category

### 2.2 CategoryTree Component

- Props: `categories: string[]`, `selectedCategory: string | null`, `selectedSkill: number | null`, `selectedSlots: string | null`, `onChange: (category, skill?, slots?) => void`
- Internal state: `expandedCategory: string | null`
- Renders each category as an expandable row. Weapon and Armor rows expand to show subcategories. All others are leaf nodes.

---

## 3. Stat Filtering (Frontend + Backend)

### 3.1 StatFilterPanel Component

- "Add Stat Filter" link adds a new filter row
- Each row: stat dropdown (flat alphabetical list of all 26 stat names), min input, max input, remove button
- Stat dropdown excludes stats already used in another active filter row
- Changes trigger API re-fetch with debounce (same 300ms debounce as text search)
- Empty min/max values are omitted from the API call

### 3.2 Filter State

Array of `{ stat: string, min: number | null, max: number | null }`. Serialized to `stats` query params on API call.

---

## 4. Item Comparison (Frontend)

### 4.1 CompareContext

React context provider wrapping the app layout. Holds:
- `items: GameItemSummary[]` — selected items (max 4)
- `addItem(item: GameItemSummary): void`
- `removeItem(itemId: number): void`
- `clearItems(): void`
- `isSelected(itemId: number): boolean`

State persisted in `sessionStorage` so it survives page navigation but not tab close.

### 4.2 Entry Points

**Search results (ItemCard):** Checkbox overlay in the top-right corner of each card. Checked state from `CompareContext.isSelected()`. Clicking toggles `addItem`/`removeItem`. Disabled when 4 items selected and this item is not one of them.

**Item detail page (ItemDetailPage):** "Add to Compare" / "Remove from Compare" button in the item header area. Same toggle behavior.

### 4.3 CompareTray

Fixed-position bar at the bottom of the viewport. Only visible when `items.length > 0`.

**Collapsed state (default):**
- Shows item icons and names as removable chips
- Empty slots shown as dashed outlines (up to 4 total)
- "Compare (N)" button enabled when N >= 2
- "Clear" link to empty the tray

**Expanded state (after clicking Compare):**
- Tray expands upward to show the CompareTable
- Close button returns to collapsed state

### 4.4 CompareTable

Side-by-side stat comparison table.

**Header row:** Item icon, name, category/subcategory, level for each item.

**Stat rows:** Only stats where at least one compared item has a non-null value. For each stat row:
- Show the value for each item (or "—" if null)
- Highlight the best value in green with ▲ indicator
- "Best" logic: highest value wins for most stats. Exception: `Delay`, `PhysicalDamageTaken`, `MagicDamageTaken` — lower is better.

**Sections:** Rows grouped visually: Equipment (Damage, Delay, DEF), Attributes (HP, MP, STR-CHR), Combat (Acc, Atk, etc.), Defensive (Eva, M.Eva, etc.), Special (Enmity, Haste, STP, etc.).

**Data:** Fetches full `GameItemDetail` for each item via existing `GET /api/items/{id}`. Fetched on expand, cached in context for the session.

---

## 5. Modified Components

| Component | Change |
|-----------|--------|
| `ItemDatabasePage` | Replace category dropdown with `CategoryTree`. Add `StatFilterPanel` below existing filters. Wire new filter state to API params. |
| `ItemCard` | Add `CompareCheckbox` overlay (top-right corner). |
| `ItemDetailPage` | Add "Add to Compare" button in header. |
| `Layout` | Wrap children with `CompareContext.Provider`. Render `CompareTray` inside layout. |
| `App.tsx` | No changes — context is in Layout. |
| `ItemsController` | Parse `stats`, `slots`, `flags` params. Build dynamic LINQ filters. |

## 6. New Components

| Component | Purpose |
|-----------|---------|
| `CategoryTree` | Accordion tree for tiered category selection |
| `StatFilterPanel` | Dynamic "add stat filter" rows with dropdowns and min/max inputs |
| `CompareContext` | React context for comparison item list |
| `CompareCheckbox` | Checkbox overlay for ItemCard |
| `CompareTray` | Fixed bottom bar with collapse/expand |
| `CompareTable` | Side-by-side stat diff table |

## 7. File Structure

**Backend:**
- Modify: `src/Vanalytics.Api/Controllers/ItemsController.cs` — add stat/slots/flags parsing and LINQ filters

**Frontend (new files):**
- `src/components/items/CategoryTree.tsx`
- `src/components/items/StatFilterPanel.tsx`
- `src/components/items/CompareCheckbox.tsx`
- `src/components/compare/CompareContext.tsx`
- `src/components/compare/CompareTray.tsx`
- `src/components/compare/CompareTable.tsx`

**Frontend (modified):**
- `src/pages/ItemDatabasePage.tsx`
- `src/pages/ItemDetailPage.tsx`
- `src/components/ItemCard.tsx` (if exists, or wherever item cards are rendered)
- `src/components/Layout.tsx`
- `src/types/api.ts` — add any new type definitions needed

---

## 8. Out of Scope

- Full-text search index (current `Contains` is sufficient for now)
- Category counts endpoint (can use existing result `totalCount` or defer)
- URL query string sync for filters (bookmarkable filter state — nice-to-have, not MVP)
- Price comparison in the compare table (only item stats)
- Mobile-optimized compare view (table scrolls horizontally on small screens)
