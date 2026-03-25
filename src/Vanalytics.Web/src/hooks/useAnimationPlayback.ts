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

// Reusable temporaries to avoid GC pressure in the animation loop
const _quatA = new THREE.Quaternion()
const _quatB = new THREE.Quaternion()
const _motionQuat = new THREE.Quaternion()
const _motionPos = new THREE.Vector3()
const _motionScale = new THREE.Vector3(1, 1, 1)
const _bindLocal = new THREE.Matrix4()
const _motionMat = new THREE.Matrix4()

export function useAnimationPlayback({
  animations,
  skeleton,
  bindPose,
  playing,
  speed,
  onFrameUpdate,
}: UseAnimationPlaybackOptions) {
  const elapsedRef = useRef(0)

  useFrame((_, delta) => {
    if (!skeleton || !bindPose || animations.length === 0) return

    if (playing) {
      elapsedRef.current += delta * speed
    }

    const bones = skeleton.bones

    // Reset all bones to bind pose first
    for (let i = 0; i < bones.length && i < bindPose.length; i++) {
      bones[i].position.copy(bindPose[i].position)
      bones[i].quaternion.copy(bindPose[i].quaternion)
      bones[i].scale.set(1, 1, 1)
      bones[i].updateMatrix()
    }

    // Apply each animation section (upper body, lower body, etc.)
    // Reference: FFXI does mat[boneNo] = mat[boneNo] * motionMatrix (row-major)
    // In Three.js column-major, that's bone.matrix = motionMatrix * bone.matrix
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

        // Interpolate motion rotation
        if (ab.rotationKeyframes && anim.frameCount > 1) {
          const kf = ab.rotationKeyframes
          _quatA.set(kf[motionFrame * 4], kf[motionFrame * 4 + 1], kf[motionFrame * 4 + 2], kf[motionFrame * 4 + 3])
          _quatB.set(kf[motionJ1 * 4], kf[motionJ1 * 4 + 1], kf[motionJ1 * 4 + 2], kf[motionJ1 * 4 + 3])
          _motionQuat.slerpQuaternions(_quatA, _quatB, motionN)
        } else {
          _motionQuat.set(ab.rotationDefault[0], ab.rotationDefault[1], ab.rotationDefault[2], ab.rotationDefault[3])
        }

        // Interpolate motion translation
        if (ab.translationKeyframes && anim.frameCount > 1) {
          const kf = ab.translationKeyframes
          const j = motionFrame, j1 = motionJ1, n = motionN
          _motionPos.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
        } else {
          _motionPos.set(ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2])
        }

        // Interpolate motion scale
        if (ab.scaleKeyframes && anim.frameCount > 1) {
          const kf = ab.scaleKeyframes
          const j = motionFrame, j1 = motionJ1, n = motionN
          _motionScale.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
        } else {
          _motionScale.set(ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2])
        }

        // Build motion matrix and multiply with bind-pose local matrix.
        // FFXI reference: mat[bone] *= motionMatrix (row-major post-multiply)
        // Three.js equivalent: bone.matrix = motionMatrix * bone.matrix
        _bindLocal.copy(bone.matrix)
        _motionMat.compose(_motionPos, _motionQuat, _motionScale)
        bone.matrix.multiplyMatrices(_motionMat, _bindLocal)

        // Decompose back to position/quaternion/scale so Three.js hierarchy works
        bone.matrix.decompose(bone.position, bone.quaternion, bone.scale)
      }
    }

    // Propagate bone hierarchy and compute final world matrices
    skeleton.bones.forEach(bone => {
      bone.updateMatrix()
    })
    const rootBones = skeleton.bones.filter(b => !(b.parent as THREE.Bone | null)?.isBone)
    rootBones.forEach(b => b.updateWorldMatrix(false, true))

    // Report frame for UI
    if (animations.length > 0 && onFrameUpdate) {
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
