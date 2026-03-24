import { FileTableResolver } from './FileTableResolver'
import { DatReader } from './DatReader'

const DATHEAD_SIZE = 8
const BLOCK_TYPE_MZB = 0x1C
const BLOCK_TYPE_MMB = 0x2E
const MAX_BLOCKS_TO_CHECK = 20
const MIN_FILE_SIZE = 1024

export interface ScanResult { modelPath: string }
export interface ScanProgress { current: number; total: number; found: number; message: string }

export async function scanForZoneDats(
  readFile: (path: string) => Promise<ArrayBuffer | null>,
  resolver: FileTableResolver,
  onProgress?: (progress: ScanProgress) => void,
  signal?: AbortSignal
): Promise<ScanResult[]> {
  const results: ScanResult[] = []
  const fileIds: { id: number; path: string }[] = []
  for (let id = 0; id < 100000; id++) {
    const path = resolver.resolveFileId(id)
    if (path) fileIds.push({ id, path })
  }
  const total = fileIds.length
  onProgress?.({ current: 0, total, found: 0, message: `Scanning ${total} files...` })

  for (let i = 0; i < fileIds.length; i++) {
    if (signal?.aborted) break
    const { path } = fileIds[i]
    if (i % 100 === 0) {
      onProgress?.({ current: i, total, found: results.length, message: `Checking ${path}...` })
    }
    try {
      const buffer = await readFile(path)
      if (!buffer || buffer.byteLength < MIN_FILE_SIZE) continue
      if (hasZoneBlockTypes(buffer)) results.push({ modelPath: path })
    } catch { /* skip */ }
  }
  onProgress?.({ current: total, total, found: results.length, message: `Scan complete. Found ${results.length} zone DATs.` })
  return results
}

function hasZoneBlockTypes(buffer: ArrayBuffer): boolean {
  const reader = new DatReader(buffer)
  let hasMzb = false, hasMmb = false, offset = 0
  for (let i = 0; i < MAX_BLOCKS_TO_CHECK; i++) {
    if (offset + DATHEAD_SIZE > reader.length) break
    reader.seek(offset)
    reader.skip(4)
    const packed = reader.readUint32()
    const type = packed & 0x7F
    const nextUnits = (packed >> 7) & 0x7FFFF
    if (type === BLOCK_TYPE_MZB) hasMzb = true
    if (type === BLOCK_TYPE_MMB) hasMmb = true
    if (hasMzb && hasMmb) return true
    if (nextUnits === 0) break
    offset += nextUnits * 16
  }
  return false
}
