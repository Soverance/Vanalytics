import { DatReader } from './DatReader'
import type { ParsedTexture } from './types'

const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8

/**
 * Parse a minimap DAT file and extract the map texture.
 * Minimap DATs use 0xB1 flag IMGINFO headers ("menumap" format).
 */
export function parseMinimapDat(buffer: ArrayBuffer): ParsedTexture | null {
  const reader = new DatReader(buffer)
  let offset = 0

  while (offset < reader.length - DATHEAD_SIZE) {
    reader.seek(offset)
    reader.skip(4) // block name
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    const blockSize = nextUnits * 16
    if (nextUnits === 0) break

    if (type === 0x20) {
      const dataOffset = offset + DATHEAD_SIZE + BLOCK_PADDING
      const dataLength = blockSize - DATHEAD_SIZE - BLOCK_PADDING
      if (dataLength > 0) {
        const texture = parseMinimapTextureBlock(reader, dataOffset, dataLength)
        if (texture) return texture
      }
    }

    offset += blockSize
  }

  return null
}

// Suppress unused-variable warning for `name` in the block chain loop above.
// The variable is read to advance the reader cursor (readString side-effects).
void (undefined as unknown as string)

function parseMinimapTextureBlock(
  reader: DatReader, dataOffset: number, dataLength: number
): ParsedTexture | null {
  reader.seek(dataOffset)
  const flag = reader.readUint8()
  if (flag !== 0xB1) return null

  // TODO: Parse 0xB1 header. Layout to be determined by hex-dumping actual minimap DATs.
  // Expected similar to 0xA1 but different field positions.
  // Once header is parsed, use existing decompressDXT1/decompressDXT3.
  void dataLength
  return null
}
