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

let cachedMappings: ModelMapping[] | null = null

async function loadItemModelMappings(): Promise<ModelMapping[]> {
  if (cachedMappings) return cachedMappings
  const res = await fetch('/data/item-model-mappings.json')
  cachedMappings = await res.json()
  return cachedMappings!
}

/**
 * Given equipped gear and a race ID (1-8), resolves which DAT files to load
 * for each visual equipment slot.
 *
 * Pipeline:
 * 1. item-model-mappings.json: itemId + slotId → modelId (from Stylist XML, 12,366 entries)
 * 2. model-dat-paths.json: raceId + slotId + modelId → ROM path (from AltanaView CSVs, 20,476 entries)
 *
 * Returns a Map<slotName, romPath> for slots where both lookups succeed.
 */
export function useSlotDatPaths(
  gear: GearEntry[],
  raceId: number | null,
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
        // Step 1: Load item → model ID mappings
        const itemMappings = await loadItemModelMappings()
        if (cancelled) return

        // Step 2: For each gear slot, find the model ID
        const slotsToResolve: Array<{ modelId: number; raceId: number; slotId: number; slotName: string }> = []

        for (const gearEntry of gear) {
          const slotId = SLOT_NAME_TO_ID[gearEntry.slot]
          if (!slotId || gearEntry.itemId <= 0) continue

          const mapping = itemMappings.find(
            m => m.itemId === gearEntry.itemId && m.slotId === slotId
          )
          if (!mapping) continue

          slotsToResolve.push({
            modelId: mapping.modelId,
            raceId,
            slotId,
            slotName: gearEntry.slot,
          })
        }

        // Step 3: Batch resolve model IDs → ROM paths
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

        setSlotDatPaths(result)
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [gear, raceId])

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
