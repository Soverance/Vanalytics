# Character Model Viewer — Design Spec

## Goal

Add a 3D character model viewer to Vanalytics that reads FFXI .DAT files from the user's local FFXI installation and renders their character with equipped gear in the browser. Users can rotate/zoom the model, swap equipment to preview different looks, and enter a fullscreen immersive mode.

## Constraints

- **No asset distribution.** All 3D models and textures are Square Enix property. We never store, serve, or transmit them. All parsing and rendering happens client-side, reading from the user's own FFXI installation via the File System Access API.
- **Chromium only.** The File System Access API is only available in Chrome, Edge, and Opera. Firefox and Safari users see a graceful fallback message.
- **Undocumented binary format.** FFXI's DAT file format is reverse-engineered, not officially documented. The parser will be built iteratively based on community C/C++ reference code (galkareeve, Maphesdus repositories). Expect edge cases and format variations.

## Architecture Overview

Five subsystems, each independently buildable:

1. **Data Layer** — New database fields and model ID mapping
2. **File System Access** — Browser-local directory access, IndexedDB handle persistence, settings integration
3. **DAT Parser** — TypeScript binary parser for FFXI model meshes, textures, and skeletons
4. **3D Renderer** — React Three Fiber scene with model compositing and orbit controls
5. **UI** — Equipment grid, swap modal, fullscreen mode, integration into character detail page

---

## 1. Data Layer

### Character Model Additions

Add to `Character` entity:
- `Race` — enum: Hume, Elvaan, Tarutaru, Mithra, Galka
- `Gender` — enum: Male, Female

Add to `SyncRequest`:
- `race` (string) — addon reads `get_player().race` (Windower race ID 1–8, maps to race+gender)
- `models` (object, optional) — model table from `get_mob_by_id(player.id).models`, keyed by slot index (1–9)

The addon already reads `get_player()`. Race ID mapping:
| ID | Race | Gender |
|----|------|--------|
| 1 | Hume | Male |
| 2 | Hume | Female |
| 3 | Elvaan | Male |
| 4 | Elvaan | Female |
| 5 | Tarutaru | Male |
| 6 | Tarutaru | Female |
| 7 | Mithra | Female |
| 8 | Galka | Male |

### Item-to-Model Mapping

New entity `ItemModelMapping`:
- `ItemId` (int, FK to GameItem)
- `SlotId` (int, equipment slot)
- `ModelId` (int, FFXI visual model ID)
- `Source` (enum: Static, Addon)
- Unique constraint on (ItemId, SlotId)

**Bootstrap:** Import initial mappings from Ashita4 Stylist XML data, reformatted into a JSON seed file owned by the Vanalytics project. This is a one-time import — we do not depend on the Stylist repository at runtime.

**Ongoing updates:** When the addon syncs, it includes model IDs per slot. The API upserts any new ItemId→ModelId mappings discovered, with `Source = Addon`. Over time, player syncs fill gaps in the static data.

### Model-to-DAT Path Resolution

Static JSON mapping file: `(ModelId, Race, Gender, Slot)` → ROM-relative DAT path (e.g., `ROM/28/7.dat`).

Bootstrapped from community documentation (galkareeve, AltanaView). Shipped as a static asset in the frontend — the browser uses it to resolve which DAT file to read for each equipment mesh.

### User Settings

Add `FfxiInstallPath` (nullable string) to user profile. Stored server-side for display in settings. The actual file access uses the browser-local IndexedDB handle, not this path.

---

## 2. File System Access

### Settings Page: "FFXI Installation" Section

- "Browse" button triggers `window.showDirectoryPicker()`
- Validates directory contains expected structure (`ROM/`, `ROM2/`, `VTABLE.DAT`)
- On success: stores `FileSystemDirectoryHandle` in IndexedDB, saves path string to profile via API
- Displays configured path with "Disconnect" option

### IndexedDB Handle Storage

`FfxiFileSystem` service class:
- `saveHandle(handle)` — stores in IndexedDB
- `getHandle()` — retrieves stored handle (or null)
- `requestAccess()` — calls `handle.requestPermission({mode: 'read'})`, returns boolean
- `readFile(relativePath)` — reads a DAT file, returns `ArrayBuffer`

### React Context: `FfxiFileSystemProvider`

Wraps IndexedDB logic in a React context. Exposes:
- `isConfigured` — IndexedDB has a stored handle
- `isAuthorized` — read permission is currently granted
- `path` — display path from profile settings
- `requestAccess()` — triggers permission prompt
- `readFile(path)` — reads a DAT file

Does NOT prompt automatically. Only checks existing permission status silently on mount.

### Viewer States

| State | Viewer Shows |
|-------|-------------|
| Browser unsupported | "3D model viewer requires Chrome or Edge" |
| Not configured | "Configure your FFXI installation in Settings to view 3D models" + link |
| Configured, no permission | "Click to connect to your FFXI installation" button |
| Configured + authorized | 3D viewer renders normally |

Permission prompts only appear when the user explicitly clicks a button on a page that contains a model viewer. Never unsolicited.

---

## 3. DAT Parser

TypeScript module at `src/lib/ffxi-dat/`.

### Module Structure

| File | Responsibility |
|------|---------------|
| `DatReader.ts` | Low-level binary reader wrapping `DataView`/`ArrayBuffer`. Endianness handling, typed reads (uint8/16/32, float32), seek/tell. |
| `MeshParser.ts` | Extracts mesh data from MMB sections: vertices (position, normal, UV, bone indices, bone weights), triangle strip indices, material references. Converts triangle strips to triangle lists. |
| `TextureParser.ts` | Decompresses DXT1 and DXT3 textures to RGBA pixel data. DXT1: 4:1 compression, no alpha. DXT3: 4:1 with 4-bit explicit alpha. Both operate on 4×4 pixel blocks. |
| `SkeletonParser.ts` | Extracts bone hierarchy: parent indices, rest-pose transforms (position, rotation). |
| `DatFile.ts` | Top-level orchestrator. Identifies DAT type by header signatures, delegates to appropriate parser. |
| `types.ts` | Shared interfaces: `ParsedMesh`, `ParsedTexture`, `ParsedSkeleton`, `Vertex`, etc. |

### Output Interfaces

```typescript
interface ParsedMesh {
  vertices: Float32Array     // x, y, z positions
  normals: Float32Array      // vertex normals
  uvs: Float32Array          // texture coordinates
  indices: Uint16Array       // triangle indices (strips already converted)
  boneIndices: Uint8Array    // 2 bone refs per vertex
  boneWeights: Float32Array  // 2 weights per vertex
  materialIndex: number      // which texture to apply
}

interface ParsedTexture {
  width: number
  height: number
  rgba: Uint8Array           // decompressed RGBA pixel data
}

interface ParsedSkeleton {
  bones: Array<{
    name: string
    parentIndex: number
    position: [number, number, number]
    rotation: [number, number, number, number]
  }>
}
```

### Development Approach

- Start with a single known DAT file (e.g., Hume Male body) and iterate until it parses correctly
- Build a debug view that dumps parsed vertex counts, texture dimensions, bone counts for verification
- Reference code: galkareeve/ffxi (C/C++) and Maphesdus/FFXI_Modding (C/C++) for binary format details
- Triangle strip → triangle list conversion: standard algorithm (every 3 consecutive indices, alternating winding)

### Performance

Typical mesh DAT: 50–500KB. Texture DAT: 16–256KB. A full character loads ~10 DATs (skeleton + 8–9 equipment meshes). Expected parse time: 100–300ms total in TypeScript — imperceptible to the user. If DXT decompression proves slow, that specific function can be extracted to a small WASM module later without rewriting the rest.

---

## 4. 3D Renderer

### Tech Stack

- `three` — 3D rendering engine
- `@react-three/fiber` — React bindings for Three.js (declarative scene as JSX)
- `@react-three/drei` — Common helpers (OrbitControls, lighting presets)

### Scene Composition: `CharacterScene.tsx`

- `<Canvas>` component containing the full 3D scene
- `OrbitControls`: click-drag to rotate, scroll to zoom, right-drag to pan
- Lighting: ambient light + directional light from above-front (warm tone, approximating FFXI in-game lighting)
- Subtle ground shadow for grounding the model
- Background: dark gradient matching the Vanalytics theme

### Model Compositing: `CharacterModel.tsx`

Loading sequence per character:
1. Load skeleton DAT → create `Three.Skeleton` with `Bone` hierarchy
2. For each visual slot (Head, Body, Hands, Legs, Feet, Main, Sub, Range):
   - Look up ModelId from `ItemModelMapping`
   - Resolve DAT path using `ModelDatMapping` for character's race/gender
   - Read DAT via `FfxiFileSystem.readFile()`
   - Parse with DAT parser
   - Create `Three.SkinnedMesh` bound to the shared skeleton
   - Create `Three.DataTexture` from parsed RGBA data

All slot meshes share the same skeleton so they move together.

### Slot Swapping

When equipment changes:
- Dispose the old mesh + texture for that slot
- Load and parse the new DAT
- Create new `SkinnedMesh` bound to existing skeleton
- Only the changed slot re-renders — rest of scene stays intact

### Caching

Parsed meshes cached in memory keyed by DAT path. Swapping back to a previously loaded item is instant (no re-parse, no file re-read).

### Performance

Typical FFXI character: ~5–10K polygons total across all slots. Trivially light for modern WebGL. The bottleneck is file I/O (File System Access API reads), not rendering.

---

## 5. UI Integration

### Character Detail Page (`/characters/:id`)

New layout (top section):
- **Left:** 3D model viewer canvas (flex: 1, ~440px min-height)
  - Orbit controls (drag to rotate, scroll to zoom)
  - Fullscreen button (top-right corner)
  - Loading skeleton shown while meshes parse
- **Right:** FFXI-style equipment grid (400px wide)
  - 4×4 grid matching in-game layout
  - Item icon (32×32) + slot label + item name per cell
  - Slots affecting the 3D model have distinct gold border
  - Click slot → opens swap modal
  - Hover slot → shows `ItemPreviewBox` tooltip (existing component)

Below the viewer/grid: existing Jobs and Crafting sections (unchanged).

### Equipment Grid Layout (4×4)

| Col 1 | Col 2 | Col 3 | Col 4 |
|-------|-------|-------|-------|
| Main | Sub | Range | Ammo |
| Head | Body | Hands | Ear1 |
| Legs | Feet | Neck | Ear2 |
| Waist | Back | Ring1 | Ring2 |

Visual slots (affect 3D model): Main, Sub, Range, Head, Body, Hands, Legs, Feet — gold border.
Non-visual slots (no model data): Ammo, Ear1, Ear2, Neck, Waist, Back, Ring1, Ring2 — subdued border.

### Equipment Swap Modal

Triggered by clicking any equipment slot:
- Modal header: "Swap {Slot} Equipment"
- Search input filtering the item database (scoped to that slot's item category)
- Scrollable item list with icon, name, iLevel, key stat
- Selecting an item updates the grid and triggers 3D mesh swap for visual slots
- Close via X button or clicking outside

### Fullscreen / Immersive Mode

- Triggered by the fullscreen button (⛶) in the viewer
- Uses the browser Fullscreen API (`element.requestFullscreen()`)
- The Three.js canvas resizes to fill the viewport — no scene reload, seamless transition
- ESC or close button exits fullscreen, returns to normal page layout
- Minimal overlay: character name (bottom-left), controls hint (bottom-right), ESC hint (top-left)

### File System Access States on Viewer

The viewer area handles all permission states inline (see Section 2 states table). No prompts appear anywhere else in the app.

---

## Addon Changes

Extend `vanalytics.lua` sync payload:

```lua
-- Add to build_sync_payload():
race = windower.ffxi.get_player().race,  -- int 1-8
models = get_model_table(player_id),      -- slot index → model ID
```

The `models` field is optional — older addon versions without this field still sync normally, they just don't contribute model ID mappings.

The API handles the new fields:
- `race` → parsed into Race + Gender enums, saved on Character
- `models` → cross-referenced with equipped item IDs to upsert `ItemModelMapping` rows

---

## Subsystem Dependencies

```
Data Layer ← (no dependencies, build first)
File System Access ← (no dependencies, build in parallel with Data Layer)
DAT Parser ← (no dependencies, build in parallel — core R&D)
3D Renderer ← DAT Parser, File System Access
UI ← 3D Renderer, Data Layer
Addon Changes ← Data Layer (API must accept new fields)
```

DAT Parser, Data Layer, and File System Access can all be built in parallel. The 3D Renderer integrates them. UI ties everything together.

---

## Out of Scope (Future)

- **Saved gear loadouts** — Users may want to save named equipment sets for quick preview. Deferred to a future iteration.
- **Animations** — FFXI DATs contain animation data. Rendering idle/walk/battle animations would be a significant addition. Deferred.
- **Public profile 3D viewer** — Showing the 3D model on public character profiles would require server-side rendering or pre-exported assets. Deferred.
- **Lockstyle support** — The addon could sync the lockstyle model table (visual overrides). Deferred until base viewer works.
- **Firefox/Safari support** — Would require an alternative file access method (e.g., drag-and-drop folder upload). Deferred.
