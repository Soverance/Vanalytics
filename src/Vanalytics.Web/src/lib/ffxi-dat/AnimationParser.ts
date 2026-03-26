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
export function parseAnimationDat(buffer: ArrayBuffer, debugPath?: string): ParsedAnimation[] {
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
        const anim = parseAnimBlock(reader, dataStart, debugPath)
        if (anim) animations.push(anim)
      } catch (err) {
        if (debugPath) console.warn(`[AnimParser] parseAnimBlock error:`, err)
      }
    }

    if (nextUnits === 0) break
    offset += blockSize
    if (offset > reader.length) break
  }

  return animations
}

function parseAnimBlock(
  reader: DatReader,
  dataStart: number,
  debugPath?: string,
): ParsedAnimation | null {
  reader.seek(dataStart)

  // DAT2BHeader2: 10 bytes — skip ver(1) + nazo(1)
  reader.skip(2)
  const element = reader.readUint16()
  const frameCount = reader.readUint16()
  const speed = reader.readFloat32()

  if (element === 0 || frameCount === 0) return null
  if (element > 500) return null

  // The keyframe float pool base: idx values count from the start of the
  // bone descriptor array (after the 10-byte header). We read floats using
  // DatReader.seek() to the byte position: poolBase + idx * 4.
  const poolBase = dataStart + DAT2B_HEADER_SIZE

  // DEBUG: one-time log
  const shouldLog = debugPath && typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).__animParsed
  if (shouldLog) {
    ;(window as unknown as Record<string, unknown>).__animParsed = true
    console.log(`[AnimParser] header: element=${element} frame=${frameCount} speed=${speed} poolBase=${poolBase}`)
  }

  // Read DAT2B bone descriptors (84 bytes each)
  const bones: AnimationBone[] = []
  let loggedBone = false
  for (let i = 0; i < element; i++) {
    const boneOffset = dataStart + DAT2B_HEADER_SIZE + i * DAT2B_BONE_SIZE
    reader.seek(boneOffset)

    const boneIndex = reader.readInt32()

    const idx_qtx = reader.readInt32()
    const idx_qty = reader.readInt32()
    const idx_qtz = reader.readInt32()
    const idx_qtw = reader.readInt32()
    const qtx = reader.readFloat32()
    const qty = reader.readFloat32()
    const qtz = reader.readFloat32()
    const qtw = reader.readFloat32()

    const idx_tx = reader.readInt32()
    const idx_ty = reader.readInt32()
    const idx_tz = reader.readInt32()
    const tx = reader.readFloat32()
    const ty = reader.readFloat32()
    const tz = reader.readFloat32()

    const idx_sx = reader.readInt32()
    const idx_sy = reader.readInt32()
    const idx_sz = reader.readInt32()
    const sx = reader.readFloat32()
    const sy = reader.readFloat32()
    const sz = reader.readFloat32()

    // Skip flag: high bit of idx_qtx means no animation for this bone
    if (idx_qtx & 0x80000000) continue

    // DEBUG: log first non-skipped bone
    if (shouldLog && !loggedBone) {
      loggedBone = true
      // Read the float at pool[idx_qtx] directly via reader
      const testBytePos = poolBase + idx_qtx * 4
      reader.seek(testBytePos)
      const testFloat = reader.readFloat32()
      console.log(`[AnimParser] bone[${i}] idx=${boneIndex} idx_qtx=${idx_qtx} bytePos=${testBytePos} pool[idx_qtx]=${testFloat}`)
      console.log(`  defaults: rot=[${qtx},${qty},${qtz},${qtw}] trans=[${tx},${ty},${tz}]`)
    }

    // Extract keyframe arrays from the float pool using DatReader.
    // When a component's idx is 0, fill with the stored default (not a hardcoded 0/1).
    // This matches the galkareeve reference: `if(!dat.idx_qtx) qt.x = dat.qtx;`
    const rotKf = readRotationKeyframes(reader, poolBase, idx_qtx, idx_qty, idx_qtz, idx_qtw, frameCount, qtx, qty, qtz, qtw)
    const transKf = readTranslationKeyframes(reader, poolBase, idx_tx, idx_ty, idx_tz, frameCount, tx, ty, tz)
    const scaleKf = readScaleKeyframes(reader, poolBase, idx_sx, idx_sy, idx_sz, frameCount, sx, sy, sz)

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

/** Read a single float from the pool at the given index */
function readPoolFloat(reader: DatReader, poolBase: number, idx: number): number {
  reader.seek(poolBase + idx * 4)
  return reader.readFloat32()
}

function readRotationKeyframes(
  reader: DatReader, poolBase: number,
  idxX: number, idxY: number, idxZ: number, idxW: number,
  frameCount: number,
  defX: number, defY: number, defZ: number, defW: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0 && idxW === 0) return null

  const kf = new Float32Array(frameCount * 4)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 4 + 0] = idxX > 0 ? readPoolFloat(reader, poolBase, idxX + f) : defX
    kf[f * 4 + 1] = idxY > 0 ? readPoolFloat(reader, poolBase, idxY + f) : defY
    kf[f * 4 + 2] = idxZ > 0 ? readPoolFloat(reader, poolBase, idxZ + f) : defZ
    kf[f * 4 + 3] = idxW > 0 ? readPoolFloat(reader, poolBase, idxW + f) : defW
  }
  return kf
}

function readTranslationKeyframes(
  reader: DatReader, poolBase: number,
  idxX: number, idxY: number, idxZ: number,
  frameCount: number,
  defX: number, defY: number, defZ: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0) return null

  const kf = new Float32Array(frameCount * 3)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 3 + 0] = idxX > 0 ? readPoolFloat(reader, poolBase, idxX + f) : defX
    kf[f * 3 + 1] = idxY > 0 ? readPoolFloat(reader, poolBase, idxY + f) : defY
    kf[f * 3 + 2] = idxZ > 0 ? readPoolFloat(reader, poolBase, idxZ + f) : defZ
  }
  return kf
}

function readScaleKeyframes(
  reader: DatReader, poolBase: number,
  idxX: number, idxY: number, idxZ: number,
  frameCount: number,
  defX: number, defY: number, defZ: number,
): Float32Array | null {
  if (idxX === 0 && idxY === 0 && idxZ === 0) return null

  const kf = new Float32Array(frameCount * 3)
  for (let f = 0; f < frameCount; f++) {
    kf[f * 3 + 0] = idxX > 0 ? readPoolFloat(reader, poolBase, idxX + f) : defX
    kf[f * 3 + 1] = idxY > 0 ? readPoolFloat(reader, poolBase, idxY + f) : defY
    kf[f * 3 + 2] = idxZ > 0 ? readPoolFloat(reader, poolBase, idxZ + f) : defZ
  }
  return kf
}
