# Inventory Anomaly Detection & Resolution

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Spec 1 of 2 — Detection, web UI, and move order creation. Spec 2 covers addon-side move execution (polling + manual command).

## Overview

Analyze a character's inventory data to detect organizational anomalies (duplicate items across bags, split stacks, near-capacity bags), display them in the existing Inventory tab with suggested fixes, and let the user create move orders that are stored for future addon execution.

---

## Anomaly Detection Engine

Detection runs server-side, analyzing the `CharacterInventory` table joined with `GameItems` (for stack size). Returns anomalies as a typed array.

### Anomaly Types

**1. Duplicate Items Across Bags**
Same `ItemId` appears in 2+ different `Bag` values. Groups all instances and reports which bags contain the item with quantities.

**2. Split Stacks**
Same stackable `ItemId` (where `GameItem.StackSize > 1`) appears in 2+ slots (same bag or across bags) where the number of slots used exceeds the minimum needed to hold the total quantity. Minimum slots = `ceil(totalQuantity / stackSize)`. If actual slots > minimum slots, the stacks can be consolidated. Example: 5 Fire Crystals in slot 3 and 8 Fire Crystals in slot 7 (stackSize 12) uses 2 slots but only needs 1 (total 13 > 12, so needs 2 — not an anomaly). But 5 in slot 3 and 3 in slot 7 (total 8, stackSize 12) uses 2 slots and only needs 1 — that's a split stack.

**3. Near-Capacity Bags**
Any bag where `usedSlots / maxSlots >= 0.90`. Max slots per bag defaults to 80.

### Suggested Fixes

For duplicates and split stacks, the engine generates a suggested fix: a list of move instructions that consolidate items into the bag that already holds the most of that item. Near-capacity anomalies have no auto-fix (no sensible default action).

### Response Shape

```
Anomaly {
  type: 'duplicate' | 'splitStack' | 'nearCapacity'
  severity: 'info' | 'warning'
  anomalyKey: string              // stable ID: "duplicate:1234", "splitStack:1234", "nearCapacity:Inventory"
  itemId: number | null           // null for nearCapacity
  itemName: string | null
  bags: string[]                  // which bags are involved
  details: AnomalyDetails
  suggestedFix: SuggestedFix | null
}

AnomalyDetails (union by type):
  // duplicate / splitStack:
  slots: { bag: string, slotIndex: number, quantity: number }[]
  // nearCapacity:
  bagName: string
  usedSlots: number
  maxSlots: number

SuggestedFix {
  moves: {
    itemId: number
    fromBag: string
    fromSlot: number
    toBag: string
    quantity: number
  }[]
}
```

---

## Anomaly Dismissal

### Model: `DismissedAnomaly`

| Field | Type | Notes |
|-------|------|-------|
| Id | long | Auto-increment PK |
| CharacterId | Guid | FK to Character |
| AnomalyKey | string | e.g., "duplicate:1234", "nearCapacity:Inventory" |
| DismissedAt | DateTimeOffset | |

Index on `(CharacterId, AnomalyKey)`, unique.

### Behavior

- The anomaly detection endpoint filters out anomalies whose key exists in the dismissed table for that character.
- Dismissals are **permanent until manually un-dismissed**. A near-capacity bag that drops below 90% and goes back above stays dismissed.
- The response includes a `dismissedCount` so the UI can show a "N dismissed" link.

---

## Move Orders

### Model: `InventoryMoveOrder`

| Field | Type | Notes |
|-------|------|-------|
| Id | long | Auto-increment PK |
| CharacterId | Guid | FK to Character |
| ItemId | int | FFXI item ID |
| FromBag | InventoryBag | Source bag |
| FromSlot | int | Source slot index |
| ToBag | InventoryBag | Destination bag |
| Quantity | int | Number of items to move |
| Status | MoveOrderStatus | Pending, Completed, Failed, Cancelled |
| CreatedAt | DateTimeOffset | |
| CompletedAt | DateTimeOffset? | Set when status changes to Completed/Failed/Cancelled |

Index on `(CharacterId, Status)`.

### Enum: `MoveOrderStatus`

```
Pending, Completed, Failed, Cancelled
```

### Resolution Flow

1. User sees anomaly with suggested fix in the Inventory tab
2. User can accept the suggestion as-is, or change the target bag via a dropdown
3. User clicks "Resolve" — one or more `InventoryMoveOrder` records are created with status `Pending`
4. The anomaly disappears from the active list (it has a pending resolution)
5. Pending move orders are visible in a "Pending Moves" section at the top of the Inventory tab
6. User can cancel pending moves, which returns the anomaly to the active list

For Spec 1, pending moves sit in the database. Spec 2 adds addon-side execution.

---

## API Endpoints

### New Controller: `InventoryManagementController`

Route prefix: `api/characters/{characterId}/inventory`
Authentication: `[Authorize]` (JWT, user-facing)

All endpoints verify character ownership via `UserId` claim.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/anomalies` | Detect and return anomalies, filtered by dismissed keys. Response: `{ anomalies: Anomaly[], dismissedCount: number, pendingMoves: MoveOrder[] }` |
| POST | `/dismiss` | Dismiss an anomaly. Body: `{ anomalyKey: string }` |
| DELETE | `/dismiss/{anomalyKey}` | Un-dismiss an anomaly |
| POST | `/moves` | Create move orders. Body: `{ moves: [{ itemId, fromBag, fromSlot, toBag, quantity }] }` |
| GET | `/moves?status=Pending` | List move orders filtered by status |
| DELETE | `/moves/{id}` | Cancel a pending move order (sets status to Cancelled) |

### Anomaly Detection Logic (inside GET /anomalies)

1. Load all `CharacterInventory` rows for the character, joined with `GameItem` for item name and stack size
2. Load all `DismissedAnomaly` keys for the character
3. Load all `InventoryMoveOrder` with status `Pending` for the character
4. Group inventory by `ItemId`:
   - If item appears in 2+ bags → `duplicate` anomaly
   - If stackable item appears in 2+ slots and total < stackSize * slotCount → `splitStack` anomaly
5. Count used slots per bag:
   - If usedSlots / 80 >= 0.90 → `nearCapacity` anomaly
6. Filter out anomalies whose `anomalyKey` is in the dismissed set
7. Filter out anomalies whose items have pending move orders (resolution in progress)
8. Generate suggested fixes for remaining duplicate/splitStack anomalies
9. Return anomalies + dismissedCount + pendingMoves

---

## Frontend: Inventory Tab Integration

### Anomaly Banner

Added at the top of the existing `InventoryTab` component, above the bag tabs.

**Layout:**
- Header line: "N inventory issues found" with a "[M dismissed]" link on the right
- List of active anomalies, each showing:
  - Type icon/label and item name (or bag name for near-capacity)
  - Details: which bags/slots, quantities
  - For duplicate/splitStack: "Suggestion: Consolidate to {bag}" with a [Change] dropdown and [Resolve] button
  - For nearCapacity: informational only, no resolve action
  - [Dismiss] button on all types
- "Dismissed" section: collapsible, shows dismissed anomalies with [Un-dismiss] buttons

### Pending Moves Section

Below the anomaly banner (or above it), shows pending move orders:
- Each move: item name, from bag:slot → to bag, quantity, [Cancel] button
- Cancelling a move deletes the order and the associated anomaly reappears

### Data Fetching

- `GET /api/characters/{id}/inventory/anomalies` called when the Inventory tab mounts
- Refetched after any dismiss/resolve/cancel action

### Collapsing

When there are zero active anomalies and zero pending moves, the banner is hidden entirely.

---

## Component Architecture

### New Files

```
src/Vanalytics.Api/Controllers/InventoryManagementController.cs
src/Vanalytics.Core/Models/DismissedAnomaly.cs
src/Vanalytics.Core/Models/InventoryMoveOrder.cs
src/Vanalytics.Core/Enums/MoveOrderStatus.cs
src/Vanalytics.Data/Configurations/DismissedAnomalyConfiguration.cs
src/Vanalytics.Data/Configurations/InventoryMoveOrderConfiguration.cs
src/Vanalytics.Web/src/components/character/InventoryAnomalyBanner.tsx
```

### Modified Files

- `VanalyticsDbContext.cs` — add DbSets for `DismissedAnomaly` and `InventoryMoveOrder`
- `InventoryTab.tsx` — import and render `InventoryAnomalyBanner` at the top
- `api.ts` — add TypeScript types for anomalies, dismissed, move orders

### EF Core Migration

New migration adding `DismissedAnomalies` and `InventoryMoveOrders` tables.
