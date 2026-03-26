import { useState, useEffect } from 'react'
import type { GearEntry } from '../types/api'
import { resolveModelPaths } from './ffxi-dat'

interface ModelMapping {
  itemId: number
  slotId: number
  modelId: number
}

/** Slot name → Windower model slot index */
const SLOT_NAME_TO_ID: Record<string, number> = {
  Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6,
  Main: 7, Sub: 8, Range: 9,
}

/** Windower model slot index → slot name */
const SLOT_ID_TO_NAME: Record<number, string> = {
  2: 'Head', 3: 'Body', 4: 'Hands', 5: 'Legs', 6: 'Feet',
  7: 'Main', 8: 'Sub', 9: 'Range',
}

/** Visual armor slots that have "None" body models when unequipped */
const VISUAL_ARMOR_SLOTS = [2, 3, 4, 5, 6]

let cachedMappings: ModelMapping[] | null = null

async function loadItemModelMappings(): Promise<ModelMapping[]> {
  if (cachedMappings) return cachedMappings
  const res = await fetch('/data/item-model-mappings.json')
  cachedMappings = await res.json()
  return cachedMappings!
}

interface FaceEntry { name: string; path: string }
let cachedFacePaths: Record<string, FaceEntry[]> | null = null

async function loadFacePaths(): Promise<Record<string, FaceEntry[]>> {
  if (cachedFacePaths) return cachedFacePaths
  const res = await fetch('/data/face-paths.json')
  cachedFacePaths = await res.json()
  return cachedFacePaths!
}

/**
 * Given equipped gear, a race ID (1-8), and an optional face model ID,
 * resolves which DAT files to load for each visual slot including the face
 * and default body parts for unequipped slots.
 *
 * Returns a Map<slotName, romPath> where slotName includes "Face" for slot 1.
 */
export function useSlotDatPaths(
  gear: GearEntry[],
  raceId: number | null,
  faceModelId?: number,
): { slotDatPaths: Map<string, string>; loading: boolean } {
  const [slotDatPaths, setSlotDatPaths] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      if (!raceId) {
        setLoading(false)
        return
      }

      try {
        const [itemMappings, facePaths] = await Promise.all([
          loadItemModelMappings(),
          loadFacePaths(),
        ])
        if (cancelled) return

        // Track which visual armor slots have equipped gear
        const equippedSlotIds = new Set<number>()
        const slotsToResolve: Array<{ modelId: number; raceId: number; slotId: number; slotName: string }> = []

        // Resolve equipped gear
        for (const gearEntry of gear) {
          const slotId = SLOT_NAME_TO_ID[gearEntry.slot]
          if (!slotId || gearEntry.itemId <= 0) continue

          const mapping = itemMappings.find(
            m => m.itemId === gearEntry.itemId && m.slotId === slotId
          )
          if (!mapping) continue

          equippedSlotIds.add(slotId)
          slotsToResolve.push({
            modelId: mapping.modelId,
            raceId,
            slotId,
            slotName: gearEntry.slot,
          })
        }

        // For unequipped visual armor slots, use model 0 (default body part)
        for (const slotId of VISUAL_ARMOR_SLOTS) {
          if (!equippedSlotIds.has(slotId)) {
            const slotName = SLOT_ID_TO_NAME[slotId]
            if (slotName) {
              slotsToResolve.push({ modelId: 0, raceId, slotId, slotName })
            }
          }
        }

        // Batch resolve model IDs → ROM paths
        const pathMap = await resolveModelPaths(slotsToResolve)
        if (cancelled) return

        // Convert "raceId:slotId" keys back to slot names
        const result = new Map<string, string>()
        for (const [key, romPath] of pathMap) {
          const slotId = parseInt(key.split(':')[1])
          const slotName = SLOT_ID_TO_NAME[slotId]
          if (slotName) {
            result.set(slotName, romPath)
          }
        }

        // Resolve face DAT path
        if (faceModelId != null && faceModelId >= 0) {
          const raceFaces = facePaths[String(raceId)]
          if (raceFaces && faceModelId < raceFaces.length) {
            result.set('Face', raceFaces[faceModelId].path)
          }
        }

        setSlotDatPaths(result)
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [gear, raceId, faceModelId])

  return { slotDatPaths, loading }
}

/** Convert race string + gender string to Windower race ID (1-8) */
export function toRaceId(race?: string, gender?: string): number | null {
  if (!race) return null
  const key = `${race}:${gender}`
  const map: Record<string, number> = {
    'Hume:Male': 1, 'Hume:Female': 2,
    'Elvaan:Male': 3, 'Elvaan:Female': 4,
    'Tarutaru:Male': 5, 'Tarutaru:Female': 6,
    'Mithra:Female': 7,
    'Galka:Male': 8,
  }
  return map[key] ?? null
}
