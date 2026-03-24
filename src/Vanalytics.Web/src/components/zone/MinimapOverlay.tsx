import { useState, useMemo } from 'react'
import { Map } from 'lucide-react'
import type { ParsedTexture } from '../../lib/ffxi-dat/types'

interface MinimapOverlayProps {
  textures: ParsedTexture[]
  labels?: string[]
}

export default function MinimapOverlay({ textures, labels }: MinimapOverlayProps) {
  const [selectedFloor, setSelectedFloor] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  const imageUrl = useMemo(() => {
    const tex = textures[selectedFloor]
    if (!tex) return null
    const canvas = document.createElement('canvas')
    canvas.width = tex.width
    canvas.height = tex.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const imageData = ctx.createImageData(tex.width, tex.height)
    imageData.data.set(new Uint8Array(tex.rgba))
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL()
  }, [textures, selectedFloor])

  if (textures.length === 0 || !imageUrl) return null

  return (
    <div className="absolute top-16 right-4 z-30 flex flex-col items-end gap-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 px-2 py-1 bg-gray-900/80 text-white text-xs rounded hover:bg-gray-800/90"
      >
        <Map className="w-3 h-3" />
        Map
      </button>
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
          <img src={imageUrl} alt="Zone minimap" className="w-48 h-48 object-contain" />
        </div>
      )}
    </div>
  )
}
