import { DatReader } from './DatReader'
import { mat4TransformPoint } from './SkeletonParser'
import type { ParsedMesh } from './types'

/**
 * Apply a mirror matrix to a 4x4 bone matrix.
 * flg=1: mirror X, flg=2: mirror Y, flg=3: mirror Z
 * Returns a new matrix = M * mirrorMatrix
 */
function applyMirrorFlag(m: number[], flg: number): number[] {
  const result = [...m]
  if (flg === 1) {
    // Negate X column: columns 0,1,2,3 row 0
    result[0] = -m[0]; result[1] = -m[1]; result[2] = -m[2]; result[3] = -m[3]
  } else if (flg === 2) {
    // Negate Y column: columns 0,1,2,3 row 1
    result[4] = -m[4]; result[5] = -m[5]; result[6] = -m[6]; result[7] = -m[7]
  } else if (flg === 3) {
    // Negate Z column: columns 0,1,2,3 row 2
    result[8] = -m[8]; result[9] = -m[9]; result[10] = -m[10]; result[11] = -m[11]
  }
  return result
}

/**
 * Convert a triangle strip index array to a triangle list.
 * Every 3 consecutive indices form a triangle, with alternating winding.
 * Degenerate triangles (used as strip separators) are skipped.
 */
export function triangleStripToList(stripIndices: number[]): number[] {
  const triangles: number[] = []
  for (let i = 0; i < stripIndices.length - 2; i++) {
    const a = stripIndices[i], b = stripIndices[i + 1], c = stripIndices[i + 2]
    if (a === b || b === c || a === c) continue
    if (i % 2 === 0) triangles.push(a, b, c)
    else triangles.push(a, c, b)
  }
  return triangles
}

/**
 * TEXLIST: 30-byte face entry in polygon data.
 * Each entry defines one triangle with vertex indices and per-vertex UVs.
 *   i1(2) i2(2) i3(2) u1(4) v1(4) u2(4) v2(4) u3(4) v3(4) = 30 bytes
 */
interface FaceUV {
  i1: number; i2: number; i3: number
  u1: number; v1: number
  u2: number; v2: number
  u3: number; v3: number
}

/**
 * DAT2AHeader: 64-byte header at the start of a Vertex block (type 0x2A).
 * All offsets are in 2-byte (WORD) units relative to the header start.
 *
 * Reference: TDWAnalysis.h DAT2AHeader struct (packed to 2-byte alignment)
 */
interface Dat2AHeader {
  ver: number          // 0x00 uint8
  nazo: number         // 0x01 uint8
  type: number         // 0x02 uint16 — bit 7 = isIndirect bone access
  flip: number         // 0x04 uint16
  offsetPoly: number   // 0x06 uint32 — polygon commands (in WORDs)
  polySuu: number      // 0x0A uint16 — polygon data size (in WORDs)
  offsetBoneTbl: number // 0x0C uint32
  boneTblSuu: number   // 0x10 uint16
  offsetWeight: number // 0x12 uint32
  weightSuu: number    // 0x16 uint16
  offsetBone: number   // 0x18 uint32
  boneSuu: number      // 0x1C uint16
  offsetVertex: number // 0x1E uint32 — vertex data (in WORDs)
  vertexSuu: number    // 0x22 uint16 — vertex data size (in WORDs, NOT vertex count)
  offsetPolyLoad: number // 0x24 uint32
  polyLoadSuu: number  // 0x28 uint16
}

function readDat2AHeader(reader: DatReader): Dat2AHeader {
  return {
    ver: reader.readUint8(),
    nazo: reader.readUint8(),
    type: reader.readUint16(),
    flip: reader.readUint16(),
    offsetPoly: reader.readUint32(),
    polySuu: reader.readUint16(),
    offsetBoneTbl: reader.readUint32(),
    boneTblSuu: reader.readUint16(),
    offsetWeight: reader.readUint32(),
    weightSuu: reader.readUint16(),
    offsetBone: reader.readUint32(),
    boneSuu: reader.readUint16(),
    offsetVertex: reader.readUint32(),
    vertexSuu: reader.readUint16(),
    offsetPolyLoad: reader.readUint32(),
    polyLoadSuu: reader.readUint16(),
  }
}

/**
 * Walk the polygon command chain and extract triangle faces with UVs.
 *
 * Commands (read as uint16 LE):
 *   0x8010 (& 0x80F0): material state block, 46 bytes total (skip)
 *   0x8000 (& 0x80F0): texture change, 18 bytes (2 cmd + 16 name)
 *   0x0054 ('T'):       triangle list — ws faces, each 30 bytes (TEXLIST)
 *   0x5453 ('ST'):      triangle strip — first face 30 bytes, then (ws-1) × 10 bytes
 *   0x4353 ('SC'):      skip, ws*20 + 12 bytes
 *   0x0043 ('C'):       skip, ws*10 + 4 bytes
 *   0xFFFF:             end of polygon data
 */
function parsePolygonCommands(
  reader: DatReader,
  headerOffset: number,
  offsetPoly: number,
  polySuu: number,
): { faces: FaceUV[]; textureName: string | null } {
  const faces: FaceUV[] = []
  let textureName: string | null = null

  let pos = headerOffset + offsetPoly * 2
  const endPos = headerOffset + (offsetPoly + polySuu) * 2

  while (pos < endPos && pos < reader.length - 4) {
    reader.seek(pos)
    const wf = reader.readUint16()

    if (wf === 0xFFFF) break

    // Material state (0x8010 masked)
    if ((wf & 0x80F0) === 0x8010) {
      pos += 46
      continue
    }

    // Texture change (0x8000 masked)
    if ((wf & 0x80F0) === 0x8000) {
      reader.seek(pos + 2)
      textureName = reader.readString(16).trim()
      pos += 18
      continue
    }

    // Triangle list (0x0054 = 'T')
    if (wf === 0x0054) {
      reader.seek(pos + 2)
      const ws = reader.readUint16()
      pos += 4
      for (let k = 0; k < ws; k++) {
        reader.seek(pos)
        faces.push(readFaceUV(reader))
        pos += 30
      }
      continue
    }

    // Triangle strip (0x5453 = 'ST')
    if (wf === 0x5453) {
      reader.seek(pos + 2)
      const ws = reader.readUint16()
      pos += 4

      reader.seek(pos)
      const firstFace = readFaceUV(reader)
      pos += 30

      const stripVerts: { idx: number; u: number; v: number }[] = [
        { idx: firstFace.i1, u: firstFace.u1, v: firstFace.v1 },
        { idx: firstFace.i2, u: firstFace.u2, v: firstFace.v2 },
        { idx: firstFace.i3, u: firstFace.u3, v: firstFace.v3 },
      ]

      for (let k = 0; k < ws - 1; k++) {
        reader.seek(pos)
        const idx = reader.readInt16()
        const u = reader.readFloat32()
        const v = reader.readFloat32()
        stripVerts.push({ idx, u, v })
        pos += 10
      }

      for (let k = 0; k < stripVerts.length - 2; k++) {
        const a = stripVerts[k], b = stripVerts[k + 1], c = stripVerts[k + 2]
        if (a.idx === b.idx || b.idx === c.idx || a.idx === c.idx) continue
        if (k % 2 === 0) {
          faces.push({ i1: a.idx, i2: b.idx, i3: c.idx, u1: a.u, v1: a.v, u2: b.u, v2: b.v, u3: c.u, v3: c.v })
        } else {
          faces.push({ i1: a.idx, i2: c.idx, i3: b.idx, u1: a.u, v1: a.v, u2: c.u, v2: c.v, u3: b.u, v3: b.v })
        }
      }
      continue
    }

    // SC command
    if (wf === 0x4353) {
      reader.seek(pos + 2)
      const ws = reader.readUint16()
      pos += ws * 20 + 12
      continue
    }

    // C command
    if (wf === 0x0043) {
      reader.seek(pos + 2)
      const ws = reader.readUint16()
      pos += ws * 10 + 4
      continue
    }

    // Unknown command — stop
    break
  }

  return { faces, textureName }
}

function readFaceUV(reader: DatReader): FaceUV {
  return {
    i1: reader.readInt16(), i2: reader.readInt16(), i3: reader.readInt16(),
    u1: reader.readFloat32(), v1: reader.readFloat32(),
    u2: reader.readFloat32(), v2: reader.readFloat32(),
    u3: reader.readFloat32(), v3: reader.readFloat32(),
  }
}

/**
 * Parse a Vertex block (type 0x2A) into ParsedMesh(es).
 *
 * Equipment meshes have two vertex formats:
 * - MODELVERTEX1 (24 bytes): x,y,z, nx,ny,nz — single-bone vertices
 * - MODELVERTEX2 (56 bytes): x1,x2,y1,y2,z1,z2, w1,w2, nx1,nx2,ny1,ny2,nz1,nz2 — dual-bone
 *
 * The weight section tells us: noB1 single-bone verts, then noB2 dual-bone verts.
 * Total bytes: noB1*24 + noB2*56 = vertexSuu*2.
 *
 * All vertices are in bone-local space and must be transformed by the skeleton's
 * bone matrices to get world-space positions. The BONE3 array and BoneTbl provide
 * the per-vertex bone index mapping.
 *
 * @param skelMatrices - Pre-computed 4x4 world-space bone matrices from the skeleton DAT.
 *                       If null, vertices are returned untransformed (only correct for weapons).
 */
interface BoneAssign {
  leftL: number; rightL: number; flgL: number
  leftH: number; rightH: number; flgH: number
}

interface RawVert { x: number; y: number; z: number; nx: number; ny: number; nz: number }

/** Raw MV2 data before bone transform (needed for mirror pass) */
interface RawMV2 {
  x1: number; x2: number; y1: number; y2: number; z1: number; z2: number
  w1: number; w2: number; nx1: number; ny1: number; nz1: number
}

/**
 * Resolve a BONE3 index to a skeleton bone index.
 * When isIndirect=true, the index is looked up through the boneTbl.
 * When isIndirect=false, the index is used directly as the skeleton bone index.
 */
function resolveBoneIdx(tblIdx: number, boneTbl: number[], isIndirect: boolean): number {
  return isIndirect ? (boneTbl[tblIdx] ?? 0) : tblIdx
}

/**
 * Transform MV1 and MV2 vertices using bone matrices.
 * @param flip - false for original (leftL/leftH), true for mirrored (rightL/rightH)
 * @param isIndirect - true if bone indices go through boneTbl, false if they're direct skeleton indices
 */
function transformVertices(
  noB1: number, noB2: number,
  mv1Data: Array<{ x: number; y: number; z: number; nx: number; ny: number; nz: number }>,
  mv2Data: RawMV2[],
  boneAssign: BoneAssign[],
  boneTbl: number[],
  skelMatrices: number[][],
  flip: boolean,
  isIndirect: boolean,
): RawVert[] {
  const verts: RawVert[] = []

  // MV1 vertices
  for (let i = 0; i < noB1; i++) {
    const src = mv1Data[i]
    let x = src.x, y = src.y, z = src.z
    if (i < boneAssign.length) {
      const b3 = boneAssign[i]
      const tblIdx = flip ? b3.rightL : b3.leftL
      const boneIdx = resolveBoneIdx(tblIdx, boneTbl, isIndirect)
      if (boneIdx < skelMatrices.length) {
        let m = skelMatrices[boneIdx]
        if (flip) m = applyMirrorFlag(m, b3.flgL)
        const t = mat4TransformPoint(m, x, y, z, 1.0)
        x = t[0]; y = t[1]; z = t[2]
      }
    }
    verts.push({ x, y, z, nx: src.nx, ny: src.ny, nz: src.nz })
  }

  // MV2 vertices
  for (let i = 0; i < noB2; i++) {
    const src = mv2Data[i]
    const bIdx = noB1 + i
    let px = src.x1, py = src.y1, pz = src.z1

    if (bIdx < boneAssign.length) {
      const b3 = boneAssign[bIdx]
      const tblIdxL = flip ? b3.rightL : b3.leftL
      const tblIdxH = flip ? b3.rightH : b3.leftH
      const boneIdxL = resolveBoneIdx(tblIdxL, boneTbl, isIndirect)
      const boneIdxH = resolveBoneIdx(tblIdxH, boneTbl, isIndirect)

      px = 0; py = 0; pz = 0
      if (boneIdxL < skelMatrices.length) {
        let m = skelMatrices[boneIdxL]
        if (flip) m = applyMirrorFlag(m, b3.flgL)
        const t = mat4TransformPoint(m, src.x1, src.y1, src.z1, src.w1)
        px += t[0]; py += t[1]; pz += t[2]
      }
      if (boneIdxH < skelMatrices.length) {
        let m = skelMatrices[boneIdxH]
        if (flip) m = applyMirrorFlag(m, b3.flgH)
        const t = mat4TransformPoint(m, src.x2, src.y2, src.z2, src.w2)
        px += t[0]; py += t[1]; pz += t[2]
      }
    }

    verts.push({ x: px, y: py, z: pz, nx: src.nx1, ny: src.ny1, nz: src.nz1 })
  }

  return verts
}

/** Expand face data into per-vertex arrays for Three.js (non-indexed) */
function expandFaces(
  rawVerts: RawVert[],
  faces: FaceUV[],
  reverseWinding: boolean,
  perVertexBoneIndices?: Uint8Array,
  perVertexBoneWeights?: Float32Array,
  dualBone?: { localPos1: Float32Array; localPos2: Float32Array; weights: Float32Array } | null,
): {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  boneIndices: Uint8Array
  boneWeights: Float32Array
  dualBoneLocalPos1?: Float32Array
  dualBoneLocalPos2?: Float32Array
  dualBoneWeights?: Float32Array
} {
  const n = faces.length * 3
  const positions = new Float32Array(n * 3)
  const normals = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  const boneIndices = new Uint8Array(n * 4)
  const boneWeights = new Float32Array(n * 4)

  let dbLocalPos1: Float32Array | undefined
  let dbLocalPos2: Float32Array | undefined
  let dbWeights: Float32Array | undefined
  if (dualBone) {
    dbLocalPos1 = new Float32Array(n * 3)
    dbLocalPos2 = new Float32Array(n * 3)
    dbWeights = new Float32Array(n * 2)
  }

  for (let f = 0; f < faces.length; f++) {
    const face = faces[f]
    const base = f * 3
    // Reverse winding for mirrored faces to keep correct face orientation
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

      if (dualBone && dbLocalPos1 && dbLocalPos2 && dbWeights) {
        dbLocalPos1[idx*3] = dualBone.localPos1[srcIdx*3]
        dbLocalPos1[idx*3+1] = dualBone.localPos1[srcIdx*3+1]
        dbLocalPos1[idx*3+2] = dualBone.localPos1[srcIdx*3+2]
        dbLocalPos2[idx*3] = dualBone.localPos2[srcIdx*3]
        dbLocalPos2[idx*3+1] = dualBone.localPos2[srcIdx*3+1]
        dbLocalPos2[idx*3+2] = dualBone.localPos2[srcIdx*3+2]
        dbWeights[idx*2] = dualBone.weights[srcIdx*2]
        dbWeights[idx*2+1] = dualBone.weights[srcIdx*2+1]
      }
    }
  }

  return { positions, normals, uvs, boneIndices, boneWeights, dualBoneLocalPos1: dbLocalPos1, dualBoneLocalPos2: dbLocalPos2, dualBoneWeights: dbWeights }
}

/**
 * Build per-vertex bone index and weight arrays for GPU skinning.
 * Vertices stay in bone-local space — no matrix multiplication.
 * MV2 dual-bone vertices use dominant bone only (V1 limitation).
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

  // MV2 vertices: dual bone — store BOTH bone indices for CPU skinning.
  // Slot 0 = low bone (leftL/rightL), slot 1 = high bone (leftH/rightH).
  for (let i = 0; i < noB2; i++) {
    const bIdx = noB1 + i
    if (bIdx < boneAssign.length) {
      const b3 = boneAssign[bIdx]
      const tblIdxL = flip ? b3.rightL : b3.leftL
      const tblIdxH = flip ? b3.rightH : b3.leftH
      boneIndices[bIdx * 4 + 0] = resolveBoneIdx(tblIdxL, boneTbl, isIndirect)
      boneIndices[bIdx * 4 + 1] = resolveBoneIdx(tblIdxH, boneTbl, isIndirect)
      boneWeights[bIdx * 4 + 0] = 1.0
      boneWeights[bIdx * 4 + 1] = 1.0
    }
  }

  return { boneIndices, boneWeights }
}

/**
 * Build per-vertex bone-local position and weight arrays for dual-bone (MV2) CPU skinning.
 * Returns null if there are no MV2 vertices (no dual-bone blending needed).
 *
 * When flip=true (mirror half), applies mirror flags from boneAssign to the local positions.
 * In galkareeve: `matrixMirrorX * boneMatrix` is equivalent to negating the vertex's X axis
 * before transforming by the original matrix (row-vector convention: v * mirrorX * M = (-vx,vy,vz) * M).
 */
function buildDualBoneArrays(
  noB1: number, noB2: number,
  mv1Data: Array<{ x: number; y: number; z: number }>,
  mv2Data: RawMV2[],
  boneAssign: BoneAssign[],
  flip: boolean,
): { localPos1: Float32Array; localPos2: Float32Array; weights: Float32Array } | null {
  if (noB2 === 0) return null  // no MV2 vertices, skip

  const total = noB1 + noB2
  const localPos1 = new Float32Array(total * 3)
  const localPos2 = new Float32Array(total * 3)  // zeros for MV1
  const weights = new Float32Array(total * 2)

  // MV1: bone-local position in slot 1, weight = (1, 0)
  for (let i = 0; i < noB1; i++) {
    let x = mv1Data[i].x, y = mv1Data[i].y, z = mv1Data[i].z
    if (flip && i < boneAssign.length) {
      const flg = boneAssign[i].flgL
      if (flg === 1) x = -x
      else if (flg === 2) y = -y
      else if (flg === 3) z = -z
    }
    localPos1[i*3] = x; localPos1[i*3+1] = y; localPos1[i*3+2] = z
    weights[i*2] = 1.0
    weights[i*2+1] = 0.0
  }

  // MV2: two bone-local positions + weights
  for (let i = 0; i < noB2; i++) {
    const idx = noB1 + i
    const src = mv2Data[i]
    let x1 = src.x1, y1 = src.y1, z1 = src.z1
    let x2 = src.x2, y2 = src.y2, z2 = src.z2
    if (flip && idx < boneAssign.length) {
      const b3 = boneAssign[idx]
      // Mirror bone 1's local position by flgL
      if (b3.flgL === 1) x1 = -x1
      else if (b3.flgL === 2) y1 = -y1
      else if (b3.flgL === 3) z1 = -z1
      // Mirror bone 2's local position by flgH
      if (b3.flgH === 1) x2 = -x2
      else if (b3.flgH === 2) y2 = -y2
      else if (b3.flgH === 3) z2 = -z2
    }
    localPos1[idx*3] = x1; localPos1[idx*3+1] = y1; localPos1[idx*3+2] = z1
    localPos2[idx*3] = x2; localPos2[idx*3+1] = y2; localPos2[idx*3+2] = z2
    weights[idx*2] = src.w1; weights[idx*2+1] = src.w2
  }

  return { localPos1, localPos2, weights }
}

export function parseVertexBlock(
  reader: DatReader,
  dataOffset: number,
  _dataLength: number,
  textureMap: Map<string, number>,
  skelMatrices?: number[][] | null,
): ParsedMesh[] {
  reader.seek(dataOffset)
  const hdr = readDat2AHeader(reader)

  // Model type: 0 = standard (MODELVERTEX), 1 = cloth (CLOTHVERTEX — 12 bytes, no normals)
  const modelType = hdr.type & 0x7F
  const isCloth = modelType === 1

  // Read weight info
  reader.seek(dataOffset + hdr.offsetWeight * 2)
  const noB1 = reader.readUint16()
  const noB2 = reader.readUint16()

  // Read bone table
  const boneTbl: number[] = []
  reader.seek(dataOffset + hdr.offsetBoneTbl * 2)
  for (let i = 0; i < hdr.boneTblSuu; i++) boneTbl.push(reader.readUint16())

  // Read BONE3 assignments
  const boneAssign: BoneAssign[] = []
  reader.seek(dataOffset + hdr.offsetBone * 2)
  for (let i = 0; i < hdr.boneSuu / 2; i++) {
    const low = reader.readUint16(), high = reader.readUint16()
    boneAssign.push({
      leftL: low & 0x7F, rightL: (low >> 7) & 0x7F, flgL: (low >> 14) & 3,
      leftH: high & 0x7F, rightH: (high >> 7) & 0x7F, flgH: (high >> 14) & 3,
    })
  }

  // Read raw vertex data
  // CLOTHVERTEX1 = 12 bytes (x, y, z only — no normals)
  // CLOTHVERTEX2 = 32 bytes (x1,x2, y1,y2, z1,z2, w1,w2)
  // MODELVERTEX1 = 24 bytes (x, y, z, nx, ny, nz)
  // MODELVERTEX2 = 56 bytes (x1,x2, y1,y2, z1,z2, w1,w2, nx1,nx2, ny1,ny2, nz1,nz2)
  const mv1Size = isCloth ? 12 : 24
  const vertexByteOffset = dataOffset + hdr.offsetVertex * 2
  const mv1Data: Array<{ x: number; y: number; z: number; nx: number; ny: number; nz: number }> = []
  reader.seek(vertexByteOffset)
  for (let i = 0; i < noB1; i++) {
    const x = reader.readFloat32(), y = reader.readFloat32(), z = reader.readFloat32()
    if (isCloth) {
      mv1Data.push({ x, y, z, nx: 0, ny: 1, nz: 0 }) // cloth has no normals, use up vector
    } else {
      mv1Data.push({ x, y, z, nx: reader.readFloat32(), ny: reader.readFloat32(), nz: reader.readFloat32() })
    }
  }

  // Read raw MV2 vertex data
  // CLOTHVERTEX2 = 32 bytes (x1,x2,y1,y2,z1,z2,w1,w2 — no normals)
  // MODELVERTEX2 = 56 bytes (x1,x2,y1,y2,z1,z2,w1,w2,nx1,nx2,ny1,ny2,nz1,nz2)
  const mv2Data: RawMV2[] = []
  reader.seek(vertexByteOffset + noB1 * mv1Size)
  for (let i = 0; i < noB2; i++) {
    const x1 = reader.readFloat32(), x2 = reader.readFloat32()
    const y1 = reader.readFloat32(), y2 = reader.readFloat32()
    const z1 = reader.readFloat32(), z2 = reader.readFloat32()
    const w1 = reader.readFloat32(), w2 = reader.readFloat32()
    let nx1 = 0, ny1 = 1, nz1 = 0
    if (!isCloth) {
      nx1 = reader.readFloat32(); reader.skip(4)
      ny1 = reader.readFloat32(); reader.skip(4)
      nz1 = reader.readFloat32(); reader.skip(4)
    }
    mv2Data.push({ x1, x2, y1, y2, z1, z2, w1, w2, nx1, ny1, nz1 })
  }

  // Parse polygon commands
  const { faces, textureName } = parsePolygonCommands(reader, dataOffset, hdr.offsetPoly, hdr.polySuu)
  if (faces.length === 0) return []

  const materialIndex = textureName ? (textureMap.get(textureName) ?? 0) : 0
  const meshes: ParsedMesh[] = []

  if (!skelMatrices) {
    // No skeleton — weapons, static props
    const rawVerts: RawVert[] = [
      ...mv1Data,
      ...mv2Data.map(s => ({ x: s.x1, y: s.y1, z: s.z1, nx: s.nx1, ny: s.ny1, nz: s.nz1 })),
    ]
    const { positions, normals, uvs } = expandFaces(rawVerts, faces, false)
    meshes.push({
      vertices: positions, normals, uvs,
      indices: new Uint16Array(positions.length / 3),
      boneIndices: new Uint8Array(0), boneWeights: new Float32Array(0),
      materialIndex,
    })
  } else {
    const isIndirect = !!(hdr.type & 0x80)

    // Original half — pre-bake vertices to bind-pose world space AND keep bone assignments.
    // Three.js SkinnedMesh expects vertices in a shared model space (not bone-local).
    // The shader does: newBoneWorld * inverseBind * v_bindWorld, which in bind pose = identity.
    const origVerts = transformVertices(noB1, noB2, mv1Data, mv2Data, boneAssign, boneTbl, skelMatrices, false, isIndirect)
    const skin = buildSkinningArrays(noB1, noB2, boneAssign, boneTbl, isIndirect, false)
    const dualBone = buildDualBoneArrays(noB1, noB2, mv1Data, mv2Data, boneAssign, false)
    const orig = expandFaces(origVerts, faces, false, skin.boneIndices, skin.boneWeights, dualBone)
    meshes.push({
      vertices: orig.positions, normals: orig.normals, uvs: orig.uvs,
      indices: new Uint16Array(orig.positions.length / 3),
      boneIndices: orig.boneIndices, boneWeights: orig.boneWeights,
      materialIndex,
      dualBoneLocalPos1: orig.dualBoneLocalPos1,
      dualBoneLocalPos2: orig.dualBoneLocalPos2,
      dualBoneWeights: orig.dualBoneWeights,
    })

    // Mirrored half — pre-baked to world space with mirrored bone matrices,
    // but assigned the SAME (leftL) bone indices as the original half.
    // At bind pose: inverseBind * bind = identity, so mirror positions are preserved.
    // During animation: both halves move together (correct for symmetric anims).
    if (hdr.flip !== 0) {
      const hasDualBone = noB2 > 0
      const mirrorVerts = transformVertices(noB1, noB2, mv1Data, mv2Data, boneAssign, boneTbl, skelMatrices, true, isIndirect)
      // When dual-bone data exists, the mirror half needs the actual mirror bone indices
      // (rightL/rightH) because the dual-bone path transforms bone-local positions directly
      // by world matrices. Without dual-bone, the deformation-matrix approach needs leftL bones.
      const mirrorSkin = buildSkinningArrays(noB1, noB2, boneAssign, boneTbl, isIndirect, hasDualBone)
      const mirrorDualBone = buildDualBoneArrays(noB1, noB2, mv1Data, mv2Data, boneAssign, true)
      const mirror = expandFaces(mirrorVerts, faces, true, mirrorSkin.boneIndices, mirrorSkin.boneWeights, mirrorDualBone)
      meshes.push({
        vertices: mirror.positions, normals: mirror.normals, uvs: mirror.uvs,
        indices: new Uint16Array(mirror.positions.length / 3),
        boneIndices: mirror.boneIndices, boneWeights: mirror.boneWeights,
        materialIndex,
        dualBoneLocalPos1: mirror.dualBoneLocalPos1,
        dualBoneLocalPos2: mirror.dualBoneLocalPos2,
        dualBoneWeights: mirror.dualBoneWeights,
      })
    }
  }

  return meshes
}

/** @deprecated Use parseVertexBlock instead */
export function parseMeshes(_reader: DatReader): ParsedMesh[] {
  return []
}
