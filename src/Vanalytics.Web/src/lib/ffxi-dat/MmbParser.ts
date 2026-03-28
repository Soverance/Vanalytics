import { DatReader } from './DatReader'
import type { ParsedZoneMesh } from './types'
import { triangleStripToList } from './MeshParser'

/**
 * Parses MMB blocks (type 0x2E) from FFXI zone DAT files.
 * Data must be decrypted via decodeMmb() before calling this.
 *
 * Ported from GalkaReeve mapViewer FFXILandscapeMesh.cpp extractMMB().
 *
 * Layout:
 *   SMMBHEAD     (16 bytes) — id[3], bitfields, unk[9]
 *   SMMBHeader   (44 bytes) — imgID[16], pieces, bbox, offsetBlockHeader
 *   Offset table (variable) — per-piece offsets
 *   Per piece:
 *     SMMBBlockHeader (32 bytes) — numModel, bbox, numFace
 *     Per model:
 *       SMMBModelHeader (20 bytes) — textureName[16], vertexsize(u16), blending(u16)
 *       Vertices: vertexsize × SMMBBlockVertex(36) or SMMBBlockVertex2(56)
 *       Index count (uint32 masked &0xFFFF)
 *       Indices: count × uint16 (+ 2 byte padding if odd)
 */
export interface MmbMeshResult extends ParsedZoneMesh {
  textureName: string
}

export function parseMmbBlock(data: Uint8Array): MmbMeshResult[] {
  const reader = new DatReader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  const meshes: MmbMeshResult[] = []

  if (data.length < 60) return meshes // SMMBHEAD(16) + SMMBHeader(44) minimum

  // ── SMMBHEAD (16 bytes) ──
  const id0 = reader.readUint8()
  const id1 = reader.readUint8()
  const id2 = reader.readUint8()
  const packed = reader.readUint32()
  reader.skip(9) // unk[9]

  const isMmbType = (id0 === 0x4D && id1 === 0x4D && id2 === 0x42) // "MMB"

  // ── SMMBHEAD2 overlay for d3 field ──
  // SMMBHEAD2 starts at offset 0 (same as SMMBHEAD), d3 is at specific offset
  // From TDWAnalysis.h: SMMBHEAD2 { MMBSize:24, d1:8, d3:8, d4:8, d5:8, d6:8, name[8] }
  // d3 is at byte 4 of SMMBHEAD2, which is byte 4 of the block data
  const d3 = data[4]
  const vertexStride = (d3 === 2) ? 56 : 36

  // ── SMMBHeader (44 bytes) ──
  // char imgID[16], int pieces, float x1,x2,y1,y2,z1,z2, uint offsetBlockHeader
  reader.skip(16) // imgID (block identifier, not a texture reference)
  const pieces = reader.readInt32()
  reader.skip(24) // bbox: 6 floats
  const offsetBlockHeader = reader.readUint32()

  if (pieces <= 0 || pieces > 200) return meshes

  // ── Offset table ──
  const currentPos = reader.position // should be 60 (16+44)
  const offsets: number[] = []

  if (offsetBlockHeader === 0) {
    if (pieces !== 0) {
      for (let i = 0; i < 8; i++) {
        if (reader.remaining < 4) break
        const off = reader.readUint32()
        if (off !== 0) offsets.push(off)
      }
    } else {
      offsets.push(currentPos)
    }
  } else {
    offsets.push(offsetBlockHeader)
    const maxRange = offsetBlockHeader - currentPos
    if (maxRange > 0) {
      for (let i = 0; i < maxRange; i += 4) {
        if (reader.remaining < 4) break
        const off = reader.readUint32()
        if (off !== 0) offsets.push(off)
      }
    }
  }

  // ── Parse pieces ──
  let offsetIdx = 0
  for (let piece = 0; piece < pieces; piece++) {
    if (offsetIdx < offsets.length) {
      reader.seek(offsets[offsetIdx++])
    }

    if (reader.remaining < 32) break

    // SMMBBlockHeader (32 bytes): int numModel, float bbox[6], int numFace
    const numModel = reader.readInt32()
    reader.skip(28) // bbox + numFace

    if (numModel <= 0 || numModel > 50) break

    for (let k = 0; k < numModel; k++) {
      if (reader.remaining < 20) break

      // SMMBModelHeader (20 bytes): char textureName[16], u16 vertexsize, u16 blending
      const textureName = reader.readString(16).trim()
      const vertexCount = reader.readUint16()
      const blending = reader.readUint16()

      if (vertexCount === 0 || reader.remaining < vertexCount * vertexStride + 4) break

      const vertices: number[] = []
      const normals: number[] = []
      const colors: number[] = []
      const uvs: number[] = []

      for (let v = 0; v < vertexCount; v++) {
        // Position
        vertices.push(reader.readFloat32(), reader.readFloat32(), reader.readFloat32())

        if (vertexStride === 56) {
          // SMMBBlockVertex2: skip dx, dy, dz (displacement)
          reader.skip(12)
        }

        // Normal (hx, hy, hz)
        normals.push(reader.readFloat32(), reader.readFloat32(), reader.readFloat32())

        // Color: uint32 as BGRA (from GalkaReeve lookupMMB color extraction)
        const colorVal = reader.readUint32()
        const b = (colorVal & 0xFF) / 255
        const g = ((colorVal >> 8) & 0xFF) / 255
        const r = ((colorVal >> 16) & 0xFF) / 255
        const a = ((colorVal >> 24) & 0xFF) / 255
        colors.push(r, g, b, a)

        // UV
        uvs.push(reader.readFloat32(), reader.readFloat32())
      }

      // Index count (uint32, masked to uint16)
      if (reader.remaining < 4) break
      const numIndices = reader.readUint32() & 0xFFFF
      if (numIndices === 0 || reader.remaining < numIndices * 2) break

      const rawIndices: number[] = []
      for (let j = 0; j < numIndices; j++) {
        rawIndices.push(reader.readUint16())
      }
      // Padding if odd number of indices
      if (numIndices % 2 !== 0) reader.skip(2)

      // Determine draw type: triangle list or strip
      const isTriList = (isMmbType && (packed & 0x7F) === 0) || (!isMmbType && d3 === 2)

      let triIndices: number[]
      if (isTriList) {
        triIndices = rawIndices
      } else {
        triIndices = triangleStripToList(rawIndices)
      }

      if (triIndices.length === 0) continue

      meshes.push({
        vertices,
        normals,
        colors,
        uvs,
        indices: triIndices,
        materialIndex: 0,
        textureName,
        blending,
      })
    }
  }

  return meshes
}
