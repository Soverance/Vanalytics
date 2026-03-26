import { useState, useEffect } from 'react'

interface AnimationEntry {
  name: string
  category: string
  paths: string[]
}

interface AnimationGroup {
  category: string
  animations: AnimationEntry[]
}

let cachedData: Record<string, AnimationEntry[]> | null = null

export function useAnimationDatPaths(raceId: number | null): {
  groups: AnimationGroup[]
  loading: boolean
} {
  const [groups, setGroups] = useState<AnimationGroup[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!raceId) {
      setGroups([])
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)

      if (!cachedData) {
        try {
          const res = await fetch('/data/animation-paths.json')
          cachedData = await res.json()
        } catch {
          setLoading(false)
          return
        }
      }

      if (cancelled) return

      // Race 6 (Taru Female) shares race 5's animations
      const lookupId = raceId === 6 ? 5 : raceId
      const raceAnims: AnimationEntry[] = cachedData![String(lookupId)] ?? []

      // Group by category, preserving order of first appearance
      const categoryOrder: string[] = []
      const categoryMap = new Map<string, AnimationEntry[]>()

      for (const entry of raceAnims) {
        if (!categoryMap.has(entry.category)) {
          categoryOrder.push(entry.category)
          categoryMap.set(entry.category, [])
        }
        categoryMap.get(entry.category)!.push(entry)
      }

      const result = categoryOrder.map(cat => ({
        category: cat,
        animations: categoryMap.get(cat)!,
      }))

      if (!cancelled) {
        setGroups(result)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [raceId])

  return { groups, loading }
}
