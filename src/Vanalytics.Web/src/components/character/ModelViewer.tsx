import { useState, useRef, useEffect } from 'react'
import { Loader2, MonitorSmartphone, FolderOpen, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import CharacterScene from './CharacterScene'
import CharacterModel from './CharacterModel'
import AnimationControls from './AnimationControls'
import { useAnimationDatPaths } from '../../hooks/useAnimationDatPaths'
import { toRaceId } from '../../lib/model-mappings'
import { SKELETON_PATHS } from '../../lib/ffxi-dat'
import type { GearEntry } from '../../types/api'

interface ModelViewerProps {
  race?: string
  gender?: string
  gear: GearEntry[]
  slotDatPaths: Map<string, string>
  onRequestFullscreen?: () => void
  favoriteAnimation?: { category: string; animationName: string; motionIndex: number }
  onSaveFavorite?: (fav: { category: string; animationName: string; motionIndex: number } | null) => void
}

export default function ModelViewer({ race, gender, gear: _gear, slotDatPaths, onRequestFullscreen, favoriteAnimation, onSaveFavorite }: ModelViewerProps) {
  const { isSupported, isConfigured, isAuthorized, loading, authorize } = useFfxiFileSystem()
  const [loadingSlots, setLoadingSlots] = useState(new Set<number>())

  // Animation state — hooks must be called before any early returns
  const raceId = toRaceId(race, gender)
  const { groups: datGroups, loading: animLoading } = useAnimationDatPaths(raceId ?? null)

  // Prepend a "Basic" group from the skeleton DAT (contains idle/stance animations)
  const skelPath = raceId ? SKELETON_PATHS[raceId] : undefined
  const groups = skelPath
    ? [{ category: 'Basic', animations: [{ name: 'Idle / Stance', category: 'Basic', paths: [skelPath] }] }, ...datGroups]
    : datGroups
  const [animPaths, setAnimPaths] = useState<string[]>([])
  const [animPlaying, setAnimPlaying] = useState(true)
  const [animSpeed, setAnimSpeed] = useState(1.0)
  const [animFrame, setAnimFrame] = useState(0)
  const [animTotal, setAnimTotal] = useState(0)
  const [motionCount, setMotionCount] = useState(0)
  const [motionIndex, setMotionIndex] = useState(0)
  const seekFnRef = useRef<((frame: number) => void) | null>(null)
  const skipMotionResetRef = useRef(false)

  // Reset motion index when animation changes (unless a favorite was just applied)
  useEffect(() => {
    if (animPaths.length === 0) return
    if (skipMotionResetRef.current) { skipMotionResetRef.current = false; return }
    setMotionIndex(0)
  }, [animPaths])

  // Wrap setMotionIndex so AnimationControls can signal "don't reset this"
  const setMotionIndexWithSkip = (idx: number, skipReset?: boolean) => {
    if (skipReset) skipMotionResetRef.current = true
    setMotionIndex(idx)
  }

  if (loading) return <ViewerShell><Loader2 className="h-6 w-6 animate-spin text-gray-600" /></ViewerShell>
  if (!isSupported) return <ViewerShell><MonitorSmartphone className="h-8 w-8 text-gray-600 mb-2" /><p className="text-sm text-gray-400">3D model viewer requires Chrome or Edge</p></ViewerShell>
  if (!isConfigured) return (
    <ViewerShell>
      <FolderOpen className="h-8 w-8 text-gray-600 mb-2" />
      <p className="text-sm text-gray-400 mb-2">Configure your FFXI installation to view 3D models</p>
      <Link to="/profile" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Settings className="h-3 w-3" />Open Settings</Link>
    </ViewerShell>
  )
  if (!isAuthorized) return (
    <ViewerShell>
      <FolderOpen className="h-8 w-8 text-amber-600/60 mb-2" />
      <button onClick={authorize} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Connect to FFXI Installation</button>
      <p className="text-[10px] text-gray-500 mt-2">One click — re-authorizes your previously configured folder</p>
    </ViewerShell>
  )

  const slotMap: Record<string, number> = { Face: 1, Head: 2, Body: 3, Hands: 4, Legs: 5, Feet: 6, Main: 7, Sub: 8, Range: 9 }
  const slots = Array.from(slotDatPaths.entries()).map(([slotName, datPath]) => ({
    slotId: slotMap[slotName] ?? 0, datPath
  })).filter(s => s.slotId > 0)

  // suppress unused warning — loadingSlots is updated by onSlotLoaded but not otherwise read in this component
  void loadingSlots

  return (
    <div className="flex-1">
      <div className="relative h-[440px] bg-gradient-to-b from-indigo-950/95 to-gray-950/98 border border-amber-800/20 rounded-t-md overflow-hidden">
        <CharacterScene className="w-full h-full">
          <CharacterModel race={race} gender={gender} slots={slots}
            animationPaths={animPaths}
            animationPlaying={animPlaying}
            animationSpeed={animSpeed}
            motionIndex={motionIndex}
            onAnimationFrame={(f, t) => { setAnimFrame(f); setAnimTotal(t) }}
            onMotionCount={setMotionCount}
            onSeekRef={(fn) => { seekFnRef.current = fn }}
            onSlotLoaded={(id) => setLoadingSlots(prev => { const next = new Set(prev); next.delete(id); return next })} />
        </CharacterScene>
        {onRequestFullscreen && (
          <button onClick={onRequestFullscreen} className="absolute top-3 right-3 w-8 h-8 bg-indigo-950/80 border border-amber-800/30 rounded flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors" title="Fullscreen">⛶</button>
        )}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-gray-600">Drag to rotate · Scroll to zoom</div>
      </div>
      <AnimationControls
        groups={groups}
        loading={animLoading}
        currentFrame={animFrame}
        totalFrames={animTotal}
        playing={animPlaying}
        speed={animSpeed}
        onAnimationSelect={setAnimPaths}
        onPlayPause={() => setAnimPlaying(p => !p)}
        onSpeedChange={setAnimSpeed}
        onSeek={(f) => seekFnRef.current?.(f)}
        onStepBack={() => seekFnRef.current?.(Math.max(0, animFrame - 1))}
        onStepForward={() => seekFnRef.current?.(Math.min(animTotal - 1, animFrame + 1))}
        motionCount={motionCount}
        motionIndex={motionIndex}
        onMotionIndexChange={setMotionIndexWithSkip}
        favoriteAnimation={favoriteAnimation}
        onSaveFavorite={onSaveFavorite}
      />
    </div>
  )
}

function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-[440px] bg-gradient-to-b from-indigo-950/80 to-gray-950/90 border border-gray-700/30 rounded-md flex flex-col items-center justify-center">
      {children}
    </div>
  )
}
