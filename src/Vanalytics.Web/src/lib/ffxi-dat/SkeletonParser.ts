import { DatReader } from './DatReader'
import type { ParsedSkeleton, ParsedBone } from './types'

/**
 * Quaternion (i,j,k,w) + translation (tx,ty,tz) → 4x4 row-major matrix.
 * Matches the TMatrix44 layout used in the C reference code.
 */
function quatToMatrix(
  qi: number, qj: number, qk: number, qw: number,
  tx: number, ty: number, tz: number
): number[] {
  const x = qi, y = qj, z = qk, w = qw
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return [
    1 - yy - zz, xy + wz, xz - wy, 0,
    xy - wz, 1 - xx - zz, yz + wx, 0,
    xz + wy, yz - wx, 1 - xx - yy, 0,
    tx, ty, tz, 1,
  ]
}

/** Multiply two 4x4 row-major matrices: result = A * B */
function mat4Multiply(a: number[], b: number[]): number[] {
  const r = new Array(16).fill(0)
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++)
        r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j]
  return r
}

/**
 * Transform a 3D point by a 4x4 row-major matrix.
 * The `w` parameter is the homogeneous coordinate weight
 * (1.0 for single-bone, or the bone weight for dual-bone blending).
 */
export function mat4TransformPoint(
  m: number[], x: number, y: number, z: number, w: number
): [number, number, number] {
  return [
    x * m[0] + y * m[4] + z * m[8] + w * m[12],
    x * m[1] + y * m[5] + z * m[9] + w * m[13],
    x * m[2] + y * m[6] + z * m[10] + w * m[14],
  ]
}

/**
 * FFXI skeleton bone structure (30 bytes per bone):
 *   parent (uint8) — parent bone index, 255 = root
 *   term   (uint8) — 1 = leaf node
 *   i,j,k,w (4x float32) — quaternion rotation
 *   x,y,z   (3x float32) — translation
 */
const BONE_SIZE = 30

/**
 * Parse a skeleton from a DAT file containing a Bone block (type 0x29).
 *
 * The skeleton DAT contains the bone hierarchy for a character race.
 * Each bone has a quaternion rotation + translation. World-space matrices
 * are built hierarchically: childWorld = childLocal * parentWorld.
 *
 * These matrices are used to transform equipment vertices from bone-local
 * space to world space.
 */
export function parseSkeleton(reader: DatReader): ParsedSkeleton | null {
  // Walk block chain to find Bone block (type 0x29)
  let offset = 0
  while (offset < reader.length - 8) {
    reader.seek(offset + 4)
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const next = (packed >> 7) & 0x7FFFF

    if (type === 0x29) {
      const dataStart = offset + 16 // DATHEAD = 16 bytes
      reader.seek(dataStart)
      reader.skip(2) // unk
      const noBone = reader.readInt16()

      if (noBone <= 0 || noBone > 200) return null

      const bones: ParsedBone[] = []
      const matrices: number[][] = []

      for (let i = 0; i < noBone; i++) {
        const boneOffset = dataStart + 4 + i * BONE_SIZE
        reader.seek(boneOffset)

        const parentRaw = reader.readUint8()
        const parent = i === 0 ? 255 : parentRaw // force root for bone 0
        reader.skip(1) // term

        const qi = reader.readFloat32()
        const qj = reader.readFloat32()
        const qk = reader.readFloat32()
        const qw = reader.readFloat32()
        const tx = reader.readFloat32()
        const ty = reader.readFloat32()
        const tz = reader.readFloat32()

        bones.push({
          parentIndex: parent === 255 ? -1 : parent,
          position: [tx, ty, tz],
          rotation: [qi, qj, qk, qw],
        })

        // Build world-space matrix
        const local = quatToMatrix(qi, qj, qk, qw, tx, ty, tz)
        if (parent === 255) {
          matrices.push(local)
        } else {
          matrices.push(mat4Multiply(local, matrices[parent]))
        }
      }

      return { bones, matrices }
    }

    if (next === 0) break
    offset += next * 16
    if (offset > reader.length) break
  }

  return null
}

/** Skeleton DAT paths per race ID (from AltanaView index.csv) */
export const SKELETON_PATHS: Record<number, string> = {
  1: 'ROM/27/82.dat',   // Hume Male
  2: 'ROM/32/58.dat',   // Hume Female
  3: 'ROM/37/31.dat',   // Elvaan Male
  4: 'ROM/42/4.dat',    // Elvaan Female
  5: 'ROM/46/93.dat',   // Tarutaru Male
  6: 'ROM/46/93.dat',   // Tarutaru Female (shares with Male)
  7: 'ROM/51/89.dat',   // Mithra
  8: 'ROM/56/59.dat',   // Galka
}
