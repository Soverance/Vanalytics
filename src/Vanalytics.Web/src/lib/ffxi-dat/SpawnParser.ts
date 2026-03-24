// DatReader will be imported here once the binary format is researched.
// import { DatReader } from './DatReader'

export interface SpawnPoint {
  entityId: number
  x: number
  y: number
  z: number
  rotation: number
  groupId?: number
}

/**
 * Parse NPC/enemy spawn data from a zone's NPC DAT file.
 * Binary format requires research. Returns empty array until implemented.
 */
export function parseSpawnDat(_buffer: ArrayBuffer): SpawnPoint[] {
  // TODO: Implement based on binary format research.
  // Fallback: use LandSandBoat mob_spawn_points.sql as server-side data source.
  return []
}
