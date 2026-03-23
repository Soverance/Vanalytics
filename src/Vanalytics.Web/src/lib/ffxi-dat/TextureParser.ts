import { DatReader } from './DatReader'
import type { ParsedTexture } from './types'

/**
 * Unpack a RGB565 color value into RGBA bytes at the given offset in `out`.
 * Alpha is set to 255 (fully opaque).
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
 * Decompress a DXT1-encoded block texture into a flat RGBA Uint8Array.
 * DXT1 uses 4x4 pixel blocks, 8 bytes each, with 1-bit alpha.
 */
export function decompressDXT1(data: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  let srcOffset = 0

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Read two 16-bit endpoint colors and 32 bits of index data
      const c0 = data[srcOffset] | (data[srcOffset + 1] << 8)
      const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8)
      const indices =
        data[srcOffset + 4] |
        (data[srcOffset + 5] << 8) |
        (data[srcOffset + 6] << 16) |
        (data[srcOffset + 7] << 24)
      srcOffset += 8

      // Build the 4-color palette
      const palette = new Uint8Array(16) // 4 colors * 4 channels
      unpackRGB565(c0, palette, 0)
      unpackRGB565(c1, palette, 4)

      if (c0 > c1) {
        // 4-color block: interpolate two intermediate colors
        palette[8]  = ((2 * palette[0] + palette[4]) / 3) | 0
        palette[9]  = ((2 * palette[1] + palette[5]) / 3) | 0
        palette[10] = ((2 * palette[2] + palette[6]) / 3) | 0
        palette[11] = 255
        palette[12] = ((palette[0] + 2 * palette[4]) / 3) | 0
        palette[13] = ((palette[1] + 2 * palette[5]) / 3) | 0
        palette[14] = ((palette[2] + 2 * palette[6]) / 3) | 0
        palette[15] = 255
      } else {
        // 3-color block: one interpolated color + transparent black
        palette[8]  = ((palette[0] + palette[4]) / 2) | 0
        palette[9]  = ((palette[1] + palette[5]) / 2) | 0
        palette[10] = ((palette[2] + palette[6]) / 2) | 0
        palette[11] = 255
        palette[12] = 0
        palette[13] = 0
        palette[14] = 0
        palette[15] = 0
      }

      // Write pixels for this 4x4 block
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelX = bx * 4 + px
          const pixelY = by * 4 + py
          if (pixelX >= width || pixelY >= height) continue

          const bitIndex = (py * 4 + px) * 2
          const colorIndex = (indices >>> bitIndex) & 0x3
          const dstOffset = (pixelY * width + pixelX) * 4
          const palOffset = colorIndex * 4

          rgba[dstOffset + 0] = palette[palOffset + 0]
          rgba[dstOffset + 1] = palette[palOffset + 1]
          rgba[dstOffset + 2] = palette[palOffset + 2]
          rgba[dstOffset + 3] = palette[palOffset + 3]
        }
      }
    }
  }

  return rgba
}

/**
 * Decompress a DXT3-encoded block texture into a flat RGBA Uint8Array.
 * DXT3 uses 4x4 pixel blocks, 16 bytes each: 8 bytes explicit alpha + 8 bytes DXT1 color.
 */
export function decompressDXT3(data: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  const blocksX = Math.max(1, Math.ceil(width / 4))
  const blocksY = Math.max(1, Math.ceil(height / 4))
  let srcOffset = 0

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Read 8 bytes of explicit 4-bit alpha values (16 pixels)
      const alphaBytes = data.subarray(srcOffset, srcOffset + 8)
      srcOffset += 8

      // Read DXT1 color block (without alpha interpretation)
      const c0 = data[srcOffset] | (data[srcOffset + 1] << 8)
      const c1 = data[srcOffset + 2] | (data[srcOffset + 3] << 8)
      const indices =
        data[srcOffset + 4] |
        (data[srcOffset + 5] << 8) |
        (data[srcOffset + 6] << 16) |
        (data[srcOffset + 7] << 24)
      srcOffset += 8

      // Build the 4-color palette (always 4-color mode in DXT3)
      const palette = new Uint8Array(12) // 3 channels only, alpha handled separately
      const p0 = new Uint8Array(4)
      const p1 = new Uint8Array(4)
      unpackRGB565(c0, p0, 0)
      unpackRGB565(c1, p1, 0)

      palette[0] = p0[0]; palette[1] = p0[1]; palette[2] = p0[2]
      palette[3] = p1[0]; palette[4] = p1[1]; palette[5] = p1[2]
      palette[6] = ((2 * p0[0] + p1[0]) / 3) | 0
      palette[7] = ((2 * p0[1] + p1[1]) / 3) | 0
      palette[8] = ((2 * p0[2] + p1[2]) / 3) | 0
      palette[9]  = ((p0[0] + 2 * p1[0]) / 3) | 0
      palette[10] = ((p0[1] + 2 * p1[1]) / 3) | 0
      palette[11] = ((p0[2] + 2 * p1[2]) / 3) | 0

      // Write pixels for this 4x4 block
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelX = bx * 4 + px
          const pixelY = by * 4 + py
          if (pixelX >= width || pixelY >= height) continue

          const pixelIndex = py * 4 + px
          const bitIndex = pixelIndex * 2
          const colorIndex = (indices >>> bitIndex) & 0x3
          const dstOffset = (pixelY * width + pixelX) * 4
          const palOffset = colorIndex * 3

          // Extract 4-bit alpha from alphaBytes and expand to 8-bit
          const alphaByte = alphaBytes[Math.floor(pixelIndex / 2)]
          const alpha4 = (pixelIndex % 2 === 0) ? (alphaByte & 0x0f) : ((alphaByte >> 4) & 0x0f)
          const alpha8 = (alpha4 << 4) | alpha4

          rgba[dstOffset + 0] = palette[palOffset + 0]
          rgba[dstOffset + 1] = palette[palOffset + 1]
          rgba[dstOffset + 2] = palette[palOffset + 2]
          rgba[dstOffset + 3] = alpha8
        }
      }
    }
  }

  return rgba
}

/**
 * Parse textures from a DAT file reader.
 * TODO: Parse texture header to determine format (DXT1/DXT3/uncompressed), width, height, and mip count.
 * Reference: https://github.com/galkareeve/ffxi (DatLoader/TextureLoader)
 */
export function parseTextures(reader: DatReader): ParsedTexture[] {
  const textures: ParsedTexture[] = []
  // TODO: Read texture block header, detect DXT1 vs DXT3 vs raw format,
  // slice the appropriate data region, and call decompressDXT1 / decompressDXT3.
  return textures
}
