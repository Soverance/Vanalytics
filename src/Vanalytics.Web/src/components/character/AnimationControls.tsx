import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'

interface AnimationEntry {
  name: string
  category: string
  paths: string[]
}

interface AnimationGroup {
  category: string
  animations: AnimationEntry[]
}

interface AnimationControlsProps {
  groups: AnimationGroup[]
  loading: boolean
  currentFrame: number
  totalFrames: number
  playing: boolean
  speed: number
  onAnimationSelect: (paths: string[]) => void
  onPlayPause: () => void
  onSpeedChange: (speed: number) => void
  onSeek: (frame: number) => void
  onStepBack: () => void
  onStepForward: () => void
  motionCount: number
  motionIndex: number
  onMotionIndexChange: (index: number, skipReset?: boolean) => void
  favoriteAnimation?: { category: string; animationName: string; motionIndex: number }
  onSaveFavorite?: (fav: { category: string; animationName: string; motionIndex: number } | null) => void
}

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 1.5, 2.0]

export default function AnimationControls({
  groups, loading, currentFrame, totalFrames,
  playing, speed,
  onAnimationSelect, onPlayPause, onSpeedChange, onSeek,
  onStepBack, onStepForward,
  motionCount, motionIndex, onMotionIndexChange,
  favoriteAnimation, onSaveFavorite,
}: AnimationControlsProps) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedAnimIndex, setSelectedAnimIndex] = useState(0)
  const initializedRef = useRef(false)

  // Stable reference to callbacks to avoid re-triggering effects
  const callbacksRef = useRef({ onAnimationSelect, onMotionIndexChange })
  callbacksRef.current = { onAnimationSelect, onMotionIndexChange }

  // Select a category + animation + motion and fire callbacks.
  // This is used for both initialization and user-initiated category changes.
  const selectAnimation = useCallback((category: string, animIdx: number, motion?: number) => {
    const group = groups.find(g => g.category === category)
    if (!group || group.animations.length === 0) return
    const idx = Math.min(animIdx, group.animations.length - 1)
    setSelectedCategory(category)
    setSelectedAnimIndex(idx)
    callbacksRef.current.onAnimationSelect(group.animations[idx].paths)
    if (motion !== undefined) {
      callbacksRef.current.onMotionIndexChange(motion, true)
    }
  }, [groups])

  // ONE initialization effect: runs when groups become available (or change).
  // Picks favorite if available, otherwise defaults to Emote bow.
  // Only runs ONCE per component mount (guarded by initializedRef).
  useEffect(() => {
    if (groups.length === 0 || initializedRef.current) return
    initializedRef.current = true

    // Try favorite first
    if (favoriteAnimation) {
      const favGroup = groups.find(g => g.category === favoriteAnimation.category)
      if (favGroup) {
        const favAnimIdx = favGroup.animations.findIndex(a => a.name === favoriteAnimation.animationName)
        selectAnimation(favoriteAnimation.category, favAnimIdx >= 0 ? favAnimIdx : 0, favoriteAnimation.motionIndex)
        return
      }
    }

    // Default: Emote category, "Emote" animation, motion 0
    const emote = groups.find(g => g.category === 'Emote')
    const category = emote ? emote.category : groups[0].category
    let animIdx = 0
    if (category === 'Emote') {
      const group = groups.find(g => g.category === category)
      const emoteIdx = group?.animations.findIndex(a => a.name === 'Emote') ?? -1
      if (emoteIdx >= 0) animIdx = emoteIdx
    }
    selectAnimation(category, animIdx)
  }, [groups, favoriteAnimation, selectAnimation])

  // If favorite arrives AFTER initialization (async character load),
  // re-initialize with the favorite.
  const prevFavoriteRef = useRef(favoriteAnimation)
  useEffect(() => {
    if (prevFavoriteRef.current === favoriteAnimation) return
    prevFavoriteRef.current = favoriteAnimation
    if (!favoriteAnimation || !initializedRef.current) return

    const favGroup = groups.find(g => g.category === favoriteAnimation.category)
    if (favGroup) {
      const favAnimIdx = favGroup.animations.findIndex(a => a.name === favoriteAnimation.animationName)
      selectAnimation(favoriteAnimation.category, favAnimIdx >= 0 ? favAnimIdx : 0, favoriteAnimation.motionIndex)
    }
  }, [favoriteAnimation, groups, selectAnimation])

  const currentGroup = groups.find(g => g.category === selectedCategory)
  const animations = currentGroup?.animations ?? []

  // User changes category dropdown
  const handleCategoryChange = (category: string) => {
    const group = groups.find(g => g.category === category)
    if (group && group.animations.length > 0) {
      setSelectedCategory(category)
      setSelectedAnimIndex(0)
      onAnimationSelect(group.animations[0].paths)
    }
  }

  // User changes animation dropdown
  const handleAnimChange = (idx: number) => {
    setSelectedAnimIndex(idx)
    if (animations[idx]) {
      onAnimationSelect(animations[idx].paths)
    }
  }

  const currentAnimName = animations[selectedAnimIndex]?.name ?? ''
  const isFavorite = favoriteAnimation != null
    && favoriteAnimation.category === selectedCategory
    && favoriteAnimation.animationName === currentAnimName
    && favoriteAnimation.motionIndex === motionIndex

  const handleToggleFavorite = () => {
    if (isFavorite) {
      onSaveFavorite?.(null)
    } else {
      onSaveFavorite?.({ category: selectedCategory, animationName: currentAnimName, motionIndex })
    }
  }

  if (loading) return <div className="text-xs text-gray-500 p-2">Loading animations...</div>
  if (groups.length === 0) return null

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-b-md px-3 py-2 space-y-2">
      {/* Category + Animation + Motion pickers */}
      <div className="flex gap-2">
        <select
          value={selectedCategory}
          onChange={e => handleCategoryChange(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 flex-1"
        >
          {groups.map(g => (
            <option key={g.category} value={g.category}>{g.category}</option>
          ))}
        </select>
        <select
          value={selectedAnimIndex}
          onChange={e => handleAnimChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 flex-1"
        >
          {animations.map((a, i) => (
            <option key={i} value={i}>{a.name}</option>
          ))}
        </select>
        {motionCount > 0 && (
          <select
            value={motionIndex}
            onChange={e => onMotionIndexChange(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 w-28"
            title="Each animation DAT contains multiple motions (e.g., idle, walk, run)"
          >
            {Array.from({ length: motionCount }, (_, i) => (
              <option key={i} value={i}>Motion {i + 1}</option>
            ))}
          </select>
        )}
        {onSaveFavorite && (
          <button
            onClick={handleToggleFavorite}
            className={`px-2 py-1 text-sm rounded transition-colors ${
              isFavorite
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={isFavorite ? 'Remove favorite animation' : 'Set as favorite animation'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2">
        <button onClick={onStepBack} className="p-1 text-gray-400 hover:text-gray-200" title="Step back">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={onPlayPause} className="p-1 text-gray-400 hover:text-gray-200" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button onClick={onStepForward} className="p-1 text-gray-400 hover:text-gray-200" title="Step forward">
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={Math.max(1, totalFrames - 1)}
          value={currentFrame}
          onChange={e => onSeek(Number(e.target.value))}
          className="flex-1 h-1 accent-blue-500"
        />

        {/* Frame counter */}
        <span className="text-xs text-gray-400 w-16 text-right tabular-nums">
          {currentFrame}/{totalFrames}
        </span>

        {/* Speed */}
        <select
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-300"
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>
    </div>
  )
}
