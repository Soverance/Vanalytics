/**
 * Resolves FFXI internal file IDs to ROM-relative DAT file paths
 * by parsing VTABLE.DAT and FTABLE.DAT from the user's FFXI installation.
 *
 * Format:
 * - VTABLE.DAT: byte array, one byte per file ID. Value indicates ROM folder:
 *   0 = not present, 1 = ROM/, 2 = ROM2/, 3 = ROM3/, etc.
 * - FTABLE.DAT: uint16 array (little-endian), one entry per file ID.
 *   folder = value >> 7, file = value & 0x7F
 *   Path = ROM{n}/{folder}/{file}.dat
 *
 * The game client uses the same lookup at runtime to resolve assets.
 */

export class FileTableResolver {
  private vtable: Uint8Array
  private ftable: Uint16Array

  private constructor(vtable: Uint8Array, ftable: Uint16Array) {
    this.vtable = vtable
    this.ftable = ftable
  }

  /**
   * Load and parse VTABLE.DAT and FTABLE.DAT from an FFXI directory handle.
   */
  static async fromDirectory(
    readFile: (path: string) => Promise<ArrayBuffer>
  ): Promise<FileTableResolver> {
    const [vtableBuffer, ftableBuffer] = await Promise.all([
      readFile('VTABLE.DAT'),
      readFile('FTABLE.DAT'),
    ])

    const vtable = new Uint8Array(vtableBuffer)
    const ftable = new Uint16Array(ftableBuffer)

    return new FileTableResolver(vtable, ftable)
  }

  /**
   * Resolve a file ID to a ROM-relative path.
   * Returns null if the file ID is not present.
   *
   * Example: resolveFileId(1234) → "ROM/28/7.dat"
   */
  resolveFileId(fileId: number): string | null {
    if (fileId < 0 || fileId >= this.vtable.length) return null

    const romNum = this.vtable[fileId]
    if (romNum === 0) return null

    const ftableValue = this.ftable[fileId]
    const folder = ftableValue >> 7
    const file = ftableValue & 0x7F

    const romDir = romNum === 1 ? 'ROM' : `ROM${romNum}`

    return `${romDir}/${folder}/${file}.dat`
  }

  get fileCount(): number {
    return this.vtable.length
  }
}

/**
 * Model-to-DAT-path lookup using pre-extracted equipment model data.
 *
 * The mapping data is stored at /data/model-dat-paths.json and covers
 * all 8 races × 8 equipment slots (~21,000 model→path entries).
 *
 * For armor (slots 2-6): model IDs are sequential indices matching the
 * game's internal model numbering.
 *
 * For weapons (slots 7-9): model IDs from the Stylist item-to-model mapping
 * are matched to ROM paths by item name cross-reference, since weapons are
 * stored non-contiguously in the ROM.
 *
 * Structure: { "raceId:slotId": { "modelId": "ROM/folder/file.dat", ... } }
 */

type ModelDatPaths = Record<string, Record<string, string>>

let cachedPaths: ModelDatPaths | null = null

async function loadModelDatPaths(): Promise<ModelDatPaths> {
  if (cachedPaths) return cachedPaths
  const res = await fetch('/data/model-dat-paths.json')
  cachedPaths = await res.json()
  return cachedPaths!
}

/**
 * Resolve an equipment model to a ROM-relative DAT path.
 *
 * @param modelId  - Visual model ID (from Stylist data or addon sync)
 * @param raceId   - Windower race ID (1-8)
 * @param slotId   - Equipment slot (2=Head, 3=Body, 4=Hands, 5=Legs, 6=Feet,
 *                   7=Main, 8=Sub, 9=Range)
 * @returns ROM-relative path like "ROM/28/53.dat", or null if not mapped
 */
export async function modelToPath(
  modelId: number,
  raceId: number,
  slotId: number
): Promise<string | null> {
  const paths = await loadModelDatPaths()
  const key = `${raceId}:${slotId}`
  return paths[key]?.[String(modelId)] ?? null
}

/**
 * Resolve all equipment model IDs to ROM paths in a single batch.
 *
 * @param slots - Array of { modelId, raceId, slotId }
 * @returns Map of "raceId:slotId" → ROM path
 */
export async function resolveModelPaths(
  slots: Array<{ modelId: number; raceId: number; slotId: number }>
): Promise<Map<string, string>> {
  const paths = await loadModelDatPaths()
  const result = new Map<string, string>()

  for (const { modelId, raceId, slotId } of slots) {
    const key = `${raceId}:${slotId}`
    const romPath = paths[key]?.[String(modelId)]
    if (romPath) {
      result.set(key, romPath)
    }
  }

  return result
}
