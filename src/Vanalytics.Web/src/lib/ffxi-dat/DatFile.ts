import { DatReader } from './DatReader'
import { parseTextureBlock } from './TextureParser'
import { parseVertexBlock } from './MeshParser'
import { parseSkeleton } from './SkeletonParser'
import { parseAnimationDat } from './AnimationParser'
import type { ParsedDatFile, ParsedMesh, ParsedTexture, ParsedSkeleton, ParsedAnimation } from './types'

const BLOCK_IMG = 0x20
const BLOCK_BONE = 0x29
const BLOCK_VERTEX = 0x2A
export const BLOCK_ANIM = 0x2B

const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8

interface DatBlock {
  name: string
  type: number
  nextUnits: number
  dataOffset: number
  dataLength: number
}

function parseBlockChain(reader: DatReader): DatBlock[] {
  const blocks: DatBlock[] = []
  let offset = 0

  while (offset < reader.length - DATHEAD_SIZE) {
    reader.seek(offset)
    const name = reader.readString(4)
    const packed = reader.readUint32()

    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    const blockSize = nextUnits * 16

    blocks.push({
      name, type, nextUnits,
      dataOffset: offset + DATHEAD_SIZE,
      dataLength: Math.max(0, blockSize - DATHEAD_SIZE),
    })

    if (nextUnits === 0) break
    offset += blockSize
    if (blocks.length > 500) break // NPC/Monster DATs can have 100+ blocks
  }

  return blocks
}

/**
 * Parse an FFXI DAT file containing 3D model data.
 *
 * Works for:
 * - Equipment DATs (pass external skelMatrices from the character skeleton)
 * - NPC/Monster DATs (skeleton is embedded — auto-detected if no external skeleton provided)
 * - Face/Hair DATs (same as equipment, uses character skeleton)
 *
 * @param buffer - Raw DAT file contents
 * @param skelMatrices - Pre-computed bone matrices from an external skeleton DAT.
 *   If null/undefined, the parser checks for an embedded Bone block (type 0x29)
 *   and builds the skeleton from that. This is the case for NPC/Monster models.
 */
export function parseDatFile(
  buffer: ArrayBuffer,
  skelMatrices?: number[][] | null,
): ParsedDatFile {
  const reader = new DatReader(buffer)
  const blocks = parseBlockChain(reader)

  const textures: ParsedTexture[] = []
  const meshes: ParsedMesh[] = []
  const textureMap = new Map<string, number>()
  let embeddedSkeleton: ParsedSkeleton | null = null

  // First pass: parse textures and check for embedded skeleton
  for (const block of blocks) {
    if (block.type === BLOCK_IMG) {
      try {
        const start = block.dataOffset + BLOCK_PADDING
        const len = block.dataLength - BLOCK_PADDING
        const result = parseTextureBlock(reader, start, len)
        if (result) {
          textureMap.set(result.name, textures.length)
          textures.push(result.texture)
        }
      } catch { /* skip */ }
    }

    if (block.type === BLOCK_BONE && !embeddedSkeleton) {
      try {
        embeddedSkeleton = parseSkeleton(reader)
      } catch { /* skip */ }
    }
  }

  // Determine which bone matrices to use:
  // 1. Embedded skeleton (found in this DAT — NPC/Monster models are self-contained)
  // 2. External skeleton (passed by caller — equipment/face attach to character skeleton)
  // 3. None (weapons, untransformed)
  const matrices = embeddedSkeleton?.matrices ?? skelMatrices ?? null

  // Second pass: parse vertex/mesh blocks with bone transforms
  for (const block of blocks) {
    if (block.type === BLOCK_VERTEX) {
      try {
        const start = block.dataOffset + BLOCK_PADDING
        const len = block.dataLength - BLOCK_PADDING
        meshes.push(...parseVertexBlock(reader, start, len, textureMap, matrices))
      } catch { /* skip */ }
    }
  }

  // Third pass: parse animation blocks (0x2B) from the same buffer.
  // NPC/Monster DATs contain embedded animations alongside mesh and skeleton data.
  let animations: ParsedAnimation[] = []
  const hasAnimBlocks = blocks.some(b => b.type === BLOCK_ANIM)
  if (hasAnimBlocks) {
    try {
      animations = parseAnimationDat(buffer)
    } catch { /* skip */ }
  }

  return { meshes, textures, skeleton: embeddedSkeleton, animations }
}

/**
 * Parse a skeleton DAT file and return the bone hierarchy with
 * pre-computed world-space matrices.
 */
export function parseSkeletonDat(buffer: ArrayBuffer): ParsedSkeleton | null {
  const reader = new DatReader(buffer)
  return parseSkeleton(reader)
}
