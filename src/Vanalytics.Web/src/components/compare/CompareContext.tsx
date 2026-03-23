import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { GameItemSummary, GameItemDetail } from '../../types/api'

const STORAGE_KEY = 'vanalytics_compare_items'
const MAX_ITEMS = 4

interface CompareContextValue {
  items: GameItemSummary[]
  addItem: (item: GameItemSummary) => void
  removeItem: (itemId: number) => void
  clearItems: () => void
  isSelected: (itemId: number) => boolean
  isFull: boolean
  details: Map<number, GameItemDetail>
  fetchDetails: () => Promise<void>
}

const CompareContext = createContext<CompareContextValue | null>(null)

export function useCompare() {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used within CompareProvider')
  return ctx
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<GameItemSummary[]>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [details, setDetails] = useState<Map<number, GameItemDetail>>(new Map())

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = (item: GameItemSummary) => {
    setItems(prev => {
      if (prev.length >= MAX_ITEMS) return prev
      if (prev.some(i => i.itemId === item.itemId)) return prev
      return [...prev, item]
    })
  }

  const removeItem = (itemId: number) => {
    setItems(prev => prev.filter(i => i.itemId !== itemId))
    setDetails(prev => {
      const next = new Map(prev)
      next.delete(itemId)
      return next
    })
  }

  const clearItems = () => {
    setItems([])
    setDetails(new Map())
  }

  const isSelected = (itemId: number) => items.some(i => i.itemId === itemId)

  const fetchDetails = async () => {
    const missing = items.filter(i => !details.has(i.itemId))
    if (missing.length === 0) return

    const results = await Promise.all(
      missing.map(i =>
        fetch(`/api/items/${i.itemId}`)
          .then(r => r.ok ? r.json() as Promise<GameItemDetail> : null)
          .catch(() => null)
      )
    )

    setDetails(prev => {
      const next = new Map(prev)
      results.forEach((detail, idx) => {
        if (detail) next.set(missing[idx].itemId, detail)
      })
      return next
    })
  }

  return (
    <CompareContext.Provider value={{
      items, addItem, removeItem, clearItems, isSelected,
      isFull: items.length >= MAX_ITEMS,
      details, fetchDetails,
    }}>
      {children}
    </CompareContext.Provider>
  )
}
