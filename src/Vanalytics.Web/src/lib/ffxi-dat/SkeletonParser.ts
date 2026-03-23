import { DatReader } from './DatReader'
import type { ParsedSkeleton, ParsedBone } from './types'

export function parseSkeleton(reader: DatReader): ParsedSkeleton | null {
  const bones: ParsedBone[] = []
  // TODO: Parse skeleton header to determine bone count.
  // Reference: https://github.com/galkareeve/ffxi (skeleton loading)
  if (bones.length === 0) return null
  return { bones }
}
