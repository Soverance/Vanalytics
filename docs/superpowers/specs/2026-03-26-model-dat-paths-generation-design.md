# Equipment Model DAT Path Generation Design

## Overview

Generate a complete `model-dat-paths.json` mapping file from AltanaView community data, replacing the current manually-assembled file that only covers ~50% of equipment models. The new file enables the 3D character viewer to render all equippable armor and weapons, fixing widespread "No model available" errors for AF, AF2, AF3, reforged, and many expansion equipment sets.

## Problem

The current `model-dat-paths.json` maps equipment model IDs to ROM DAT file paths for each race and slot combination. It was assembled from partial community data (AltanaView database and galkareeve research) and has significant gaps:

- **~50% coverage** — 297 out of 588 body models mapped for race 1
- **All AF1/AF2/AF3 body armors missing** — models 64-77 in LandSandBoat numbering (Gallant Surcoat, Valor Surcoat, Fighter's Lorica, etc.)
- **~291 missing body models** across expansion content
- Only uses `ROM/` paths — expansion ROM directories (ROM2/, ROM3/, etc.) absent
- Same gaps exist across all 8 races and all armor slots

This affects 35+ items for the PLD equipment line alone (Gallant/Valor/Caballarius sets across all 5 armor slots), and proportionally more across all jobs.

## Data Sources

### AltanaView CSVs (ROM path source)

Repository: `https://github.com/mynameisgonz/AltanaView` (already used by `generate-npc-paths.mjs` and `generate-animation-paths.mjs`)

Equipment model CSVs at `List/PC/{Race}/{Slot}.csv` for 8 race folders × 8 slot files (64 total):

| AltanaView Folder | Windower Race ID | Notes |
|---|---|---|
| HumeM | 1 | |
| HumeF | 2 | |
| ElvaanM | 3 | |
| ElvaanF | 4 | |
| Tarutaru | 5 | Shared M/F models |
| Tarutaru | 6 | Same CSV as race 5 |
| Mithra | 7 | |
| Galka | 8 | |

| AltanaView CSV | Slot ID | Slot Name |
|---|---|---|
| Head.csv | 2 | Head |
| Body.csv | 3 | Body |
| Hands.csv | 4 | Hands |
| Legs.csv | 5 | Legs |
| Feet.csv | 6 | Feet |
| Main.csv | 7 | Main |
| Sub.csv | 8 | Sub |
| Range.csv | 9 | Range |

**CSV format:** One line per visual model. `folder/file,DisplayName` (e.g., `131/35,Valor Surcoat (PLD AF2)`). Line index = AltanaView model index. ROM path derived as `ROM/{folder}/{file}.dat` (volume 1 default).

### LandSandBoat item_equipment.sql (model ID source)

URL: `https://raw.githubusercontent.com/LandSandBoat/server/base/sql/item_equipment.sql`

INSERT format: `(itemId,'name',level,ilevel,jobs,MId,shieldSize,scriptType,slot,rslot,rslotlook,su_level)`

The `MId` field is the game's authoritative visual model ID — what the server sends to the client and what the Windower addon reports via `mob.models[]`.

### Numbering Mismatch

For models 0-49, LandSandBoat MId = AltanaView CSV line index. For models 50+, they diverge:

| Item | LSB MId | AltanaView Index |
|---|---|---|
| Scorpion Harness | 34 | 34 |
| Tiger Jerkin | 50 | 70 |
| Hauberk | 58 | 77 |
| Fighter's Lorica (WAR AF1) | 64 | 50 |
| Gallant Surcoat (PLD AF1) | 76 | 56 |
| Valor Surcoat (PLD AF2) | 77 | 106 |
| Ogre Jerkin | 94 | 83 |
| Dalmatica | 107 | 96 |

The cross-reference is solved by name matching between item_equipment.sql item names and AltanaView CSV display names.

## Script Design

**File:** `scripts/generate-model-dat-paths.mjs`

**Run:** `node scripts/generate-model-dat-paths.mjs`

**Output:** `public/data/model-dat-paths.json`

### Pipeline

```
1. Fetch item_equipment.sql from LandSandBoat GitHub
2. Parse INSERT statements → Map<slotBitmask, Map<MId, Set<itemName>>>
3. For each race × slot (64 combinations):
   a. Fetch AltanaView CSV
   b. Parse lines → Array<{ avIndex, romPath, displayName }>
   c. For models 0-49: direct match (avIndex = MId)
   d. For models 50+: name cross-reference
   e. Include unmatched AV entries (skip if key conflicts with existing LSB MId)
   f. Log unmatched LSB MIds to stderr
4. Write model-dat-paths.json
5. Print coverage summary to stderr
```

### Slot Bitmask Mapping

Reuses the same mapping from `ItemSyncProvider.cs`:

```
1   → slot 7 (Main)
2   → slot 8 (Sub)
3   → slot 7 (Main+Sub → main)
4   → slot 9 (Range)
16  → slot 2 (Head)
32  → slot 3 (Body)
64  → slot 4 (Hands)
128 → slot 5 (Legs)
256 → slot 6 (Feet)
```

### Name Cross-Reference

Three tiers applied in order:

**Tier 1 — Direct index match (models 0-49):**
LSB MId = AltanaView line index. Verified empirically — all base game models match.

**Tier 2 — Name matching (models 50+):**
For each LSB MId, collect all item names that reference it from item_equipment.sql. Normalize both LSB and AltanaView names:
- Lowercase
- Strip underscores, dots, spaces, punctuation
- Remove `+1`/`+2`/`+3` suffixes
- Remove AF labels like `(PLD AF1)`, `(WAR AF2)`, etc.
- Expand known abbreviations: `vlr` → `valor`, `cab` → `caballarius`, `jstcorps` → `justaucorps`, etc.

Match normalized LSB item names against normalized AltanaView display names. Multiple LSB items share the same MId, giving multiple name candidates.

**Tier 3 — Manual overrides:**
The script supports an optional `scripts/model-id-overrides.json` file for edge cases that name matching can't resolve:

```json
{
  "3": { "77": 106 },
  "7": { "42": 88 }
}
```

Format: `{ "slotId": { "lsbMId": avIndex } }`. Applied per-slot (same override works for all races).

### AltanaView ROM Path Parsing

Same as existing `generate-npc-paths.mjs`:
- `28/8` → `ROM/28/8.dat` (volume 1 implied)
- Volume prefix if present: `2/folder/file` → `ROM2/folder/file.dat`

### Output Format

Same structure as today — no consumer code changes required:

```json
{
  "raceId:slotId": {
    "modelId": "ROM/folder/file.dat",
    ...
  }
}
```

Keyed by LSB MId (= game client model ID). For AltanaView-only entries (no LSB item uses that model), included using AV index as key only if it doesn't collide with an existing LSB MId entry.

## Consumer Code Changes

**None.** The output format is identical. All existing consumers work without modification:

- `FileTableResolver.ts` — `modelToPath()` same lookup
- `model-mappings.ts` — `useSlotDatPaths()` unchanged
- `ItemModelViewer.tsx` — same flow, more models resolve
- `item-model-mappings.json` — unchanged (uses LSB MIds)
- Windower addon sync — reports LSB-style model IDs, matches keys

## Validation

### Automated spot-checks (in script)

After generation, verify known mappings:

| LSB MId | Slot | Expected ROM Path | Item |
|---|---|---|---|
| 1 | 3 (Body) | ROM/28/8.dat | Leather Vest |
| 34 | 3 (Body) | matches current | Scorpion Harness |
| 76 | 3 (Body) | ROM/95/92.dat | Gallant Surcoat |
| 77 | 3 (Body) | ROM/131/35.dat | Valor Surcoat |

### Coverage regression check

Current coverage per race for body slot: 297 models. New file must have >= 297 (no regressions). Target: 370+.

### Manual verification

Load a character wearing Cab. Surcoat +1 in the model viewer and confirm the body armor renders correctly.

### Coverage summary (stderr)

```
Slot 2 (Head):  Race 1: 350/380 (92%)  Race 2: ...
Slot 3 (Body):  Race 1: 377/406 (93%)  Race 2: ...
...
Unmatched LSB MIds: [list with item names for manual review]
```
