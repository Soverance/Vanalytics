import { DatReader } from './DatReader'
import type { ParsedZoneMesh } from './types'
import { triangleStripToList } from './MeshParser'

/**
 * Parses MMB blocks (type 0x2E) from FFXI zone DAT files.
 * Data must be decrypted via decodeMmb() before calling this.
 *
 * MMB format (from GalkaReeve TDWMap.cpp DrawMMB + TDWAnalysis.h):
 *
 * Bytes 0-31: Header (32 bytes total)
 *   - 0-7: Crypto header (id, flags, version, key info)
 *   - 8-31: Additional header data
 *
 * Offset 32: pieceCount (int32) — number of mesh pieces/strips
 * Offset 36-63: 28 bytes padding/reserved
 *
 * Then for each piece:
 *   - 16-byte texture name/id to match against IMG blocks
 *   - int16 at +16: vertex count (nVer)
 *   - 2 bytes padding
 *   - nVer × 36 bytes: vertex data (SMMBBlockVertex)
 *   - int32: index count (nIdx)
 *   - nIdx × uint16: triangle strip indices
 *
 * SMMBBlockVertex (36 bytes):
 *   float x, y, z        — position (12 bytes)
 *   float hx, hy, hz     — normal (12 bytes)
 *   uint8 R, G, B, A     — vertex color (4 bytes)
 *   float u, v           — texture coords (8 bytes)
 */
export function parseMmbBlock(data: Uint8Array): ParsedZoneMesh[] {
  const reader = new DatReader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  const meshes: ParsedZoneMesh[] = []

  // Need at least header (32) + pieceCount (4) + some padding
  if (data.length < 68) return meshes

  // Skip 32-byte header (crypto header + extended header)
  reader.skip(32)

  // Read piece/strip count
  const pieceCount = reader.readInt32()
  if (pieceCount <= 0 || pieceCount > 1000) return meshes

  // Skip 28 bytes to reach first piece data (total header area = 32 + 4 + 28 = 64)
  reader.skip(28)

  for (let p = 0; p < pieceCount; p++) {
    if (reader.remaining < 20) break

    try {
      // 16-byte texture name/ID (skip for now — texture matching done later)
      reader.skip(16)

      // Vertex count (int16) + 2 bytes padding
      const nVer = reader.readInt16()
      reader.skip(2)

      if (nVer <= 0 || nVer > 65535 || reader.remaining < nVer * 36 + 4) break

      const vertices: number[] = []
      const normals: number[] = []
      const colors: number[] = []
      const uvs: number[] = []

      // Read vertices: SMMBBlockVertex = 36 bytes each
      for (let v = 0; v < nVer; v++) {
        vertices.push(reader.readFloat32(), reader.readFloat32(), reader.readFloat32())
        normals.push(reader.readFloat32(), reader.readFloat32(), reader.readFloat32())
        colors.push(
          reader.readUint8() / 255,
          reader.readUint8() / 255,
          reader.readUint8() / 255,
          reader.readUint8() / 255,
        )
        uvs.push(reader.readFloat32(), reader.readFloat32())
      }

      // Index count (int32)
      if (reader.remaining < 4) break
      const nIdx = reader.readInt32()
      if (nIdx <= 0 || nIdx > 100000 || reader.remaining < nIdx * 2) break

      // Read triangle strip indices (uint16)
      const stripIndices: number[] = []
      for (let i = 0; i < nIdx; i++) {
        stripIndices.push(reader.readUint16())
      }

      // Convert triangle strip to triangle list
      const triIndices = triangleStripToList(stripIndices)
      if (triIndices.length === 0) continue

      meshes.push({
        vertices,
        normals,
        colors,
        uvs,
        indices: triIndices,
        materialIndex: 0, // texture matching done later by name
      })
    } catch {
      break
    }
  }

  return meshes
}
