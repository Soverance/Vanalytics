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

/**
 * Read the SMMBHeader.imgID (16 chars at offset 16 after SMMBHEAD)
 * from decrypted MMB block data. This is the name used by MZB entries
 * to reference this MMB prefab.
 */
function readMmbName(decryptedData: Uint8Array): string {
  // SMMBHEAD is 16 bytes, then SMMBHeader starts with imgID[16]
  if (decryptedData.length < 32) return ''
  const bytes = decryptedData.slice(16, 32)
  let end = bytes.indexOf(0)
  if (end === -1) end = 16
  return new TextDecoder('utf-8').decode(bytes.subarray(0, end)).trim()
}

/**
 * Extract named textures from a DAT file (companion texture DATs).
 * Returns a map of texture name → ParsedTexture for merging into the zone's texture pool.
 */
export function parseTexturesFromDat(
  buffer: ArrayBuffer,
): Map<string, ParsedTexture> {
  const reader = new DatReader(buffer)
  const blocks = parseBlockChain(reader)
  const result = new Map<string, ParsedTexture>()
  const imgBlocks = blocks.filter(b => b.type === BLOCK_IMG)
  for (const block of imgBlocks) {
    try {
      const parsed = parseTextureBlock(reader, block.dataOffset + BLOCK_PADDING, block.dataLength - BLOCK_PADDING)
      if (parsed && !result.has(parsed.name)) {
        result.set(parsed.name, parsed.texture)
      }
    } catch { /* skip */ }
  }
  return result
}

export function parseZoneFile(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void,
  supplementalTextures?: Map<string, ParsedTexture>,
): ParsedZone {
  const reader = new DatReader(buffer)
  const blocks = parseBlockChain(reader)

  onProgress?.(`Block chain: ${blocks.length} blocks`)

  const textures: ParsedTexture[] = []
  const prefabs: ParsedZoneMesh[] = []
  const instances: ZoneMeshInstance[] = []

  // ── Pass 1: Textures (with name→index map) ──
  const imgBlocks = blocks.filter(b => b.type === BLOCK_IMG)
  onProgress?.(`Parsing ${imgBlocks.length} textures...`)
  const textureNameMap = new Map<string, number>()
  const duplicateNames: string[] = []
  for (const block of imgBlocks) {
    try {
      const result = parseTextureBlock(reader, block.dataOffset + BLOCK_PADDING, block.dataLength - BLOCK_PADDING)
      if (result) {
        if (textureNameMap.has(result.name)) {
          duplicateNames.push(`"${result.name}" (first=${textureNameMap.get(result.name)}, dup=${textures.length}, ${result.texture.width}×${result.texture.height})`)
          // Keep first occurrence — later duplicates are often weather/LOD variants
        } else {
          textureNameMap.set(result.name, textures.length)
        }
        textures.push(result.texture)
      }
    } catch { /* skip */ }
  }
  onProgress?.(`Textures: ${textures.length} parsed (${textureNameMap.size} named)`)
  console.log('[ZoneFile] textureNameMap entries:', Array.from(textureNameMap.keys()).sort())
  if (duplicateNames.length > 0) {
    console.warn(`[ZoneFile] ${duplicateNames.length} duplicate texture names (last wins):`, duplicateNames)
  }
  // Log first 10 textures with dimensions and first pixel to verify data integrity
  console.log('[ZoneFile] First textures:', textures.slice(0, 10).map((t, i) => {
    const r = t.rgba[0], g = t.rgba[1], b = t.rgba[2], a = t.rgba[3]
    return `[${i}] ${t.width}×${t.height} px0=(${r},${g},${b},${a})`
  }))

  // Merge supplemental textures from companion DATs (only add names not already present)
  if (supplementalTextures) {
    let added = 0
    for (const [name, tex] of supplementalTextures) {
      if (!textureNameMap.has(name)) {
        textureNameMap.set(name, textures.length)
        textures.push(tex)
        added++
      }
    }
    if (added > 0) {
      onProgress?.(`Supplemental textures: ${added} added from companion DATs`)
      console.log(`[ZoneFile] ${added} supplemental textures merged, total now ${textures.length}`)
    }
  }

  // ── Pass 2: MMB prefabs (with name tracking) ──
  const mmbBlocks = blocks.filter(b => b.type === BLOCK_MMB)
  onProgress?.(`Parsing ${mmbBlocks.length} MMB blocks...`)

  // Map: MMB name → array of { startIdx, count } in the flat prefabs array.
  // Multiple MMB blocks can share a name (different pieces of the same area).
  const mmbNameMap = new Map<string, { startIdx: number; count: number }[]>()

  // MMB block names for sky objects rendered by our procedural sky instead
  const skyObjectNames = new Set(['sunsphere', 'moonsphere'])

  for (let i = 0; i < mmbBlocks.length; i++) {
    const block = mmbBlocks[i]
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMmb(blockData)
      const name = readMmbName(decryptedData)

      // Skip sky objects — rendered by our procedural sky instead
      if (skyObjectNames.has(name)) continue

      const meshes = parseMmbBlock(decryptedData)

      // Resolve texture names to material indices
      for (const mesh of meshes) {
        if (!mesh.textureName) {
          // Blank texture name — resolved after all MMB blocks are parsed
          mesh.materialIndex = -1
          continue
        }
        const texIdx = textureNameMap.get(mesh.textureName)
        if (texIdx !== undefined) {
          mesh.materialIndex = texIdx
        } else {
          mesh.materialIndex = -1
        }
      }

      if (meshes.length > 0) {
        const startIdx = prefabs.length
        prefabs.push(...meshes)
        // Accumulate ALL blocks per name — zones have multiple blocks with the same name
        let arr = mmbNameMap.get(name)
        if (!arr) {
          arr = []
          mmbNameMap.set(name, arr)
        }
        arr.push({ startIdx, count: meshes.length })
      }
    } catch { /* skip */ }
  }
  // Assign fallback texture to blank-name meshes using the zone's most-used texture.
  // These meshes have 16 ASCII spaces as their texture name (blank), meaning they
  // should use the zone's primary terrain texture. We find it by usage frequency.
  const texUsage = new Map<number, number>()
  for (const p of prefabs) {
    if (p.materialIndex >= 0) texUsage.set(p.materialIndex, (texUsage.get(p.materialIndex) || 0) + 1)
  }
  let fallbackTexIdx = -1
  let fallbackMax = 0
  for (const [idx, count] of texUsage) {
    if (count > fallbackMax) { fallbackMax = count; fallbackTexIdx = idx }
  }
  if (fallbackTexIdx >= 0) {
    let count = 0
    for (const p of prefabs) {
      if (p.materialIndex === -1) { p.materialIndex = fallbackTexIdx; count++ }
    }
    if (count > 0) console.log(`[ZoneFile] ${count} untextured meshes → fallback texture[${fallbackTexIdx}]`)
  }

  onProgress?.(`MMB: ${prefabs.length} meshes from ${mmbBlocks.length} blocks, ${mmbNameMap.size} unique names`)

  // ── Pass 3: MZB transforms (with name-based lookup) ──
  const mzbBlocks = blocks.filter(b => b.type === BLOCK_MZB)
  onProgress?.(`Parsing ${mzbBlocks.length} MZB blocks...`)

  for (const block of mzbBlocks) {
    const start = block.dataOffset + BLOCK_PADDING
    const len = block.dataLength - BLOCK_PADDING
    if (len <= 0) continue
    try {
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMzb(blockData)
      const rawInstances = parseMzbBlock(decryptedData)

      // Map MZB entry names to prefab indices
      for (let i = 0; i < rawInstances.length; i++) {
        const entryOffset = 32 + i * 100  // SMZBHeader(32) + i * sizeof(SMZBBlock100)
        if (entryOffset + 16 > decryptedData.length) break

        // Read id[16] as string
        const idBytes = decryptedData.slice(entryOffset, entryOffset + 16)
        let end = idBytes.indexOf(0)
        if (end === -1) end = 16
        const name = new TextDecoder('utf-8').decode(idBytes.subarray(0, end)).trim()

        const mappings = mmbNameMap.get(name)
        if (!mappings) continue

        const inst = rawInstances[i]
        // Create instances for ALL meshes across ALL MMB blocks with this name
        for (const mapping of mappings) {
          for (let m = 0; m < mapping.count; m++) {
            instances.push({
              meshIndex: mapping.startIdx + m,
              transform: inst.transform,
            })
          }
        }
      }
    } catch (err) {
      onProgress?.(`Warning: MZB parse failed — ${err}`)
    }
  }

  const unmatchedCount = (() => {
    // Count how many MZB entries didn't match any MMB name
    let total = 0
    let matched = 0
    for (const block of mzbBlocks) {
      const start = block.dataOffset + BLOCK_PADDING
      const len = block.dataLength - BLOCK_PADDING
      if (len <= 0) continue
      const blockData = new Uint8Array(buffer, start, len)
      const decryptedData = decodeMzb(blockData)
      const count = (decryptedData[4] | (decryptedData[5] << 8) | (decryptedData[6] << 16)) & 0xFFFFFF
      total = count
      for (let i = 0; i < count; i++) {
        const off = 32 + i * 100
        if (off + 16 > decryptedData.length) break
        const idBytes = decryptedData.slice(off, off + 16)
        let end = idBytes.indexOf(0)
        if (end === -1) end = 16
        const name = new TextDecoder('utf-8').decode(idBytes.subarray(0, end)).trim()
        if (mmbNameMap.has(name) && mmbNameMap.get(name)!.length > 0) matched++
      }
    }
    return { total, matched }
  })()

  onProgress?.(`Instances: ${instances.length} (${unmatchedCount.matched}/${unmatchedCount.total} MZB entries matched MMB names)`)
  onProgress?.(`Result: ${prefabs.length} prefabs, ${instances.length} instances, ${textures.length} textures`)

  return { prefabs, instances, textures }
}
