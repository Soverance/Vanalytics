import type { ZoneMeshInstance } from './types'

/**
 * Parses MZB blocks (type 0x1C) from FFXI zone DAT files.
 * Data must be decrypted via decodeMzb() before calling this.
 *
 * MZB format (from GalkaReeve TDWMap.cpp ImgReadMap):
 *
 * After decryption, the MZB data layout:
 *   Offset 0: header (32 bytes)
 *     - uint32 at offset 4: instance count (masked & 0xFFFFFF)
 *   Offset 32: OBJINFO array
 *
 * Each OBJINFO has scale, rotation, translation fields and an MMB index.
 * We build a 4x4 matrix from these for the renderer.
 *
 * The GalkaReeve code does:
 *   oj = (OBJINFO*)(p + 16 + 32)  // instances at offset 48 from block data
 *   noj = (*(int*)(p + 16 + 4)) & 0xFFFFFF  // count from header
 *
 * But since our data already has the 16-byte block padding stripped,
 * the offsets are relative to our data start:
 *   count at offset 4, instances at offset 32
 */

// OBJINFO struct size — from GalkaReeve, this contains:
// scale(xyz), rotation(xyz), translation(xyz), id/flags
// Exact size needs to be determined empirically
const OBJINFO_SIZE = 100  // matches NavMesh Builder's 0x64 = 100 bytes

export function parseMzbBlock(data: Uint8Array): ZoneMeshInstance[] {
  if (data.length < 36) return []

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // Instance count at offset 4, masked to 24 bits
  const instanceCount = view.getUint32(4, true) & 0xFFFFFF
  if (instanceCount === 0 || instanceCount > 10000) {
    if (instanceCount > 10000) console.warn(`MZB: instanceCount ${instanceCount} too large`)
    return []
  }

  const instances: ZoneMeshInstance[] = []
  const instancesOffset = 32  // OBJINFO array starts at offset 32

  for (let i = 0; i < instanceCount; i++) {
    const offset = instancesOffset + i * OBJINFO_SIZE
    if (offset + OBJINFO_SIZE > data.length) break

    try {
      // Read OBJINFO fields
      // The exact layout from GalkaReeve uses:
      //   fScaleX/Y/Z, fRotX/Y/Z, fTransX/Y/Z
      // Reading as 4x4 float matrix first (64 bytes), then meshIndex (uint32)
      // This matches the NavMesh Builder's 100-byte entry interpretation
      const transform: number[] = []
      for (let j = 0; j < 16; j++) {
        transform.push(view.getFloat32(offset + j * 4, true))
      }

      // Mesh index at offset 64 within the entry
      const meshIndex = view.getUint32(offset + 64, true)

      instances.push({ meshIndex, transform })
    } catch {
      break
    }
  }

  return instances
}
