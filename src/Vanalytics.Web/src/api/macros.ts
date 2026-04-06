import { api } from './client'

export interface MacroBookSummary {
  bookNumber: number
  contentHash: string
  bookTitle: string
  pendingPush: boolean
  isEmpty: boolean
  updatedAt: string
}

export interface MacroBookDetail {
  bookNumber: number
  contentHash: string
  pendingPush: boolean
  updatedAt: string
  pages: MacroPageDetail[]
}

export interface MacroPageDetail {
  pageNumber: number
  macros: MacroDetail[]
}

export interface MacroDetail {
  set: 'Ctrl' | 'Alt'
  position: number
  name: string
  icon: number
  line1: string
  line2: string
  line3: string
  line4: string
  line5: string
  line6: string
}

export interface MacroBookUpdateRequest {
  pages: {
    pageNumber: number
    macros: {
      set: 'Ctrl' | 'Alt'
      position: number
      name: string
      icon: number
      line1: string
      line2: string
      line3: string
      line4: string
      line5: string
      line6: string
    }[]
  }[]
}

export function listMacroBooks(characterId: string) {
  return api<MacroBookSummary[]>(`/api/macros/${characterId}`)
}

export function getMacroBook(characterId: string, bookNumber: number) {
  return api<MacroBookDetail>(`/api/macros/${characterId}/${bookNumber}`)
}

export function updateMacroBook(characterId: string, bookNumber: number, data: MacroBookUpdateRequest) {
  return api<MacroBookDetail>(`/api/macros/${characterId}/${bookNumber}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export interface MacroBookSnapshotSummary {
  id: string
  contentHash: string
  bookTitle: string
  reason: string
  createdAt: string
}

export function getMacroBookHistory(characterId: string, bookNumber: number) {
  return api<MacroBookSnapshotSummary[]>(`/api/macros/${characterId}/${bookNumber}/history`)
}

export function restoreMacroBook(characterId: string, bookNumber: number, snapshotId: string) {
  return api<MacroBookDetail>(`/api/macros/${characterId}/${bookNumber}/restore/${snapshotId}`, {
    method: 'POST',
  })
}
