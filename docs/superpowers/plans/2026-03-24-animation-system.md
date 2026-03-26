# FFXI Animation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add skeletal animation playback to the FFXI 3D model viewer with a full UI for browsing and playing character animations.

**Architecture:** New `AnimationParser.ts` reads 0x2B blocks from DAT files. `MeshParser.ts` is refactored to output bone-local vertices with skinning data instead of pre-baked world-space positions. `CharacterModel.tsx` switches to Three.js `SkinnedMesh` + `Skeleton` for GPU-driven bone transforms. A `useAnimationPlayback` hook drives per-frame bone updates via `useFrame`. Animation controls (category/animation picker + transport bar) sit below the 3D viewport.

**Tech Stack:** TypeScript, React Three Fiber, Three.js (SkinnedMesh/Skeleton/Bone), Vite

**Spec:** `docs/superpowers/specs/2026-03-24-animation-system-design.md`

**Note:** This project has no test framework. Verification is done by building (`npm run build`) and visual inspection in the browser. Each task includes specific visual verification steps.

**Known V1 Limitations:**
- **MV2 dual-bone vertices:** FFXI stores different positions per bone (x1,y1,z1 for bone L, x2,y2,z2 for bone H). Standard GPU skinning expects one position blended by multiple bones. V1 assigns MV2 vertices to their dominant bone (higher weight) using only that position. Joints will move rigidly instead of smoothly blending. A custom shader for full MV2 correctness is future work.
- **Mirrored meshes:** Meshes with `flip != 0` are pre-baked to world space at load time (same as current behavior) and won't animate. Full mirror support (baked mirror matrices on cloned skeletons) is future work.
- **NPC/Monster animations:** Not included in V1 seed data. The parser supports them, but `animation-paths.json` only covers PC races. NPC animations can be added later.

---

## File Map

All paths relative to `src/Vanalytics.Web/`.

### New Files
| File | Responsibility |
|------|---------------|
| `src/Vanalytics.Web/src/lib/ffxi-dat/AnimationParser.ts` | Parse 0x2B blocks → `ParsedAnimation[]` |
| `src/Vanalytics.Web/src/hooks/useAnimationPlayback.ts` | `useFrame` loop: SLERP/LERP bone transforms per frame |
| `src/Vanalytics.Web/src/hooks/useAnimationDatPaths.ts` | Load + cache `animation-paths.json`, group by category |
| `src/Vanalytics.Web/src/components/character/AnimationControls.tsx` | Two-level category/animation picker + transport bar |

### Modified Files
| File | Change |
|------|--------|
| `src/Vanalytics.Web/src/lib/ffxi-dat/types.ts` | Add `ParsedAnimation`, `AnimationBone` types |
| `src/lib/ffxi-dat/MeshParser.ts` | Output bone-local vertices + `boneIndices`/`boneWeights` |
| `src/lib/ffxi-dat/DatFile.ts` | Add `BLOCK_ANIM = 0x2B` constant |
| `src/lib/ffxi-dat/index.ts` | Export `parseAnimationDat` + new types |
| `src/components/character/CharacterModel.tsx` | `SkinnedMesh` + `Skeleton` + animation integration |
| `src/components/character/ModelViewer.tsx` | Pass animation state, render `AnimationControls` |
| `src/pages/CharacterDetailPage.tsx` | Wire animation state between `ModelViewer` and controls |

### Untouched Files
- `DatReader.ts`, `TextureParser.ts`, `SkeletonParser.ts`, `ZoneFile.ts`, zone parsers
- `animation-paths.json` (already generated)

---

## Task 1: Add Animation Types to `types.ts`

**Files:**
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/types.ts`

- [ ] **Step 1: Add ParsedAnimation and AnimationBone interfaces**

Add to the end of `types.ts`:

```ts
export interface AnimationBone {
  boneIndex: number
  rotationKeyframes: Float32Array | null   // 4 floats per frame (qx,qy,qz,qw), null = use default
  rotationDefault: [number, number, number, number]
  translationKeyframes: Float32Array | null // 3 floats per frame (tx,ty,tz), null = use default
  translationDefault: [number, number, number]
  scaleKeyframes: Float32Array | null       // 3 floats per frame (sx,sy,sz), null = use default
  scaleDefault: [number, number, number]
}

export interface ParsedAnimation {
  frameCount: number
  speed: number
  bones: AnimationBone[]
}
```

- [ ] **Step 2: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```
feat: add ParsedAnimation and AnimationBone types
```

---

## Task 2: Build AnimationParser

**Files:**
- Create: `src/Vanalytics.Web/src/lib/ffxi-dat/AnimationParser.ts`
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/DatFile.ts` (add BLOCK_ANIM constant)
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/index.ts` (export)

- [ ] **Step 1: Add BLOCK_ANIM constant to DatFile.ts**

Add after the existing block constants (line 9):

```ts
export const BLOCK_ANIM = 0x2B
```

- [ ] **Step 2: Create AnimationParser.ts**

The parser walks the block chain looking for 0x2B blocks. Each 0x2B block has:
- 10-byte header: ver(u8), nazo(u8), element(u16), frame(u16), speed(f32)
- `element` count of 84-byte DAT2B bone descriptors
- Remaining bytes = flat float[] keyframe pool

The `idx_*` fields in each DAT2B are absolute indices into a float[] view of the entire block payload (starting from the block data start, overlapping with the header via a C union pattern).

```ts
import { DatReader } from './DatReader'
import type { ParsedAnimation, AnimationBone } from './types'

const BLOCK_ANIM = 0x2B
const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8
const DAT2B_HEADER_SIZE = 10
const DAT2B_BONE_SIZE = 84

/**
 * Parse animation data from an FFXI DAT file containing 0x2B blocks.
 * Returns one ParsedAnimation per 0x2B block found (typically 1-3 per DAT
 * for the upper/lower/additional body sections).
 */
export function parseAnimationDat(buffer: ArrayBuffer): ParsedAnimation[] {
  const reader = new DatReader(buffer)
  const animations: ParsedAnimation[] = []

  let offset = 0
  while (offset < reader.length - DATHEAD_SIZE) {
    reader.seek(offset)
    reader.skip(4) // block name
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    const blockSize = nextUnits * 16

    if (type === BLOCK_ANIM) {
      try {
        const dataStart = offset + DATHEAD_SIZE + BLOCK_PADDING
        const dataLength = Math.max(0, blockSize - DATHEAD_SIZE - BLOCK_PADDING)
        const anim = parseAnimBlock(buffer, dataStart, dataLength)
        if (anim) animations.push(anim)
      } catch { /* skip malformed block */ }
    }

    if (nextUnits === 0) break
    offset += blockSize
    if (offset > reader.length) break
  }

  return animations
}

function parseAnimBlock(
  buffer: ArrayBuffer,
  dataStart: number,
  dataLength: number,
): ParsedAnimation | null {
  const reader = new DatReader(buffer)
  reader.seek(dataStart)

  // DAT2BHeader2: 10 bytes
  const _ver = reader.readUint8()
  const _nazo = reader.readUint8()
  const element = reader.readUint16()
  const frameCount = reader.readUint16()
  const speed = reader.readFloat32()

  if (element === 0 || frameCount === 0) return null
  if (element > 500) return null // sanity check

  // Create float view over entire block payload for keyframe pool access.
  // The idx_* fields are absolute indices into this view (C union pattern).
  // Use buffer.slice to ensure 4-byte alignment for Float32Array.
  const floatView = new Float32Array(
    buffer.slice(dataStart, dataStart + dataLength),
  )

  // Read DAT2B bone descriptors (84 bytes each)
  const bones: AnimationBone[] = []
  for (let i = 0; i < element; i++) {
    const boneOffset = dataStart + DAT2B_HEADER_SIZE + i * DAT2B_BONE_SIZE
    reader.seek(boneOffset)

    const boneIndex = reader.readInt32()

    // Rotation indices + defaults
    const idx_qtx = reader.readInt32()
    const idx_qty = reader.readInt32()
    const idx_qtz = reader.readInt32()
    const idx_qtw = reader.readInt32()
    const qtx = reader.readFloat32()
    const qty = reader.readFloat32()
    const qtz = reader.readFloat32()
    const qtw = reader.readFloat32()

    // Translation indices + defaults
    const idx_tx = reader.readInt32()
    const idx_ty = reader.readInt32()
    const idx_tz = reader.readInt32()
    const tx = reader.readFloat32()
    const ty = reader.readFloat32()
    const tz = reader.readFloat32()

    // Scale indices + defaults
    const idx_sx = reader.readInt32()
    const idx_sy = reader.readInt32()
    const idx_sz = reader.readInt32()
    const sx = reader.readFloat32()
    const sy = reader.readFloat32()
    const sz = reader.readFloat32()

    // Skip flag: high bit of idx_qtx means no animation for this bone
    if (idx_qtx & 0x80000000) continue

    // Extract keyframe arrays from the float pool
    const rotKf = extractRotationKeyframes(floatView, idx_qtx, idx_qty, idx_qtz, idx_qtw, frameCount)
    const transKf = extractTranslationKeyframes(floatView, idx_tx, idx_ty, idx_tz, frameCount)
    const scaleKf = extractScaleKeyframes(floatView, idx_sx, idx_sy, idx_sz, frameCount)

    bones.push({
      boneIndex,
      rotationKeyframes: rotKf,
      rotationDefault: [qtx, qty, qtz, qtw],
      translationKeyframes: transKf,
      translationDefault: [tx, ty, tz],
      scaleKeyframes: scaleKf,
      scaleDefault: [sx, sy, sz],
    })
  }

  return { frameCount, speed, bones }
}

/**
 * Extract rotation keyframes (4 floats per frame: qx,qy,qz,qw).
 * Returns null if all indices are 0 (use defaults).
 */
function extractRotationKeyframes(
  pool: Float32Array,
  idxX: number, idxY: number, idxZ: number, idxW: number,
  frameCount: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0 && idxW === 0) return null

  const kf = new Float32Array(frameCount * 4)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 4 + 0] = idxX > 0 && idxX + f < pool.length ? pool[idxX + f] : 0
    kf[f * 4 + 1] = idxY > 0 && idxY + f < pool.length ? pool[idxY + f] : 0
    kf[f * 4 + 2] = idxZ > 0 && idxZ + f < pool.length ? pool[idxZ + f] : 0
    kf[f * 4 + 3] = idxW > 0 && idxW + f < pool.length ? pool[idxW + f] : 1
  }
  return kf
}

function extractTranslationKeyframes(
  pool: Float32Array,
  idxX: number, idxY: number, idxZ: number,
  frameCount: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0) return null

  const kf = new Float32Array(frameCount * 3)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 3 + 0] = idxX > 0 && idxX + f < pool.length ? pool[idxX + f] : 0
    kf[f * 3 + 1] = idxY > 0 && idxY + f < pool.length ? pool[idxY + f] : 0
    kf[f * 3 + 2] = idxZ > 0 && idxZ + f < pool.length ? pool[idxZ + f] : 0
  }
  return kf
}

function extractScaleKeyframes(
  pool: Float32Array,
  idxX: number, idxY: number, idxZ: number,
  frameCount: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0) return null

  const kf = new Float32Array(frameCount * 3)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 3 + 0] = idxX > 0 && idxX + f < pool.length ? pool[idxX + f] : 1
    kf[f * 3 + 1] = idxY > 0 && idxY + f < pool.length ? pool[idxY + f] : 1
    kf[f * 3 + 2] = idxZ > 0 && idxZ + f < pool.length ? pool[idxZ + f] : 1
  }
  return kf
}
```

- [ ] **Step 3: Update index.ts exports**

Add to `index.ts`:

```ts
export { parseAnimationDat } from './AnimationParser'
export type { ParsedAnimation, AnimationBone } from './types'
```

- [ ] **Step 4: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```
feat: add AnimationParser for FFXI 0x2B animation blocks
```

---

## Task 3: Refactor MeshParser for Skinned Rendering

**Files:**
- Modify: `src/Vanalytics.Web/src/lib/ffxi-dat/MeshParser.ts`

This is the highest-risk task. The goal: when `skelMatrices` is provided, output bone-local vertices with `boneIndices`/`boneWeights` populated instead of pre-baked world-space positions. The `expandFaces` function must expand bone data in lockstep with vertex data.

- [ ] **Step 1: Add bone data to expandFaces**

Replace the `expandFaces` function. The new version takes per-vertex bone indices and weights arrays and expands them alongside positions/normals/UVs.

```ts
/** Expand face data into per-vertex arrays for Three.js (non-indexed) */
function expandFaces(
  rawVerts: RawVert[],
  faces: FaceUV[],
  reverseWinding: boolean,
  perVertexBoneIndices?: Uint8Array,  // 4 per raw vertex
  perVertexBoneWeights?: Float32Array, // 4 per raw vertex
): {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  boneIndices: Uint8Array
  boneWeights: Float32Array
} {
  const n = faces.length * 3
  const positions = new Float32Array(n * 3)
  const normals = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  const boneIndices = new Uint8Array(n * 4)
  const boneWeights = new Float32Array(n * 4)

  for (let f = 0; f < faces.length; f++) {
    const face = faces[f]
    const base = f * 3
    const fi = reverseWinding
      ? [face.i1, face.i3, face.i2]
      : [face.i1, face.i2, face.i3]
    const fu = reverseWinding
      ? [[face.u1, face.v1], [face.u3, face.v3], [face.u2, face.v2]]
      : [[face.u1, face.v1], [face.u2, face.v2], [face.u3, face.v3]]

    for (let v = 0; v < 3; v++) {
      const srcIdx = fi[v]
      const vert = rawVerts[srcIdx]
      if (!vert) continue
      const idx = base + v
      positions[idx * 3] = vert.x
      positions[idx * 3 + 1] = vert.y
      positions[idx * 3 + 2] = vert.z
      normals[idx * 3] = vert.nx
      normals[idx * 3 + 1] = vert.ny
      normals[idx * 3 + 2] = vert.nz
      uvs[idx * 2] = fu[v][0]
      uvs[idx * 2 + 1] = fu[v][1]

      if (perVertexBoneIndices && perVertexBoneWeights) {
        boneIndices[idx * 4] = perVertexBoneIndices[srcIdx * 4]
        boneIndices[idx * 4 + 1] = perVertexBoneIndices[srcIdx * 4 + 1]
        boneIndices[idx * 4 + 2] = perVertexBoneIndices[srcIdx * 4 + 2]
        boneIndices[idx * 4 + 3] = perVertexBoneIndices[srcIdx * 4 + 3]
        boneWeights[idx * 4] = perVertexBoneWeights[srcIdx * 4]
        boneWeights[idx * 4 + 1] = perVertexBoneWeights[srcIdx * 4 + 1]
        boneWeights[idx * 4 + 2] = perVertexBoneWeights[srcIdx * 4 + 2]
        boneWeights[idx * 4 + 3] = perVertexBoneWeights[srcIdx * 4 + 3]
      }
    }
  }

  return { positions, normals, uvs, boneIndices, boneWeights }
}
```

- [ ] **Step 2: Add function to build per-vertex bone arrays (no transform)**

Add a new function that assigns bone indices/weights without transforming positions. This replaces the `transformVertices` call when building skinned output.

```ts
/**
 * Build per-vertex bone index and weight arrays for GPU skinning.
 * Vertices stay in bone-local space — no matrix multiplication.
 */
function buildSkinningArrays(
  noB1: number, noB2: number,
  boneAssign: BoneAssign[],
  boneTbl: number[],
  isIndirect: boolean,
  flip: boolean,
): { boneIndices: Uint8Array; boneWeights: Float32Array } {
  const totalVerts = noB1 + noB2
  const boneIndices = new Uint8Array(totalVerts * 4)
  const boneWeights = new Float32Array(totalVerts * 4)

  // MV1 vertices: single bone, weight = 1.0
  for (let i = 0; i < noB1; i++) {
    if (i < boneAssign.length) {
      const b3 = boneAssign[i]
      const tblIdx = flip ? b3.rightL : b3.leftL
      const boneIdx = resolveBoneIdx(tblIdx, boneTbl, isIndirect)
      boneIndices[i * 4] = boneIdx
      boneWeights[i * 4] = 1.0
    }
  }

  // MV2 vertices: dual bone — assign to DOMINANT bone (higher weight).
  // FFXI stores different positions per bone (x1,y1,z1 / x2,y2,z2) which
  // is incompatible with standard GPU skinning. V1 uses dominant bone only.
  // Weights set later from MV2 w1/w2 data to determine which bone.
  for (let i = 0; i < noB2; i++) {
    const bIdx = noB1 + i
    if (bIdx < boneAssign.length) {
      const b3 = boneAssign[bIdx]
      const tblIdxL = flip ? b3.rightL : b3.leftL
      boneIndices[bIdx * 4] = resolveBoneIdx(tblIdxL, boneTbl, isIndirect)
      boneWeights[bIdx * 4] = 1.0 // dominant bone gets full weight
    }
  }

  return { boneIndices, boneWeights }
}
```

- [ ] **Step 3: Modify parseVertexBlock to output skinned data**

In the `skelMatrices` branch of `parseVertexBlock`, replace the `transformVertices` calls with `buildSkinningArrays`. Vertices stay bone-local. MV2 weights come from the vertex data.

The key changes to `parseVertexBlock`:
1. When `skelMatrices` is provided, call `buildSkinningArrays` instead of `transformVertices`
2. Build raw untransformed vertices (same as the no-skeleton path)
3. For MV2 vertices, set `boneWeights[bIdx*4]` = w1 and `boneWeights[bIdx*4+1]` = w2 from the MV2 data
4. Pass bone arrays to `expandFaces`
5. For mirrored half: call `buildSkinningArrays` with `flip=true`, same untransformed vertices

Replace the entire `if (!skelMatrices) { ... } else { ... }` block at the bottom of `parseVertexBlock` with:

```ts
  // Build untransformed raw vertices (bone-local space).
  // MV2 uses dominant bone's position (x1,y1,z1 = bone L position).
  // See "Known V1 Limitations" re: MV2 dual-position incompatibility.
  const rawVerts: RawVert[] = [
    ...mv1Data,
    ...mv2Data.map(s => ({ x: s.x1, y: s.y1, z: s.z1, nx: s.nx1, ny: s.ny1, nz: s.nz1 })),
  ]

  if (!skelMatrices) {
    // No skeleton — weapons, static props
    const { positions, normals, uvs } = expandFaces(rawVerts, faces, false)
    meshes.push({
      vertices: positions, normals, uvs,
      indices: new Uint16Array(positions.length / 3),
      boneIndices: new Uint8Array(0), boneWeights: new Float32Array(0),
      materialIndex,
    })
  } else {
    const isIndirect = !!(hdr.type & 0x80)

    // Original half — bone-local vertices with skinning data
    const skin = buildSkinningArrays(noB1, noB2, boneAssign, boneTbl, isIndirect, false)
    const orig = expandFaces(rawVerts, faces, false, skin.boneIndices, skin.boneWeights)
    meshes.push({
      vertices: orig.positions, normals: orig.normals, uvs: orig.uvs,
      indices: new Uint16Array(orig.positions.length / 3),
      boneIndices: orig.boneIndices, boneWeights: orig.boneWeights,
      materialIndex,
    })

    // Mirrored half — pre-baked to world space (V1: no animation for mirrors)
    // See "Known V1 Limitations" re: mirror support.
    if (hdr.flip !== 0) {
      const mirrorVerts = transformVertices(noB1, noB2, mv1Data, mv2Data, boneAssign, boneTbl, skelMatrices, true, isIndirect)
      const mirror = expandFaces(mirrorVerts, faces, true)
      meshes.push({
        vertices: mirror.positions, normals: mirror.normals, uvs: mirror.uvs,
        indices: new Uint16Array(mirror.positions.length / 3),
        boneIndices: new Uint8Array(0), boneWeights: new Float32Array(0),
        materialIndex,
      })
    }
  }
```

- [ ] **Step 4: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors. The `transformVertices` and `applyMirrorFlag` functions become unused — remove them.

- [ ] **Step 5: Verify no dead code**

`transformVertices` and `applyMirrorFlag` are still used for the mirrored mesh path (pre-baked). `mat4TransformPoint` import stays. No code to remove.

- [ ] **Step 6: Verify build again**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```
refactor: MeshParser outputs bone-local vertices with skinning data

Vertices are no longer pre-baked to world space. Instead, bone indices
and weights are preserved per-vertex for Three.js SkinnedMesh rendering.
```

---

## Task 4: Switch CharacterModel to SkinnedMesh + Skeleton

**Files:**
- Modify: `src/Vanalytics.Web/src/components/character/CharacterModel.tsx`

This task changes the rendering from `THREE.Mesh` to `THREE.SkinnedMesh` with a `THREE.Skeleton` built from the parsed bone data. In bind-pose (no animation), this should produce identical visual output to the previous pre-baked rendering.

- [ ] **Step 1: Add skeleton building helper**

Add a function that builds a Three.js Skeleton from `ParsedSkeleton`:

```ts
import type { ParsedSkeleton } from '../../lib/ffxi-dat'

function buildThreeSkeleton(skeleton: ParsedSkeleton): THREE.Skeleton {
  const bones: THREE.Bone[] = skeleton.bones.map(() => new THREE.Bone())

  // Set up parent hierarchy
  skeleton.bones.forEach((b, i) => {
    if (b.parentIndex >= 0 && b.parentIndex < bones.length) {
      bones[b.parentIndex].add(bones[i])
    }
  })

  // Set local transforms from bind pose
  skeleton.bones.forEach((b, i) => {
    const bone = bones[i]
    bone.position.set(b.position[0], b.position[1], b.position[2])
    bone.quaternion.set(b.rotation[0], b.rotation[1], b.rotation[2], b.rotation[3])
    bone.updateMatrix()
  })

  // Compute world matrices
  const rootBones = bones.filter((_, i) => skeleton.bones[i].parentIndex < 0)
  rootBones.forEach(b => b.updateWorldMatrix(false, true))

  // Build bind matrices (inverse of world-space bind pose)
  const bindMatrices = bones.map(bone => {
    return new THREE.Matrix4().copy(bone.matrixWorld).invert()
  })

  return new THREE.Skeleton(bones, bindMatrices)
}
```

- [ ] **Step 2: Refactor loadSlot to create SkinnedMesh when bone data is present**

In the `loadSlot` function, check if `mesh.boneIndices.length > 0`. If so, create a `THREE.SkinnedMesh` with the skeleton's bones bound. Otherwise, create a regular `THREE.Mesh` (weapons, static props).

Replace the mesh creation block inside `loadSlot` (the `parsed.meshes.map(...)` section):

```ts
        const threeMeshes = parsed.meshes.map((mesh) => {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
          geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2))

          let material: THREE.Material
          const tex = parsed!.textures[mesh.materialIndex]
          if (tex) {
            const rgba = new Uint8Array(tex.rgba)
            const texture = new THREE.DataTexture(rgba, tex.width, tex.height, THREE.RGBAFormat)
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.needsUpdate = true
            texture.magFilter = THREE.LinearFilter
            texture.minFilter = THREE.LinearMipmapLinearFilter
            texture.generateMipmaps = true
            material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
          } else {
            material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide })
          }

          // If mesh has bone data, create SkinnedMesh.
          // Each SkinnedMesh needs its own skeleton clone (Three.js
          // requires exclusive parent for root bone).
          if (mesh.boneIndices.length > 0 && threeSkeleton) {
            geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(
              new Uint16Array(mesh.boneIndices), 4))
            geometry.setAttribute('skinWeight', new THREE.BufferAttribute(mesh.boneWeights, 4))
            const clonedSkel = threeSkeleton.clone()
            const skinned = new THREE.SkinnedMesh(geometry, material)
            skinned.add(clonedSkel.bones[0]) // attach cloned root bone
            skinned.bind(clonedSkel)
            return skinned as THREE.Mesh
          }

          return new THREE.Mesh(geometry, material)
        })
```

- [ ] **Step 3: Store skeleton and pass to loadSlot**

Modify `loadSkeleton` to also build and cache the Three.js Skeleton. Modify `loadSlot` to accept it.

Change the skeleton cache type and loading:

```ts
const skeletonCache = new Map<string, { matrices: number[][] | null; parsed: ParsedSkeleton | null }>()

// In loadSkeleton:
async function loadSkeleton(): Promise<{ matrices: number[][] | null; threeSkeleton: THREE.Skeleton | null; parsed: ParsedSkeleton | null }> {
  const raceId = toRaceId(race, gender)
  if (!raceId) return { matrices: null, threeSkeleton: null, parsed: null }

  const skelPath = SKELETON_PATHS[raceId]
  if (!skelPath) return { matrices: null, threeSkeleton: null, parsed: null }

  const cached = skeletonCache.get(skelPath)
  if (cached !== undefined) {
    const threeSkel = cached.parsed ? buildThreeSkeleton(cached.parsed) : null
    return { matrices: cached.matrices, threeSkeleton: threeSkel, parsed: cached.parsed }
  }

  try {
    const buffer = await readFile(skelPath)
    const skeleton = parseSkeletonDat(buffer)
    const matrices = skeleton?.matrices ?? null
    skeletonCache.set(skelPath, { matrices, parsed: skeleton })
    const threeSkel = skeleton ? buildThreeSkeleton(skeleton) : null
    return { matrices, threeSkeleton: threeSkel, parsed: skeleton }
  } catch {
    skeletonCache.set(skelPath, { matrices: null, parsed: null })
    return { matrices: null, threeSkeleton: null, parsed: null }
  }
}
```

Update `loadAll`:
```ts
async function loadAll() {
  const { matrices, threeSkeleton } = await loadSkeleton()
  if (cancelled) return
  slots.forEach(slot => loadSlot(slot, matrices, threeSkeleton))
}
```

Update `loadSlot` signature to accept optional external skeleton. For NPC/Monster DATs with embedded skeletons, build a Three.js Skeleton from the parsed DAT's embedded skeleton:

```ts
async function loadSlot(slot: SlotModel, skelMatrices: number[][] | null, threeSkeleton: THREE.Skeleton | null) {
  // ... inside loadSlot, after parseDatFile:
  // If no external skeleton but DAT has embedded one (NPC/Monster), build it
  let effectiveSkeleton = threeSkeleton
  if (!effectiveSkeleton && parsed.skeleton) {
    effectiveSkeleton = buildThreeSkeleton(parsed.skeleton)
  }
  // Use effectiveSkeleton for SkinnedMesh creation below
```

Note: `parseDatFile` already returns `skeleton: ParsedSkeleton | null` in its result — the `ParsedDatFile` interface already has this field.

- [ ] **Step 4: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Visual verification**

Run: `cd src/Vanalytics.Web && npm run dev`

Navigate to a character detail page with FFXI directory connected. The character model should render in the same bind-pose as before — standing upright, all equipment visible, correct orientation. If the model looks distorted, broken, or invisible, the skeleton bind matrices or skinning indices are wrong.

**Check:**
- Character renders in correct position and orientation
- All equipment slots visible
- NPC browser models still render (embedded skeleton path)
- Item model viewer still works (no skeleton = regular Mesh)

Also update the cleanup `useEffect` to dispose skeletons:
```ts
// In the disposal effect, add skeleton disposal:
if (mesh instanceof THREE.SkinnedMesh) {
  mesh.skeleton?.dispose() // frees bone texture
}
```

- [ ] **Step 6: Commit**

```
refactor: switch CharacterModel to SkinnedMesh with Three.js Skeleton

Characters now render via GPU skinning. In bind-pose (no animation),
visual output is identical to previous pre-baked rendering.
```

---

## Task 5: Create useAnimationDatPaths Hook

**Files:**
- Create: `src/Vanalytics.Web/src/hooks/useAnimationDatPaths.ts`

- [ ] **Step 1: Create hooks directory and the hook file**

```ts
import { useState, useEffect } from 'react'

interface AnimationEntry {
  name: string
  category: string
  paths: string[]
}

interface AnimationGroup {
  category: string
  animations: AnimationEntry[]
}

let cachedData: Record<string, AnimationEntry[]> | null = null

export function useAnimationDatPaths(raceId: number | null): {
  groups: AnimationGroup[]
  loading: boolean
} {
  const [groups, setGroups] = useState<AnimationGroup[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!raceId) {
      setGroups([])
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)

      if (!cachedData) {
        try {
          const res = await fetch('/data/animation-paths.json')
          cachedData = await res.json()
        } catch {
          setLoading(false)
          return
        }
      }

      if (cancelled) return

      const raceAnims = cachedData![String(raceId)] ?? []

      // Group by category, preserving order of first appearance
      const categoryOrder: string[] = []
      const categoryMap = new Map<string, AnimationEntry[]>()

      for (const entry of raceAnims) {
        if (!categoryMap.has(entry.category)) {
          categoryOrder.push(entry.category)
          categoryMap.set(entry.category, [])
        }
        categoryMap.get(entry.category)!.push(entry)
      }

      const result = categoryOrder.map(cat => ({
        category: cat,
        animations: categoryMap.get(cat)!,
      }))

      if (!cancelled) {
        setGroups(result)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [raceId])

  return { groups, loading }
}
```

- [ ] **Step 2: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```
feat: add useAnimationDatPaths hook for loading animation seed data
```

---

## Task 6: Create useAnimationPlayback Hook

**Files:**
- Create: `src/Vanalytics.Web/src/hooks/useAnimationPlayback.ts`

This hook drives per-frame bone updates using React Three Fiber's `useFrame`. It takes parsed animations and a Three.js Skeleton, and interpolates bone transforms each frame.

- [ ] **Step 1: Create the hook**

```ts
import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ParsedAnimation } from '../lib/ffxi-dat/types'

interface PlaybackState {
  playing: boolean
  speed: number
  currentFrame: number
  totalFrames: number
}

interface UseAnimationPlaybackOptions {
  animations: ParsedAnimation[]
  skeleton: THREE.Skeleton | null
  bindPose: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> | null
  playing: boolean
  speed: number
  onFrameUpdate?: (frame: number, total: number) => void
}

const _quatA = new THREE.Quaternion()
const _quatB = new THREE.Quaternion()
const _quatResult = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()

export function useAnimationPlayback({
  animations,
  skeleton,
  bindPose,
  playing,
  speed,
  onFrameUpdate,
}: UseAnimationPlaybackOptions) {
  const elapsedRef = useRef(0)

  useFrame((_, delta) => {
    if (!skeleton || !bindPose || animations.length === 0) return

    if (playing) {
      elapsedRef.current += delta * speed
    }

    const bones = skeleton.bones

    // Reset all bones to bind pose
    for (let i = 0; i < bones.length && i < bindPose.length; i++) {
      bones[i].position.copy(bindPose[i].position)
      bones[i].quaternion.copy(bindPose[i].quaternion)
      bones[i].scale.set(1, 1, 1)
    }

    // Apply each animation section (upper body, lower body, etc.)
    for (const anim of animations) {

      // Static pose: apply defaults directly, no interpolation
      if (anim.frameCount <= 1) {
        for (const ab of anim.bones) {
          if (ab.boneIndex < 0 || ab.boneIndex >= bones.length) continue
          const bone = bones[ab.boneIndex]
          _quatResult.set(ab.rotationDefault[0], ab.rotationDefault[1], ab.rotationDefault[2], ab.rotationDefault[3])
          bone.quaternion.multiply(_quatResult)
          bone.position.add(_pos.set(ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2]))
          bone.scale.multiply(_scale.set(ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2]))
        }
        continue
      }

      const totalFrames = anim.frameCount - 1
      const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
      const j = Math.floor(frame)
      const n = frame - j
      const j1 = Math.min(j + 1, totalFrames)

      for (const ab of anim.bones) {
        if (ab.boneIndex < 0 || ab.boneIndex >= bones.length) continue
        const bone = bones[ab.boneIndex]

        // Rotation: SLERP
        if (ab.rotationKeyframes) {
          const kf = ab.rotationKeyframes
          _quatA.set(kf[j * 4], kf[j * 4 + 1], kf[j * 4 + 2], kf[j * 4 + 3])
          _quatB.set(kf[j1 * 4], kf[j1 * 4 + 1], kf[j1 * 4 + 2], kf[j1 * 4 + 3])
          _quatResult.slerpQuaternions(_quatA, _quatB, n)
          bone.quaternion.multiply(_quatResult)
        } else {
          _quatResult.set(
            ab.rotationDefault[0], ab.rotationDefault[1],
            ab.rotationDefault[2], ab.rotationDefault[3],
          )
          bone.quaternion.multiply(_quatResult)
        }

        // Translation: LERP
        if (ab.translationKeyframes) {
          const kf = ab.translationKeyframes
          _pos.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
          bone.position.add(_pos)
        } else {
          bone.position.add(_pos.set(
            ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2],
          ))
        }

        // Scale: LERP
        if (ab.scaleKeyframes) {
          const kf = ab.scaleKeyframes
          _scale.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
          bone.scale.multiply(_scale)
        } else {
          bone.scale.multiply(_scale.set(
            ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2],
          ))
        }
      }
    }

    // Let Three.js propagate the bone hierarchy and update bind matrices.
    // skeleton.update() computes matrixWorld for all bones from their
    // local matrix, then multiplies by the inverse bind matrices.
    skeleton.update()

    // Report frame for UI
    if (animations.length > 0 && onFrameUpdate) {
      const anim = animations[0]
      const totalFrames = Math.max(1, anim.frameCount - 1)
      const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
      onFrameUpdate(Math.floor(frame), anim.frameCount)
    }
  })

  const seekToFrame = useCallback((frame: number) => {
    if (animations.length === 0) return
    const anim = animations[0]
    elapsedRef.current = frame / (anim.speed * 30)
  }, [animations])

  return { seekToFrame }
}
```

- [ ] **Step 2: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```
feat: add useAnimationPlayback hook for per-frame bone animation
```

---

## Task 7: Create AnimationControls Component

**Files:**
- Create: `src/Vanalytics.Web/src/components/character/AnimationControls.tsx`

- [ ] **Step 1: Create the component**

Two-level category/animation picker + transport bar (play/pause, frame step, scrubber, speed).

```tsx
import { useState, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'

interface AnimationGroup {
  category: string
  animations: Array<{ name: string; category: string; paths: string[] }>
}

interface AnimationControlsProps {
  groups: AnimationGroup[]
  loading: boolean
  currentFrame: number
  totalFrames: number
  playing: boolean
  speed: number
  onAnimationSelect: (paths: string[]) => void
  onPlayPause: () => void
  onSpeedChange: (speed: number) => void
  onSeek: (frame: number) => void
  onStepBack: () => void
  onStepForward: () => void
}

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 1.5, 2.0]

export default function AnimationControls({
  groups, loading, currentFrame, totalFrames,
  playing, speed,
  onAnimationSelect, onPlayPause, onSpeedChange, onSeek,
  onStepBack, onStepForward,
}: AnimationControlsProps) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedAnimIndex, setSelectedAnimIndex] = useState(0)

  // Auto-select "Battle" category (contains idle animation) or first category
  useEffect(() => {
    if (groups.length > 0 && !selectedCategory) {
      const battle = groups.find(g => g.category === 'Battle')
      setSelectedCategory(battle ? battle.category : groups[0].category)
    }
  }, [groups, selectedCategory])

  // Auto-select first animation and fire callback when category changes
  useEffect(() => {
    const group = groups.find(g => g.category === selectedCategory)
    if (group && group.animations.length > 0) {
      setSelectedAnimIndex(0)
      onAnimationSelect(group.animations[0].paths)
    }
  }, [selectedCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentGroup = groups.find(g => g.category === selectedCategory)
  const animations = currentGroup?.animations ?? []

  const handleAnimChange = (idx: number) => {
    setSelectedAnimIndex(idx)
    if (animations[idx]) {
      onAnimationSelect(animations[idx].paths)
    }
  }

  if (loading) return <div className="text-xs text-gray-500 p-2">Loading animations...</div>
  if (groups.length === 0) return null

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-b-md px-3 py-2 space-y-2">
      {/* Category + Animation pickers */}
      <div className="flex gap-2">
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 flex-1"
        >
          {groups.map(g => (
            <option key={g.category} value={g.category}>{g.category}</option>
          ))}
        </select>
        <select
          value={selectedAnimIndex}
          onChange={e => handleAnimChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 flex-[2]"
        >
          {animations.map((a, i) => (
            <option key={i} value={i}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2">
        <button onClick={onStepBack} className="p-1 text-gray-400 hover:text-gray-200" title="Step back">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={onPlayPause} className="p-1 text-gray-400 hover:text-gray-200" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button onClick={onStepForward} className="p-1 text-gray-400 hover:text-gray-200" title="Step forward">
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={Math.max(1, totalFrames - 1)}
          value={currentFrame}
          onChange={e => onSeek(Number(e.target.value))}
          className="flex-1 h-1 accent-blue-500"
        />

        {/* Frame counter */}
        <span className="text-xs text-gray-400 w-16 text-right tabular-nums">
          {currentFrame}/{totalFrames}
        </span>

        {/* Speed */}
        <select
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-300"
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```
feat: add AnimationControls component with category picker and transport
```

---

## Task 8: Wire Animation System into ModelViewer + CharacterModel

**Files:**
- Modify: `src/Vanalytics.Web/src/components/character/CharacterModel.tsx`
- Modify: `src/Vanalytics.Web/src/components/character/ModelViewer.tsx`
- Modify: `src/Vanalytics.Web/src/pages/CharacterDetailPage.tsx`

This is the integration task. CharacterModel gets animation loading + playback. ModelViewer renders AnimationControls. CharacterDetailPage manages animation state.

- [ ] **Step 1: Add animation loading to CharacterModel**

Add to CharacterModel props:
```ts
interface CharacterModelProps {
  race?: string
  gender?: string
  slots: SlotModel[]
  animationPaths?: string[]       // DAT paths for current animation
  animationPlaying?: boolean
  animationSpeed?: number
  onAnimationFrame?: (frame: number, total: number) => void
  onSlotLoaded?: (slotId: number) => void
  onError?: (slotId: number, error: string) => void
}
```

Inside the component, add animation loading and playback:

```ts
import { parseAnimationDat } from '../../lib/ffxi-dat'
import type { ParsedAnimation } from '../../lib/ffxi-dat/types'
import { useAnimationPlayback } from '../../hooks/useAnimationPlayback'

const animCache = new Map<string, ParsedAnimation[]>()

// Inside the component:
const [animations, setAnimations] = useState<ParsedAnimation[]>([])
const [bindPose, setBindPose] = useState<Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> | null>(null)
const [currentSkeleton, setCurrentSkeleton] = useState<THREE.Skeleton | null>(null)

// Load animation DATs when animationPaths changes
useEffect(() => {
  if (!animationPaths || animationPaths.length === 0) {
    setAnimations([])
    return
  }

  let cancelled = false

  async function loadAnims() {
    const allAnims: ParsedAnimation[] = []
    for (const path of animationPaths!) {
      const cacheKey = `anim:${path}`
      let cached = animCache.get(cacheKey)
      if (!cached) {
        try {
          const buffer = await readFile(path)
          cached = parseAnimationDat(buffer)
          animCache.set(cacheKey, cached)
        } catch { continue }
      }
      allAnims.push(...cached)
    }
    if (!cancelled) setAnimations(allAnims)
  }

  loadAnims()
  return () => { cancelled = true }
}, [animationPaths, readFile])

// Store bind pose when skeleton is built
// (In loadSkeleton, after building threeSkeleton, save bind pose)

// Animation playback
const { seekToFrame } = useAnimationPlayback({
  animations,
  skeleton: currentSkeleton,
  bindPose,
  playing: animationPlaying ?? false,
  speed: animationSpeed ?? 1.0,
  onFrameUpdate: onAnimationFrame,
})
```

Store bind pose and skeleton when skeleton loads — after `buildThreeSkeleton`, save:
```ts
const bp = threeSkel.bones.map(b => ({
  position: b.position.clone(),
  quaternion: b.quaternion.clone(),
}))
if (!cancelled) {
  setBindPose(bp)
  setCurrentSkeleton(threeSkel)
}
```

- [ ] **Step 2: Update ModelViewer to show AnimationControls**

Add animation state and pass it through:

```ts
import AnimationControls from './AnimationControls'
import { useAnimationDatPaths } from '../../hooks/useAnimationDatPaths'
import { toRaceId } from '../../lib/model-mappings'

// Inside ModelViewer, add:
interface ModelViewerProps {
  race?: string
  gender?: string
  gear: GearEntry[]
  slotDatPaths: Map<string, string>
  onRequestFullscreen?: () => void
}

// In the component body:
const raceId = toRaceId(race, gender)
const { groups, loading: animLoading } = useAnimationDatPaths(raceId ?? null)
const [animPaths, setAnimPaths] = useState<string[]>([])
const [animPlaying, setAnimPlaying] = useState(true)
const [animSpeed, setAnimSpeed] = useState(1.0)
const [animFrame, setAnimFrame] = useState(0)
const [animTotal, setAnimTotal] = useState(0)
const seekRef = useRef<((frame: number) => void) | null>(null)
```

Pass animation props to `CharacterModel`:
```tsx
<CharacterModel
  race={race} gender={gender} slots={slots}
  animationPaths={animPaths}
  animationPlaying={animPlaying}
  animationSpeed={animSpeed}
  onAnimationFrame={(f, t) => { setAnimFrame(f); setAnimTotal(t) }}
  onSlotLoaded={...}
/>
```

Render AnimationControls below the CharacterScene:
```tsx
<AnimationControls
  groups={groups}
  loading={animLoading}
  currentFrame={animFrame}
  totalFrames={animTotal}
  playing={animPlaying}
  speed={animSpeed}
  onAnimationSelect={setAnimPaths}
  onPlayPause={() => setAnimPlaying(p => !p)}
  onSpeedChange={setAnimSpeed}
  onSeek={(f) => seekRef.current?.(f)}
  onStepBack={() => seekRef.current?.(Math.max(0, animFrame - 1))}
  onStepForward={() => seekRef.current?.(Math.min(animTotal - 1, animFrame + 1))}
/>
```

- [ ] **Step 3: Verify build**

Run: `cd src/Vanalytics.Web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Full visual verification**

Run: `cd src/Vanalytics.Web && npm run dev`

Navigate to character detail page. Verify:
1. Character renders in bind pose initially
2. Animation controls appear below viewport
3. Categories populate from seed data
4. Selecting an animation loads and plays it
5. Play/pause works
6. Speed control works
7. Scrubber shows frame progress
8. Frame step works when paused
9. Switching categories resets animation selection
10. NPC browser still works (no animations, bind pose only)

- [ ] **Step 5: Commit**

```
feat: integrate animation system into character model viewer

Animation controls below viewport with category/animation picker,
play/pause, speed control, and frame scrubber. Idle animation
auto-plays on page load.
```

---

## Task 9: Polish and Edge Cases

**Files:**
- Various files from previous tasks

- [ ] **Step 1: Handle missing FFXI directory gracefully**

AnimationControls should not render when FFXI directory is not connected. The controls already depend on `groups` being populated, which requires `raceId` — but verify that no errors appear in console when FFXI dir is disconnected.

- [ ] **Step 2: Handle animation DATs that fail to load**

If a DAT path from animation-paths.json doesn't exist on the user's install (e.g., expansion not installed), the animation load should fail silently and the controls should remain functional. Verify this works — the `try/catch` in the animation loading loop should handle it.

- [ ] **Step 3: Verify Tarutaru Female (race 6)**

Race 6 is not in animation-paths.json (shares race 5's skeleton and animations). In `useAnimationDatPaths`, if raceId is 6, fall back to race 5's data:

```ts
// In useAnimationDatPaths, after getting raceAnims:
const lookupId = raceId === 6 ? 5 : raceId
const raceAnims = cachedData![String(lookupId)] ?? []
```

- [ ] **Step 4: Full production build verification**

Run: `cd src/Vanalytics.Web && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```
fix: handle Taru Female race alias and animation loading edge cases
```
