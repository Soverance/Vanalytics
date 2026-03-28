import { DatReader } from './DatReader'
import type { ParsedTexture } from './types'

/**
 * Unpack a RGB565 color value into RGBA bytes at the given offset in `out`.
 */
export function unpackRGB565(color: number, out: Uint8Array, offset: number): void {
  const r = ((color >> 11) & 0x1f) << 3
  const g = ((color >> 5) & 0x3f) << 2
  const b = (color & 0x1f) << 3
  out[offset + 0] = r | (r >> 5)
  out[offset + 1] = g | (g >> 6)
  out[offset + 2] = b | (b >> 5)
  out[offset + 3] = 255
}

/**
 * Decompress DXT1-encoded block data into RGBA pixels.
 * DXT1: 8 bytes per 4×4 pixel block, 4:1 compression, optional 1-bit alpha.
 */
export function decompressDXT1(data: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  let src = 0

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const c0 = data[src] | (data[src + 1] << 8)
      const c1 = data[src + 2] | (data[src + 3] << 8)
      const idx = data[src + 4] | (data[src + 5] << 8) | (data[src + 6] << 16) | (data[src + 7] << 24)
      src += 8

      const pal = new Uint8Array(16)
      unpackRGB565(c0, pal, 0)
      unpackRGB565(c1, pal, 4)

      if (c0 > c1) {
        for (let i = 0; i < 3; i++) {
          pal[8 + i] = ((2 * pal[i] + pal[4 + i]) / 3) | 0
          pal[12 + i] = ((pal[i] + 2 * pal[4 + i]) / 3) | 0
        }
        pal[11] = 255; pal[15] = 255
      } else {
        for (let i = 0; i < 3; i++) pal[8 + i] = ((pal[i] + pal[4 + i]) / 2) | 0
        pal[11] = 255
        // DXT1 1-bit alpha: c0<=c1 makes 4th color transparent.
        // FFXI uses DXT3 for actual transparency (foliage etc) and controls
        // blending via per-mesh flags — DXT1 alpha is not used intentionally.
        // Force opaque to prevent ground/wall texture holes.
        pal[15] = 255
      }

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py
          if (x >= width || y >= height) continue
          const ci = (idx >>> ((py * 4 + px) * 2)) & 3
          const d = (y * width + x) * 4
          rgba[d] = pal[ci * 4]; rgba[d + 1] = pal[ci * 4 + 1]; rgba[d + 2] = pal[ci * 4 + 2]; rgba[d + 3] = pal[ci * 4 + 3]
        }
      }
    }
  }
  return rgba
}

/**
 * Decompress DXT3-encoded block data into RGBA pixels.
 * DXT3: 16 bytes per 4×4 block — 8 bytes explicit 4-bit alpha + 8 bytes DXT1 color.
 */
export function decompressDXT3(data: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  let src = 0

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const alpha = data.subarray(src, src + 8)
      src += 8

      const c0 = data[src] | (data[src + 1] << 8)
      const c1 = data[src + 2] | (data[src + 3] << 8)
      const idx = data[src + 4] | (data[src + 5] << 8) | (data[src + 6] << 16) | (data[src + 7] << 24)
      src += 8

      const p0 = new Uint8Array(4), p1 = new Uint8Array(4)
      unpackRGB565(c0, p0, 0); unpackRGB565(c1, p1, 0)
      const pal = [
        [p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]],
        [((2 * p0[0] + p1[0]) / 3) | 0, ((2 * p0[1] + p1[1]) / 3) | 0, ((2 * p0[2] + p1[2]) / 3) | 0],
        [((p0[0] + 2 * p1[0]) / 3) | 0, ((p0[1] + 2 * p1[1]) / 3) | 0, ((p0[2] + 2 * p1[2]) / 3) | 0],
      ]

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py
          if (x >= width || y >= height) continue
          const pi = py * 4 + px
          const ci = (idx >>> (pi * 2)) & 3
          const d = (y * width + x) * 4
          const a4 = (pi % 2 === 0) ? (alpha[pi >> 1] & 0xF) : ((alpha[pi >> 1] >> 4) & 0xF)
          rgba[d] = pal[ci][0]; rgba[d + 1] = pal[ci][1]; rgba[d + 2] = pal[ci][2]; rgba[d + 3] = (a4 << 4) | a4
        }
      }
    }
  }
  return rgba
}

/**
 * Parse a texture from an IMG block (type 0x20).
 *
 * FFXI texture blocks contain an IMGINFO header followed by pixel data.
 * The header flag byte determines the format:
 *   0xA1 = IMGINFOA1 (DXT compressed, with ddsType field)
 *   0x81 = IMGINFO81 (DXT compressed, variant)
 *   0xB1 = IMGINFOB1 (256-color palette-indexed, BGRA palette + 8-bit pixels)
 *   0x01 = Raw 8-bit indexed with palette
 *
 * IMGINFOA1 layout (69 bytes):
 *   flg(1) + id(16) + unk(4) + width(4) + height(4) + unk2(24) + widthbyte(4)
 *   + ddsType(4) + ddsSize(4) + noBlock(4)
 *
 * IMGINFOB1 layout:
 *   flg(1) + id(16) + unk(4) + width(4) + height(4) + padding(35)
 *   = 64-byte header, then 256-entry BGRA palette (1024 bytes),
 *   then width×height bytes of indexed pixel data.
 *   Falls back to DXT decoding if data doesn't fit indexed format.
 *
 * ddsType: "3TXD" = DXT3, "1TXD" = DXT1 (stored as reversed ASCII)
 *
 * Reference: TDWAnalysis.h IMGINFOA1 struct
 */

const B1_HEADER_SIZE = 64
const B1_PALETTE_ENTRIES = 256
const B1_PALETTE_SIZE = B1_PALETTE_ENTRIES * 4 // 1024 bytes (BGRA per entry)

export function parseTextureBlock(
  reader: DatReader,
  dataOffset: number,
  dataLength: number,
): { name: string; texture: ParsedTexture } | null {
  reader.seek(dataOffset)

  const flg = reader.readUint8()

  if (flg !== 0xA1 && flg !== 0x81 && flg !== 0xB1) {
    console.warn(`[TextureParser] Unsupported texture format 0x${flg.toString(16).toUpperCase()} at offset ${dataOffset}`)
    return null
  }

  const id = reader.readString(16)
  reader.skip(4) // dwnazo1
  const width = reader.readInt32()
  const height = reader.readInt32()

  if (width <= 0 || width > 4096 || height <= 0 || height > 4096) return null

  if (flg === 0xB1) {
    return parseB1Texture(reader, dataOffset, dataLength, id.trim(), width, height)
  }

  reader.skip(24) // dwnazo2[6]
  reader.skip(4)  // widthbyte

  if (flg === 0xA1) {
    const ddsType = reader.readString(4) // "3TXD" or "1TXD"
    const ddsSize = reader.readUint32()
    reader.skip(4) // noBlock

    // Read compressed pixel data
    const pixelData = reader.readBytes(ddsSize)

    let rgba: Uint8Array
    if (ddsType === '3TXD') {
      rgba = decompressDXT3(pixelData, width, height)
    } else if (ddsType === '1TXD') {
      rgba = decompressDXT1(pixelData, width, height)
    } else {
      return null // Unknown DDS type
    }

    return {
      name: id.trim(),
      texture: { width, height, rgba },
    }
  }

  if (flg === 0x81) {
    // 0x81 variant: similar but may have slightly different header
    // Skip to find DDS header after the base fields
    // IMGINFO81_DDS: ddsType(4) + size(4) + noBlock(4)
    const ddsType = reader.readString(4)
    const ddsSize = reader.readUint32()
    reader.skip(4)

    const pixelData = reader.readBytes(ddsSize)

    let rgba: Uint8Array
    if (ddsType === '3TXD') {
      rgba = decompressDXT3(pixelData, width, height)
    } else if (ddsType === '1TXD') {
      rgba = decompressDXT1(pixelData, width, height)
    } else {
      return null
    }

    return {
      name: id.trim(),
      texture: { width, height, rgba },
    }
  }

  return null
}

/**
 * Parse a 0xB1 palette-indexed texture.
 * Format: 64-byte header → 256-entry BGRA palette (1024 bytes) → 8-bit indexed pixels.
 * Falls back to DXT decoding if data doesn't fit the indexed layout.
 */
function parseB1Texture(
  reader: DatReader,
  dataOffset: number,
  dataLength: number,
  name: string,
  width: number,
  height: number,
): { name: string; texture: ParsedTexture } | null {
  const paletteOffset = dataOffset + B1_HEADER_SIZE
  const pixelOffset = paletteOffset + B1_PALETTE_SIZE
  const pixelCount = width * height

  // Check if data fits the palette-indexed layout
  if (pixelOffset + pixelCount > dataOffset + dataLength) {
    // Not enough data for indexed format — try DXT fallback
    return parseB1AsDXT(reader, dataOffset, dataLength, name, width, height)
  }

  // Read the 256-entry BGRA palette
  reader.seek(paletteOffset)
  const palette = reader.readBytes(B1_PALETTE_SIZE)

  // Read indexed pixel data
  reader.seek(pixelOffset)
  const indices = reader.readBytes(pixelCount)

  // Convert indexed pixels to RGBA (no vertical flip — zone textures are top-down)
  // Palette format is BGRA; alpha 0x80 means fully opaque in FFXI's palette convention
  const rgba = new Uint8Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    const idx = indices[i]
    const pOff = idx * 4
    const d = i * 4
    rgba[d + 0] = palette[pOff + 2] // R (from BGRA byte 2)
    rgba[d + 1] = palette[pOff + 1] // G (from BGRA byte 1)
    rgba[d + 2] = palette[pOff + 0] // B (from BGRA byte 0)
    // FFXI palette alpha: 0x80 = opaque, 0x00 = transparent
    const a = palette[pOff + 3]
    rgba[d + 3] = a > 0 ? 255 : 0
  }

  return { name, texture: { width, height, rgba } }
}

/** Fallback: try DXT decoding for 0xB1 blocks that don't fit the indexed format. */
function parseB1AsDXT(
  reader: DatReader,
  dataOffset: number,
  dataLength: number,
  name: string,
  width: number,
  height: number,
): { name: string; texture: ParsedTexture } | null {
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  const expectedDXT3 = blocksX * blocksY * 16
  const expectedDXT1 = blocksX * blocksY * 8

  if (dataLength >= expectedDXT3 + B1_HEADER_SIZE) {
    const pixelOffset = dataOffset + dataLength - expectedDXT3
    reader.seek(pixelOffset)
    const pixelData = reader.readBytes(expectedDXT3)
    return { name, texture: { width, height, rgba: decompressDXT3(pixelData, width, height) } }
  }

  if (dataLength >= expectedDXT1 + B1_HEADER_SIZE) {
    const pixelOffset = dataOffset + dataLength - expectedDXT1
    reader.seek(pixelOffset)
    const pixelData = reader.readBytes(expectedDXT1)
    return { name, texture: { width, height, rgba: decompressDXT1(pixelData, width, height) } }
  }

  console.warn(`[TextureParser] 0xB1 texture "${name}" (${width}×${height}) doesn't fit indexed or DXT layout`)
  return null
}

/** @deprecated Use parseTextureBlock instead */
export function parseTextures(_reader: DatReader): ParsedTexture[] {
  return []
}
