import { useState, useMemo, useRef, useCallback } from 'react'
import { Map, X } from 'lucide-react'
import type { ParsedTexture } from '../../lib/ffxi-dat/types'

interface MinimapOverlayProps {
  textures: ParsedTexture[]
  labels?: string[]
}

function textureToDataUrl(tex: ParsedTexture): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = tex.width
  canvas.height = tex.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imageData = ctx.createImageData(tex.width, tex.height)
  imageData.data.set(new Uint8Array(tex.rgba))
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL()
}

export default function MinimapOverlay({ textures, labels }: MinimapOverlayProps) {
  const [selectedFloor, setSelectedFloor] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const imageUrl = useMemo(() => {
    const tex = textures[selectedFloor]
    if (!tex) return null
    return textureToDataUrl(tex)
  }, [textures, selectedFloor])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    setZoom(z => Math.max(0.5, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 0.87))))
  }, [])

  const didDrag = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    didDrag.current = false
    lastPos.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseUp = useCallback(() => {
    const wasDrag = didDrag.current
    dragging.current = false
    didDrag.current = false
    if (!wasDrag) {
      setExpanded(false)
      resetView()
    }
  }, [resetView])

  if (textures.length === 0 || !imageUrl) return null

  const floorSelector = textures.length > 1 && (
    <select
      value={selectedFloor}
      onChange={(e) => { setSelectedFloor(Number(e.target.value)); resetView() }}
      className="bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 outline-none border border-gray-700"
    >
      {textures.map((_, i) => (
        <option key={i} value={i} className="bg-gray-900">
          {labels?.[i] ?? `Floor ${i + 1}`}
        </option>
      ))}
    </select>
  )

  // Fullscreen expanded view
  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/90 border-b border-gray-700">
          <Map className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-200 font-medium">Zone Map</span>
          {floorSelector}
          <span className="text-xs text-gray-500 ml-2">{Math.round(zoom * 100)}% — Scroll to zoom, drag to pan</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={resetView} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800">
              Reset
            </button>
            <button onClick={() => { setExpanded(false); resetView() }} className="p-1 text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Map viewport */}
        <div
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Zone map"
              draggable={false}
              className="max-w-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                imageRendering: zoom > 2 ? 'pixelated' : 'auto',
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // Minimap thumbnail
  return (
    <div className="absolute top-16 right-4 z-30 flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 text-white text-xs rounded hover:bg-gray-800/90"
        >
          <Map className="w-3 h-3" />
          Map
        </button>
      </div>
      {!collapsed && (
        <div className="bg-gray-900/80 rounded-lg overflow-hidden shadow-xl">
          {textures.length > 1 && (
            <div className="px-2 py-1 border-b border-gray-700">
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(Number(e.target.value))}
                className="bg-transparent text-white text-xs w-full outline-none"
              >
                {textures.map((_, i) => (
                  <option key={i} value={i} className="bg-gray-900">
                    {labels?.[i] ?? `Floor ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="relative cursor-pointer" onClick={() => setExpanded(true)}>
            <img src={imageUrl} alt="Zone minimap" className="w-48 h-48 object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
