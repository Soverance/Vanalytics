# FFXI Animation System Design

## Overview

Add skeletal animation playback to the FFXI 3D model viewer. Characters and NPCs display a looping idle animation by default, with a UI to browse and play any animation from the game's DAT files. The rendering pipeline switches from pre-baked vertex transforms to GPU-skinned meshes, enabling per-frame bone updates.

## Data Source

Pre-seeded `animation-paths.json` (357 KB, 2,144 entries across 7 playable races) generated from AltanaView's `List/PC/{Race}/Action.csv` and `Motion.csv` files. Each entry maps an animation name + category to one or more ROM DAT paths. DAT files are read at runtime from the user's local FFXI installation via File System Access API.

Script: `scripts/generate-animation-paths.mjs` (re-runnable if upstream data updates).

## AnimationParser (new: `AnimationParser.ts`)

Parses 0x2B blocks from FFXI DAT files.

### Binary Format

**Header (DAT2BHeader2, 10 bytes):**

The reference C code (`TDWAnalysis.h`) defines the header with `#pragma pack(push,2)`. The `speed` field is a full `float` (4 bytes) despite the pack(2) directive — pack(2) only affects alignment padding, not field sizes. Total: 1+1+2+2+4 = 10 bytes.

| Offset | Type | Field | Description |
|--------|------|-------|-------------|
| 0x00 | uint8 | ver | Version |
| 0x01 | uint8 | nazo | Unknown |
| 0x02 | uint16 | element | Number of animated bones |
| 0x04 | uint16 | frame | Total frame count |
| 0x06 | float32 | speed | Playback speed multiplier |

**Per-bone descriptor (DAT2B, 84 bytes):**

21 fields × 4 bytes = 84 bytes per bone descriptor.

| Offset | Type | Field | Description |
|--------|------|-------|-------------|
| 0x00 | int32 | no | Bone index into skeleton |
| 0x04 | int32 | idx_qtx | Index into float[] pool for quat.x keyframes (0 = use default) |
| 0x08 | int32 | idx_qty | Index into float[] pool for quat.y keyframes |
| 0x0C | int32 | idx_qtz | Index into float[] pool for quat.z keyframes |
| 0x10 | int32 | idx_qtw | Index into float[] pool for quat.w keyframes |
| 0x14 | float32 | qtx | Default quaternion X |
| 0x18 | float32 | qty | Default quaternion Y |
| 0x1C | float32 | qtz | Default quaternion Z |
| 0x20 | float32 | qtw | Default quaternion W |
| 0x24 | int32 | idx_tx | Index for translation.x keyframes |
| 0x28 | int32 | idx_ty | Index for translation.y keyframes |
| 0x2C | int32 | idx_tz | Index for translation.z keyframes |
| 0x30 | float32 | tx | Default translation X |
| 0x34 | float32 | ty | Default translation Y |
| 0x38 | float32 | tz | Default translation Z |
| 0x3C | int32 | idx_sx | Index for scale.x keyframes |
| 0x40 | int32 | idx_sy | Index for scale.y keyframes |
| 0x44 | int32 | idx_sz | Index for scale.z keyframes |
| 0x48 | float32 | sx | Default scale X |
| 0x4C | float32 | sy | Default scale Y |
| 0x50 | float32 | sz | Default scale Z |

**Memory layout of 0x2B payload:**
```
[DAT2BHeader2 — 10 bytes]
[DAT2B[0] — 84 bytes]
[DAT2B[1] — 84 bytes]
...
[DAT2B[element-1] — 84 bytes]
[float[] keyframe pool — remaining bytes]
```

Keyframe pool start offset: `10 + element * 84`. The `idx_*` fields are absolute indices into a float[] view of the entire payload (starting at offset 0 of the payload, overlapping the header via a C union). For frame `j`, value is `pool[idx + j]`.

**Special flag:** `idx_qtx & 0x80000000` set = bone has no animation transform (skip).

**Keyframe pool:** Remaining bytes after all DAT2B structs are a flat `float[]`. Each `idx_*` is an absolute index — for frame `j`, value is `pool[idx + j]`.

### Output Types

```ts
interface ParsedAnimation {
  frameCount: number
  speed: number
  bones: AnimationBone[]
}

interface AnimationBone {
  boneIndex: number
  rotationKeyframes: Float32Array | null   // 4 floats per frame (qx,qy,qz,qw)
  rotationDefault: [number, number, number, number]
  translationKeyframes: Float32Array | null // 3 floats per frame
  translationDefault: [number, number, number]
  scaleKeyframes: Float32Array | null       // 3 floats per frame
  scaleDefault: [number, number, number]
}
```

### Entry Point

Separate from `parseDatFile`. Animation DATs contain only 0x2B blocks (no textures or meshes), so a dedicated function avoids unnecessary empty passes:

```ts
function parseAnimationDat(buffer: ArrayBuffer): ParsedAnimation[]
```

### Parsing Logic

1. Walk block chain looking for type 0x2B (same pattern as skeleton/mesh parsers)
2. Read 10-byte header (DAT2BHeader2)
3. Read `element` count of 84-byte DAT2B bone descriptors
4. Create a Float32Array view over the entire payload for keyframe pool access
5. For each bone: if `idx_qtx & 0x80000000` set, skip (no transform). Otherwise extract keyframe slices from pool using idx offsets.
6. Guard: if `frameCount <= 1`, treat as static pose (no interpolation needed, use defaults or single frame values).
7. A single DAT may contain multiple 0x2B blocks (3-section system). Return all as array.

## MeshParser Refactor — Skinned Rendering

### Current Behavior (removed)

MeshParser transforms every vertex by its bone matrix at parse time. `boneIndices` and `boneWeights` on `ParsedMesh` are always empty. Vertices are output in world space.

### New Behavior

Vertices stay in bone-local space. Bone assignments are preserved on the mesh for GPU skinning.

**`ParsedMesh` field changes:**
- `vertices` — bone-local positions (no longer multiplied by skeleton matrices)
- `normals` — bone-local normals
- `boneIndices` — `Uint8Array`, 4 indices per vertex (padded for Three.js skinning). MV1 = `[idx,0,0,0]`, MV2 = `[idxL,idxH,0,0]`
- `boneWeights` — `Float32Array`, 4 weights per vertex. MV1 = `[1,0,0,0]`, MV2 = `[w1,w2,0,0]`

**Face expansion (`expandFaces`) and bone data:**

The current pipeline produces non-indexed geometry — `expandFaces` duplicates vertex data per face corner. The refactored version must expand bone indices and weights in lockstep with positions/normals/UVs. Each face corner gets the bone data of its source vertex.

**Mirror/flip handling for GPU skinning:**

The current code applies mirror flags by negating matrix columns at transform time. With GPU skinning, the shader doesn't know about mirror flags. Solution: for mirrored halves, bake the mirror transform into a separate set of bind-pose inverse matrices stored on the skeleton. Each mirrored mesh gets its own `SkinnedMesh` with a skeleton whose bind matrices incorporate the mirror flag per bone. This keeps the standard skinning shader and avoids custom uniforms.

**What stays the same:**
- Texture parsing, UV mapping, material indices
- Weapon models (no skeleton) — output untransformed vertices, rendered as regular `Mesh`
- `expandFaces` function structure (but now also expands bone data)

### Rendering Pipeline Change

- Build `THREE.Skeleton` from `ParsedSkeleton` bones (bind-pose matrices)
- Create `SkinnedMesh` instead of `Mesh`, attach skeleton
- Bind-pose with no animation = identical visual to current pre-baked rendering
- One rendering path for all models (no dual mode)

## Animation Playback (`useAnimationPlayback` hook)

### Per-Frame Logic (useFrame)

1. Guard: if `frameCount <= 1`, apply static pose (defaults or single frame values) and return.
2. Compute frame: `frame = (elapsed * speed * 30) % (frameCount - 1)`
3. Integer frame `j = Math.floor(frame)`, fractional `n = frame - j` for interpolation
4. For each animated bone:
   - **Rotation:** Quaternion SLERP between `keyframes[j]` and `keyframes[j+1]`
   - **Translation:** Linear interpolation
   - **Scale:** Linear interpolation
5. Build motion matrix from interpolated values
6. Set `bone.matrix` (local transform) from motion matrix multiplied onto bind-pose local matrix
7. Call `skeleton.update()` — Three.js propagates hierarchy automatically using its own convention (`parent.matrixWorld * child.matrix`). We do NOT manually compute `matrixWorld`.

**Convention note:** The existing `SkeletonParser.ts` uses row-major `childLocal * parentWorld` multiplication. Three.js uses column-major `parent * child`. The playback hook operates in Three.js convention — set `bone.matrix`, let Three.js handle the rest.

### Multi-Section Blending

FFXI character animations split into 2-3 sections (upper body, lower body, additional). Each 0x2B block in a DAT targets different bone indices. Apply all sections — they naturally don't conflict. Each section loops independently at its own frame count. In practice, sections within a single DAT typically share the same frame count, but if they differ, each section wraps at its own `frameCount`.

### Playback State

```ts
interface PlaybackState {
  playing: boolean
  speed: number         // 0.25 to 2.0, default 1.0
  currentFrame: number  // for scrubber/display
  totalFrames: number
}
```

## Animation Loading

### Pipeline

1. Character loads on `CharacterDetailPage` → idle animation auto-loads. The "Battle" category's first entry contains the idle/combat stance DATs (the first DAT in a multi-path entry is typically the idle pose).
2. `animation-paths.json` fetched once, cached (same pattern as `model-dat-paths.json`)
3. `useAnimationDatPaths(raceId)` hook loads and groups animations by category for the picker
4. DAT file read via File System Access API → parse 0x2B blocks → feed to `useAnimationPlayback`
5. Animation swap: load new DAT, parse, replace in playback hook
6. **Caching:** Parsed animations are cached by DAT path (same pattern as `datCache` in `CharacterModel.tsx`) to avoid re-parsing when switching back to a previously loaded animation.

## UI: Animation Controls (`AnimationControls.tsx`)

Located below the 3D viewport on `CharacterDetailPage`.

```
┌─────────────────────────────────────────┐
│            3D Character Viewport        │
├─────────────────────────────────────────┤
│ [Category ▼] [Animation ▼]             │
│ [◀] [▶/⏸] [▶] ───────●────── 24/60    │
│                          Speed: [1.0x ▼]│
└─────────────────────────────────────────┘
```

- **Category dropdown:** Groups from `animation-paths.json` (Battle, Emote, Sword, Dagger, etc.)
- **Animation dropdown:** Filtered by selected category
- **Transport:** Play/pause toggle, frame step back/forward (when paused), scrubber bar, frame counter
- **Speed:** Dropdown (0.25x, 0.5x, 1.0x, 1.5x, 2.0x)
- **Default:** Idle animation, auto-playing, 1.0x speed

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/lib/ffxi-dat/AnimationParser.ts` | Parse 0x2B blocks → `ParsedAnimation[]` |
| `src/components/character/AnimationControls.tsx` | Transport bar + two-level animation picker |
| `src/hooks/useAnimationPlayback.ts` | `useFrame` loop driving skeleton bones per-frame |
| `src/hooks/useAnimationDatPaths.ts` | Load + cache `animation-paths.json`, group by category |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/ffxi-dat/types.ts` | Add `ParsedAnimation`, `AnimationBone` interfaces |
| `src/lib/ffxi-dat/MeshParser.ts` | Stop pre-baking transforms, populate `boneIndices`/`boneWeights` |
| `src/lib/ffxi-dat/DatFile.ts` | Add `BLOCK_ANIM = 0x2B` constant (for block identification), no parsing change — animations use dedicated `parseAnimationDat` entry point |
| `src/lib/ffxi-dat/index.ts` | Export new parser + types |
| `src/components/character/CharacterModel.tsx` | Build `THREE.Skeleton` + `SkinnedMesh`, wire up playback |
| `src/pages/CharacterDetailPage.tsx` | Add animation controls below viewport |

### Untouched Files

- `DatReader.ts`, `TextureParser.ts`, `SkeletonParser.ts` — no changes
- `ZoneFile.ts`, zone parsers — no changes
- `animation-paths.json` — already generated

## Risk Areas

- **MeshParser refactor** is highest risk — touches core rendering for all models. Bind-pose `SkinnedMesh` must match current pre-baked output exactly. Verify character models, NPC browser, and item model viewer all still render correctly after refactor.
- **NPC/Monster models** have embedded skeletons — must verify skinned path works for self-contained DATs too.
- **Mirror/flip with GPU skinning** — mirrored mesh halves need separate skeleton instances with baked mirror transforms. Verify mirrored geometry renders correctly (symmetric armor, shields, etc.).
- **0x2B header field sizes** — verify the 10-byte header against real DAT data by reading a known animation DAT and checking that `element`, `frame`, and `speed` produce sane values.
