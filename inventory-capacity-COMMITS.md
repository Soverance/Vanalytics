# Inventory Unlocked-Capacity — queued commits (run top-to-bottom)

Feature: per-bag unlocked inventory capacity (spec + plan under docs/superpowers/).
Mode: agent cannot commit; run these yourself. Branch: july-2 (alongside in-flight BLU work).
NOTE: the working tree also has unrelated BLU-classification changes — stage ONLY the paths listed per commit.

<!-- Commit commands are appended here as each task's review comes back clean. -->

## Task 1 — addon capacity read/send (review clean; bag IDs verified vs Windower bags.lua)
```bash
git add addon/vanalytics/inventory.lua
git commit -m "feat(addon): send per-bag unlocked capacity in inventory sync"
```

## Task 5 — frontend pure capacity helper (review clean; 7/7 vitest green)
NOTE: types/api.ts is shared with the in-flight BLU work — stage ONLY the BagCapacities hunk (do not commit BLU's spellField/spellNames lines here).
```bash
git add src/Vanalytics.Web/src/components/character/inventoryCapacity.ts \
        src/Vanalytics.Web/src/components/character/inventoryCapacity.test.ts
git add -p src/Vanalytics.Web/src/types/api.ts   # stage only: +export type BagCapacities = Record<string, number>
git commit -m "feat(web): add pure bag-capacity helpers with fallback"
```

## Task 2 — persist capacities on sync (review clean; 2/2 Testcontainers tests green)
Includes the EF migration + model snapshot. None of these files overlap BLU.
```bash
git add src/Vanalytics.Core/DTOs/Sync/InventorySyncRequest.cs \
        src/Vanalytics.Core/Models/Character.cs \
        src/Vanalytics.Data/Migrations/ \
        src/Vanalytics.Api/Controllers/InventoryController.cs \
        tests/Vanalytics.Api.Tests/Controllers/InventoryCapacityTests.cs
git commit -m "feat(inventory): persist per-bag unlocked capacity from addon sync"
```
NOTE: Tasks 3 & 4 also add to InventoryCapacityTests.cs and InventoryManagementController.cs — if you commit per-task, stage those files' Task-2 state before Tasks 3/4 edits land, OR just squash Tasks 2-4 into one backend commit (simpler).

## Task 6 — Totals view shows real capacity (review clean; tsc -b clean, 181/181 vitest)
```bash
git add src/Vanalytics.Web/src/components/character/InventoryTotals.tsx \
        src/Vanalytics.Web/src/components/character/InventoryTab.tsx
git commit -m "feat(web): Totals view shows real unlocked bag capacity"
```
