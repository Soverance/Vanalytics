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
      // Debug first MMB block — check padding bytes
      if (i === 0) {
        // Show the 8 "padding" bytes we currently skip
        const padStart = block.dataOffset
        const padBytes = new Uint8Array(buffer, padStart, 8)
        const padHex = Array.from(padBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
        const padAscii = Array.from(padBytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')
        onProgress?.(`  MMB[0] padding bytes (dataOffset+0..7): ${padHex} "${padAscii}"`)
        // Show data after padding (what we pass to decode)
        const dataHex = Array.from(blockData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
        const dataAscii = Array.from(blockData.slice(0, 16)).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')
        onProgress?.(`  MMB[0] data bytes (after padding, 0..15): ${dataHex} "${dataAscii}"`)
        onProgress?.(`  MMB[0] blockSize=${len}, data[3]=${blockData[3]}, data[5]=${blockData[5]}`)
        // Now try WITHOUT padding — read from dataOffset directly
        const noPadData = new Uint8Array(buffer, block.dataOffset, Math.min(32, block.dataLength))
        const noPadHex = Array.from(noPadData).map(b => b.toString(16).padStart(2, '0')).join(' ')
        const noPadAscii = Array.from(noPadData).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')
        onProgress?.(`  MMB[0] NO-pad data (dataOffset+0..31): ${noPadHex}`)
        onProgress?.(`  MMB[0] NO-pad ASCII: "${noPadAscii}"`)
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

  // Debug: summarize parsed data
  if (prefabs.length > 0) {
    const p0 = prefabs[0]
    onProgress?.(`  Prefab[0]: ${p0.vertices.length / 3} verts, ${p0.indices.length} indices, mat=${p0.materialIndex}`)
    if (p0.vertices.length >= 9) {
      onProgress?.(`  Prefab[0] first vert: (${p0.vertices[0].toFixed(2)}, ${p0.vertices[1].toFixed(2)}, ${p0.vertices[2].toFixed(2)})`)
    }
  }
  if (instances.length > 0) {
    const i0 = instances[0]
    onProgress?.(`  Instance[0]: meshIndex=${i0.meshIndex}, transform=[${i0.transform.slice(0, 4).map(v => v.toFixed(3)).join(', ')}, ...]`)
    // Check meshIndex range
    const maxMeshIdx = Math.max(...instances.map(i => i.meshIndex))
    const minMeshIdx = Math.min(...instances.map(i => i.meshIndex))
    const validCount = instances.filter(i => i.meshIndex < prefabs.length).length
    onProgress?.(`  Instance meshIndex range: ${minMeshIdx}..${maxMeshIdx}, valid (< ${prefabs.length}): ${validCount}/${instances.length}`)
    // Dump raw id[16] bytes for first 3 instances from MZB data
    const mzbBlock = blocks.find(b => b.type === BLOCK_MZB)
    if (mzbBlock) {
      const mzbStart = mzbBlock.dataOffset + BLOCK_PADDING
      const mzbLen = mzbBlock.dataLength - BLOCK_PADDING
      const mzbData = decodeMzb(new Uint8Array(buffer, mzbStart, mzbLen))
      for (let ii = 0; ii < 3; ii++) {
        const entryOff = 32 + ii * 100  // SMZBHeader(32) + entry * 100
        const idBytes = mzbData.slice(entryOff, entryOff + 16)
        const hex = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
        const ascii = Array.from(idBytes).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')
        // Also read all remaining fields
        const dv = new DataView(mzbData.buffer, mzbData.byteOffset + entryOff, 100)
        const fields = {
          transX: dv.getFloat32(16, true), transY: dv.getFloat32(20, true), transZ: dv.getFloat32(24, true),
          rotX: dv.getFloat32(28, true), rotY: dv.getFloat32(32, true), rotZ: dv.getFloat32(36, true),
          scaleX: dv.getFloat32(40, true), scaleY: dv.getFloat32(44, true), scaleZ: dv.getFloat32(48, true),
          fa: dv.getFloat32(52, true), fb: dv.getFloat32(56, true), fc: dv.getFloat32(60, true), fd: dv.getFloat32(64, true),
          fe: dv.getInt32(68, true), ff: dv.getInt32(72, true), fg: dv.getInt32(76, true), fh: dv.getInt32(80, true),
          fi: dv.getInt32(84, true), fj: dv.getInt32(88, true), fk: dv.getInt32(92, true), fl: dv.getInt32(96, true),
        }
        onProgress?.(`  MZB entry[${ii}] id hex: ${hex}  ascii: "${ascii}"`)
        onProgress?.(`  MZB entry[${ii}] trans=(${fields.transX.toFixed(1)},${fields.transY.toFixed(1)},${fields.transZ.toFixed(1)}) rot=(${fields.rotX.toFixed(3)},${fields.rotY.toFixed(3)},${fields.rotZ.toFixed(3)}) scale=(${fields.scaleX.toFixed(3)},${fields.scaleY.toFixed(3)},${fields.scaleZ.toFixed(3)})`)
        onProgress?.(`  MZB entry[${ii}] fa-fd=(${fields.fa.toFixed(1)},${fields.fb.toFixed(1)},${fields.fc.toFixed(1)},${fields.fd.toFixed(1)}) fe-fh=(${fields.fe},${fields.ff},${fields.fg},${fields.fh}) fi-fl=(${fields.fi},${fields.fj},${fields.fk},${fields.fl})`)
      }
    }
  }

  return { prefabs, instances, textures }
}
