import { DatReader } from './DatReader'
import type { ParsedMesh } from './types'

export function triangleStripToList(stripIndices: number[]): number[] {
  const triangles: number[] = []
  for (let i = 0; i < stripIndices.length - 2; i++) {
    const a = stripIndices[i]
    const b = stripIndices[i + 1]
    const c = stripIndices[i + 2]
    if (a === b || b === c || a === c) continue
    if (i % 2 === 0) triangles.push(a, b, c)
    else triangles.push(a, c, b)
  }
  return triangles
}

export function parseMeshes(reader: DatReader): ParsedMesh[] {
  const meshes: ParsedMesh[] = []
  // TODO: Parse mesh header to determine mesh count and offsets.
  // Reference: https://github.com/galkareeve/ffxi (DatLoader/ModelLoader)
  // Reference: https://github.com/Maphesdus/FFXI_Modding (MMB viewer)
  return meshes
}
