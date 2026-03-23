import { DatReader } from './DatReader'
import { parseTextureBlock } from './TextureParser'
import { parseVertexBlock } from './MeshParser'
import { parseSkeleton } from './SkeletonParser'
import type { ParsedDatFile, ParsedMesh, ParsedTexture, ParsedSkeleton } from './types'

/** Block type constants */
const BLOCK_IMG = 0x20
const BLOCK_VERTEX = 0x2A
const BLOCK_END = 0x00

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

    if (nextUnits === 0 || type === BLOCK_END) break
    offset += blockSize
    if (blocks.length > 100) break
  }

  return blocks
}

/**
 * Parse an FFXI equipment DAT file.
 *
 * @param buffer - Raw DAT file contents
 * @param skelMatrices - Pre-computed bone matrices from the skeleton DAT.
 *   Required for armor (which stores vertices in bone-local space).
 *   Weapons work without skeleton since they use a single bone at identity.
 *   Pass null to skip bone transforms.
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

  // First pass: parse textures
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
  }

  // Second pass: parse vertex/mesh blocks with bone transforms
  for (const block of blocks) {
    if (block.type === BLOCK_VERTEX) {
      try {
        const start = block.dataOffset + BLOCK_PADDING
        const len = block.dataLength - BLOCK_PADDING
        meshes.push(...parseVertexBlock(reader, start, len, textureMap, skelMatrices))
      } catch { /* skip */ }
    }
  }

  return { meshes, textures, skeleton: null }
}

/**
 * Parse a skeleton DAT file and return the bone hierarchy with
 * pre-computed world-space matrices.
 */
export function parseSkeletonDat(buffer: ArrayBuffer): ParsedSkeleton | null {
  const reader = new DatReader(buffer)
  return parseSkeleton(reader)
}
