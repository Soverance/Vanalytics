import { DatReader } from './DatReader'
import { parseMeshes } from './MeshParser'
import { parseTextures } from './TextureParser'
import { parseSkeleton } from './SkeletonParser'
import type { ParsedDatFile } from './types'

export function parseDatFile(buffer: ArrayBuffer): ParsedDatFile {
  const reader = new DatReader(buffer)
  const result: ParsedDatFile = { meshes: [], textures: [], skeleton: null }

  try { reader.seek(0); result.meshes = parseMeshes(reader) } catch { /* Not a mesh DAT */ }
  try { reader.seek(0); result.textures = parseTextures(reader) } catch { /* Not a texture DAT */ }
  try { reader.seek(0); result.skeleton = parseSkeleton(reader) } catch { /* Not a skeleton DAT */ }

  return result
}
