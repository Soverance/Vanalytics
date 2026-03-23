import { useEffect, useRef, useCallback } from 'react'
import CharacterScene from './CharacterScene'
import CharacterModel from './CharacterModel'

interface FullscreenViewerProps {
  race?: string
  gender?: string
  characterName: string
  server: string
  slots: Array<{ slotId: number; datPath: string }>
  onExit: () => void
}

export default function FullscreenViewer({ race, gender, characterName, server, slots, onExit }: FullscreenViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const enterFullscreen = useCallback(async () => {
    try { await containerRef.current?.requestFullscreen() } catch { /* fallback */ }
  }, [])

  useEffect(() => {
    enterFullscreen()
    const handleChange = () => { if (!document.fullscreenElement) onExit() }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [enterFullscreen, onExit])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onExit])

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black">
      <CharacterScene className="w-full h-full">
        <CharacterModel race={race} gender={gender} slots={slots} />
      </CharacterScene>
      <div className="absolute top-4 left-4 px-3 py-1.5 bg-indigo-950/80 border border-amber-800/30 rounded text-xs text-gray-400">ESC to exit</div>
      <div className="absolute bottom-4 left-4 text-sm text-amber-200/60">{characterName} — {server}</div>
      <div className="absolute bottom-4 right-4 text-[10px] text-gray-600">Drag to rotate · Scroll to zoom</div>
    </div>
  )
}
