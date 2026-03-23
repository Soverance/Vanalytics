import { DatReader } from './DatReader'
import { parseTextureBlock } from './TextureParser'
import { decodeMzb, decodeMmb } from './ZoneDecrypt'
import { parseMzbBlock } from './MzbParser'
import { parseMmbBlock } from './MmbParser'
import type { ParsedZone, ParsedZoneMesh, ParsedTexture, ZoneMeshInstance } from './types'

const DATHEAD_SIZE = 8
const BLOCK_PADDING = 8
const BLOCK_LIMIT = 2000

const BLOCK_IMG = 0x20
const BLOCK_MZB = 0x1C
const BLOCK_MMB = 0x2E

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
    if (blocks.length > BLOCK_LIMIT) break
  }
  return blocks
}

export function parseZoneFile(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void
): ParsedZone {
  const reader = new DatReader(buffer)
  const blocks = parseBlockChain(reader)

  // Debug: log all block types found
  const typeCounts = new Map<number, number>()
  for (const b of blocks) typeCounts.set(b.type, (typeCounts.get(b.type) ?? 0) + 1)
  const typeList = Array.from(typeCounts.entries())
    .map(([t, c]) => `0x${t.toString(16).padStart(2, '0')}=${c}`)
    .join(', ')
  onProgress?.(`Block chain: ${blocks.length} blocks, types: [${typeList}]`)

  // Debug: dump first 5 blocks for inspection
  for (let i = 0; i < Math.min(5, blocks.length); i++) {
    const b = blocks[i]
    onProgress?.(`  Block ${i}: name="${b.name}" type=0x${b.type.toString(16)} size=${b.dataLength} offset=0x${b.dataOffset.toString(16)}`)
  }

  // Debug: hex dump first 64 bytes of the largest block
  const largestBlock = blocks.reduce((a, b) => b.dataLength > a.dataLength ? b : a, blocks[0])
  if (largestBlock && largestBlock.dataLength > 100) {
    const start = largestBlock.dataOffset + BLOCK_PADDING
    const raw = new Uint8Array(buffer, start, Math.min(64, largestBlock.dataLength - BLOCK_PADDING))
    const hex = Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join(' ')
    onProgress?.(`  Largest block raw hex (offset 0x${start.toString(16)}): ${hex}`)
    // Also try reading as uint32 LE values
    const dv = new DataView(buffer, start, Math.min(32, largestBlock.dataLength - BLOCK_PADDING))
    const u32s: string[] = []
    for (let i = 0; i < 8 && i * 4 < dv.byteLength; i++) {
      u32s.push(`0x${dv.getUint32(i * 4, true).toString(16)}`)
    }
    onProgress?.(`  As uint32 LE: ${u32s.join(', ')}`)
    // Check for "MMB " or "MZB " signatures
    const sig = String.fromCharCode(raw[0], raw[1], raw[2], raw[3])
    onProgress?.(`  4-char signature: "${sig}"`)
  }

  const textures: ParsedTexture[] = []
  const prefabs: ParsedZoneMesh[] = []
  const instances: ZoneMeshInstance[] = []

  // Pass 1 — Textures
  const imgBlocks = blocks.filter(b => b.type === BLOCK_IMG)
  onProgress?.(`Parsing ${imgBlocks.length} texture block(s)...`)
  for (let i = 0; i < imgBlocks.length; i++) {
    const block = imgBlocks[i]
    try {
      const result = parseTextureBlock(reader, block.dataOffset + BLOCK_PADDING, block.dataLength - BLOCK_PADDING)
      if (result) {
        textures.push(result.texture)
      }
    } catch { /* skip */ }
    onProgress?.(`Texture ${i + 1}/${imgBlocks.length} parsed`)
  }

  // Pass 2 — MMB prefabs
  const mmbBlocks = blocks.filter(b => b.type === BLOCK_MMB)
  onProgress?.(`Parsing ${mmbBlocks.length} MMB prefab block(s)...`)
  for (let i = 0; i < mmbBlocks.length; i++) {
    const block = mmbBlocks[i]
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMmb(blockData)
      // Debug first MMB block
      if (i === 0) {
        const decHex32 = Array.from(decryptedData.slice(24, 48)).map(b => b.toString(16).padStart(2, '0')).join(' ')
        onProgress?.(`  MMB[0] dec[24..47]: ${decHex32}`)
        onProgress?.(`  MMB[0] blockSize=${len}`)
        const dv = new DataView(decryptedData.buffer, decryptedData.byteOffset, Math.min(80, decryptedData.byteLength))
        // Show uint32s at key offsets
        const offsets = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64]
        const vals = offsets.map(o => `[${o}]=0x${dv.getUint32(o, true).toString(16)}`).join(' ')
        onProgress?.(`  MMB[0] dec uint32s: ${vals}`)
        // Also try int32 at offset 32 (expected pieceCount)
        onProgress?.(`  MMB[0] pieceCount candidate at offset 32: ${dv.getInt32(32, true)}`)
        // Try reading as int16 at various offsets near 32
        onProgress?.(`  MMB[0] int16s around 32: [30]=${dv.getInt16(30, true)} [32]=${dv.getInt16(32, true)} [34]=${dv.getInt16(34, true)} [36]=${dv.getInt16(36, true)}`)
      }
      const meshes = parseMmbBlock(decryptedData)
      prefabs.push(...meshes)
      if (i < 3) onProgress?.(`MMB block ${i + 1}/${mmbBlocks.length} parsed (${meshes.length} mesh(es))`)
    } catch (err) {
      if (i < 3) onProgress?.(`Warning: MMB block ${i + 1}/${mmbBlocks.length} failed — ${err}`)
    }
  }
  onProgress?.(`MMB total: ${prefabs.length} prefab mesh(es) from ${mmbBlocks.length} blocks`)

  // Pass 3 — MZB transforms
  const mzbBlocks = blocks.filter(b => b.type === BLOCK_MZB)
  onProgress?.(`Parsing ${mzbBlocks.length} MZB transform block(s)...`)
  for (let i = 0; i < mzbBlocks.length; i++) {
    const block = mzbBlocks[i]
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      // Debug MZB block
      const rawHex = Array.from(blockData.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      onProgress?.(`  MZB[0] raw[0..31]: ${rawHex}`)
      onProgress?.(`  MZB[0] blockSize=${len}, data[0..7]=${blockData[0]},${blockData[1]},${blockData[2]},${blockData[3]},${blockData[4]},${blockData[5]},${blockData[6]},${blockData[7]}`)
      const decryptedData = decodeMzb(blockData)
      const decHex = Array.from(decryptedData.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      onProgress?.(`  MZB[0] dec[0..31]: ${decHex}`)
      const dv = new DataView(decryptedData.buffer, decryptedData.byteOffset, Math.min(32, decryptedData.byteLength))
      const h = [0,4,8,12,16,20,24,28].map(o => `0x${dv.getUint32(o, true).toString(16)}`).join(', ')
      onProgress?.(`  MZB[0] dec uint32s: ${h}`)
      const newInstances = parseMzbBlock(decryptedData)
      instances.push(...newInstances)
      onProgress?.(`MZB block ${i + 1}/${mzbBlocks.length} parsed (${newInstances.length} instance(s))`)
    } catch (err) {
      onProgress?.(`Warning: MZB block ${i + 1}/${mzbBlocks.length} failed — ${err}`)
    }
  }

  return { prefabs, instances, textures }
}
