import { DatReader } from './DatReader'
import type { ParsedTexture } from './types'
import { decompressDXT1, decompressDXT3 } from './TextureParser'

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

/**
 * 0xB1 "menumap" IMGINFO header layout (from hex dump analysis):
 *
 *   +0x00: flag (1 byte) = 0xB1
 *   +0x01: id string (16 bytes) e.g. "menumap m_102_00"
 *   +0x11: unknown (4 bytes)
 *   +0x15: width (4 bytes, uint32 LE)
 *   +0x19: height (4 bytes, uint32 LE)
 *   +0x1D..0x3F: unknown header fields + padding (35 bytes)
 *   +0x40: 256-entry RGBA palette (1024 bytes)
 *   +0x440: 8-bit indexed pixel data (width * height bytes)
 *
 * Total header + palette = 64 + 1024 = 1088 bytes before pixel data.
 * Each pixel byte is an index into the 256-color palette.
 */
const B1_HEADER_SIZE = 64
const B1_PALETTE_ENTRIES = 256
const B1_PALETTE_SIZE = B1_PALETTE_ENTRIES * 4 // 1024 bytes (RGBA per entry)

function parseMinimapTextureBlock(
  reader: DatReader, dataOffset: number, dataLength: number
): ParsedTexture | null {
  reader.seek(dataOffset)
  const flg = reader.readUint8()

  // Handle standard 0xA1/0x81 IMGINFO (some minimap DATs may use these)
  if (flg === 0xA1 || flg === 0x81) {
    return parseA1Style(reader, dataOffset)
  }

  if (flg !== 0xB1) return null

  // Read dimensions
  reader.seek(dataOffset + 0x15)
  const width = reader.readInt32()
  const height = reader.readInt32()

  if (width <= 0 || width > 2048 || height <= 0 || height > 2048) return null

  const paletteOffset = dataOffset + B1_HEADER_SIZE
  const pixelOffset = paletteOffset + B1_PALETTE_SIZE
  const pixelCount = width * height

  // Verify we have enough data for palette + indexed pixels
  if (pixelOffset + pixelCount > dataOffset + dataLength) {
    // Not enough data for 8-bit indexed — fall back to DXT
    return parseB1AsDXT(reader, dataOffset, dataLength, width, height)
  }

  // Read the 256-entry BGRA palette (FFXI stores palette as BGRA)
  reader.seek(paletteOffset)
  const palette = reader.readBytes(B1_PALETTE_SIZE)

  // Read indexed pixel data
  reader.seek(pixelOffset)
  const indices = reader.readBytes(pixelCount)

  // Convert indexed pixels to RGBA, flipping vertically only
  // (FFXI stores minimap pixels bottom-up)
  // Palette format is BGRA; alpha 0x80 means fully opaque in FFXI's palette convention
  const rgba = new Uint8Array(pixelCount * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = y * width
    const dstRow = (height - 1 - y) * width
    for (let x = 0; x < width; x++) {
      const idx = indices[srcRow + x]
      const pOff = idx * 4
      const d = (dstRow + x) * 4
      rgba[d + 0] = palette[pOff + 2] // R (from BGRA byte 2)
      rgba[d + 1] = palette[pOff + 1] // G (from BGRA byte 1)
      rgba[d + 2] = palette[pOff + 0] // B (from BGRA byte 0)
      // FFXI palette alpha: 0x80 = opaque, 0x00 = transparent
      const a = palette[pOff + 3]
      rgba[d + 3] = a > 0 ? 255 : 0
    }
  }

  return { width, height, rgba }
}

/** Fallback: try DXT decoding for 0xB1 blocks that don't fit the indexed format. */
function parseB1AsDXT(
  reader: DatReader, dataOffset: number, dataLength: number,
  width: number, height: number
): ParsedTexture | null {
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  const expectedDXT3 = blocksX * blocksY * 16
  const expectedDXT1 = blocksX * blocksY * 8

  if (dataLength >= expectedDXT3 + B1_HEADER_SIZE) {
    const pixelOffset = dataOffset + dataLength - expectedDXT3
    reader.seek(pixelOffset)
    const pixelData = reader.readBytes(expectedDXT3)
    return { width, height, rgba: decompressDXT3(pixelData, width, height) }
  }

  if (dataLength >= expectedDXT1 + B1_HEADER_SIZE) {
    const pixelOffset = dataOffset + dataLength - expectedDXT1
    reader.seek(pixelOffset)
    const pixelData = reader.readBytes(expectedDXT1)
    return { width, height, rgba: decompressDXT1(pixelData, width, height) }
  }

  return null
}

/** Parse standard 0xA1/0x81 IMGINFO header (same as TextureParser). */
function parseA1Style(reader: DatReader, dataOffset: number): ParsedTexture | null {
  reader.seek(dataOffset + 1) // skip flag byte
  reader.skip(16) // id
  reader.skip(4)  // dwnazo1
  const width = reader.readInt32()
  const height = reader.readInt32()
  reader.skip(24) // dwnazo2[6]
  reader.skip(4)  // widthbyte

  if (width <= 0 || width > 2048 || height <= 0 || height > 2048) return null

  const ddsType = reader.readString(4) // "3TXD" or "1TXD"
  const ddsSize = reader.readUint32()
  reader.skip(4) // noBlock

  if (ddsSize === 0) return null
  const pixelData = reader.readBytes(ddsSize)

  let rgba: Uint8Array
  if (ddsType === '3TXD') {
    rgba = decompressDXT3(pixelData, width, height)
  } else if (ddsType === '1TXD') {
    rgba = decompressDXT1(pixelData, width, height)
  } else {
    return null
  }

  return { width, height, rgba }
}
