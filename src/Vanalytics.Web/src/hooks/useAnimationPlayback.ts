import { useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ParsedAnimation } from '../lib/ffxi-dat/types'

interface UseAnimationPlaybackOptions {
  animations: ParsedAnimation[]
  skeleton: THREE.Skeleton | null
  bindPose: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> | null
  playing: boolean
  speed: number
  onFrameUpdate?: (frame: number, total: number) => void
}

// DEBUG: set to true to disable animation and test bind-pose stability
const SKIP_ANIMATION = false

// Reusable temporaries to avoid GC pressure in the animation loop
const _quatA = new THREE.Quaternion()
const _quatB = new THREE.Quaternion()

export function useAnimationPlayback({
  animations,
  skeleton,
  bindPose,
  playing,
  speed,
  onFrameUpdate,
}: UseAnimationPlaybackOptions) {
  const elapsedRef = useRef(0)
  const loggedRef = useRef(false)

  useFrame((_, delta) => {
    if (!skeleton || !bindPose || animations.length === 0) return
    if (SKIP_ANIMATION) return

    // One-time debug dump of animation data vs bind pose
    if (!loggedRef.current) {
      loggedRef.current = true
      const anim = animations[0]
      console.log('[AnimPlayback] sections:', animations.length,
        'frameCount:', anim.frameCount, 'speed:', anim.speed,
        'bones:', anim.bones.length)
      // Compare first few animated bones to bind pose
      for (let i = 0; i < Math.min(3, anim.bones.length); i++) {
        const ab = anim.bones[i]
        const bp = bindPose[ab.boneIndex]
        console.log(`[AnimPlayback] bone ${ab.boneIndex}:`,
          'motionRotDefault:', ab.rotationDefault,
          'bindRot:', bp ? [bp.quaternion.x, bp.quaternion.y, bp.quaternion.z, bp.quaternion.w] : 'N/A',
          'motionTransDefault:', ab.translationDefault,
          'bindPos:', bp ? [bp.position.x, bp.position.y, bp.position.z] : 'N/A',
          'hasRotKF:', !!ab.rotationKeyframes,
          'hasTransKF:', !!ab.translationKeyframes,
        )
        if (ab.rotationKeyframes) {
          const kf = ab.rotationKeyframes
          console.log(`  frame0 rot: [${kf[0]}, ${kf[1]}, ${kf[2]}, ${kf[3]}]`)
        }
      }
    }

    if (playing) {
      elapsedRef.current += delta * speed
    }

    const bones = skeleton.bones

    // Apply each animation section
    // Try REPLACE mode: animation values are absolute local transforms
    for (const anim of animations) {
      let motionFrame = 0
      let motionN = 0
      let motionJ1 = 0

      if (anim.frameCount > 1) {
        const totalFrames = anim.frameCount - 1
        const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
        motionFrame = Math.floor(frame)
        motionN = frame - motionFrame
        motionJ1 = Math.min(motionFrame + 1, totalFrames)
      }

      for (const ab of anim.bones) {
        if (ab.boneIndex < 0 || ab.boneIndex >= bones.length) continue
        const bone = bones[ab.boneIndex]

        // Interpolate rotation
        if (ab.rotationKeyframes && anim.frameCount > 1) {
          const kf = ab.rotationKeyframes
          _quatA.set(kf[motionFrame * 4], kf[motionFrame * 4 + 1], kf[motionFrame * 4 + 2], kf[motionFrame * 4 + 3])
          _quatB.set(kf[motionJ1 * 4], kf[motionJ1 * 4 + 1], kf[motionJ1 * 4 + 2], kf[motionJ1 * 4 + 3])
          bone.quaternion.slerpQuaternions(_quatA, _quatB, motionN)
        } else {
          bone.quaternion.set(ab.rotationDefault[0], ab.rotationDefault[1], ab.rotationDefault[2], ab.rotationDefault[3])
        }

        // Interpolate translation
        if (ab.translationKeyframes && anim.frameCount > 1) {
          const kf = ab.translationKeyframes
          const j = motionFrame, j1 = motionJ1, n = motionN
          bone.position.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
        } else {
          bone.position.set(ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2])
        }

        // Interpolate scale
        if (ab.scaleKeyframes && anim.frameCount > 1) {
          const kf = ab.scaleKeyframes
          const j = motionFrame, j1 = motionJ1, n = motionN
          bone.scale.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
        } else {
          bone.scale.set(ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2])
        }
      }
    }

    // Report frame for UI
    if (onFrameUpdate) {
      const anim = animations[0]
      const totalFrames = Math.max(1, anim.frameCount - 1)
      const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
      onFrameUpdate(Math.floor(frame), anim.frameCount)
    }
  })

  const seekToFrame = useCallback((frame: number) => {
    if (animations.length === 0) return
    const anim = animations[0]
    elapsedRef.current = frame / (anim.speed * 30)
  }, [animations])

  return { seekToFrame }
}
