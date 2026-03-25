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
  const loggedRef = useRef(false)

  useFrame((_, delta) => {
    if (!skeleton || !bindPose || animations.length === 0) return

    if (playing) {
      elapsedRef.current += delta * speed
    }

    const bones = skeleton.bones

    // DEBUG: one-time log
    if (!loggedRef.current) {
      loggedRef.current = true
      console.log(`[AnimPlayback] skeleton bones: ${bones.length}, sections: ${animations.length}`)
      const anim = animations[0]
      console.log(`[AnimPlayback] clip: ${anim.bones.length} bones, ${anim.frameCount} frames, speed ${anim.speed}`)
    }

    // Reset all bones to bind pose
    for (let i = 0; i < bones.length && i < bindPose.length; i++) {
      bones[i].position.copy(bindPose[i].position)
      bones[i].quaternion.copy(bindPose[i].quaternion)
      bones[i].scale.set(1, 1, 1)
      bones[i].updateMatrix()
    }

    // Apply animation using matrix multiplication.
    // FFXI reference: mat[bone] = mat[bone] * motionMatrix (row-major)
    // The flat array layout is identical between FFXI and Three.js, so:
    // Three.js: bone.matrix = multiplyMatrices(bindLocal, motionMat)
    // (SAME order as FFXI, NOT reversed)
    for (const anim of animations) {
      let j = 0
      let n = 0
      let j1 = 0

      if (anim.frameCount > 1) {
        const totalFrames = anim.frameCount - 1
        const frame = (elapsedRef.current * anim.speed * 30) % totalFrames
        j = Math.floor(frame)
        n = frame - j
        j1 = Math.min(j + 1, totalFrames)
      }

      for (const ab of anim.bones) {
        if (ab.boneIndex < 0 || ab.boneIndex >= bones.length) continue
        const bone = bones[ab.boneIndex]

        // Interpolate motion rotation (SLERP)
        if (ab.rotationKeyframes && anim.frameCount > 1) {
          const kf = ab.rotationKeyframes
          _quatA.set(kf[j * 4], kf[j * 4 + 1], kf[j * 4 + 2], kf[j * 4 + 3])
          _quatB.set(kf[j1 * 4], kf[j1 * 4 + 1], kf[j1 * 4 + 2], kf[j1 * 4 + 3])
          _motionQuat.slerpQuaternions(_quatA, _quatB, n)
        } else {
          _motionQuat.set(ab.rotationDefault[0], ab.rotationDefault[1], ab.rotationDefault[2], ab.rotationDefault[3])
        }

        // Interpolate motion translation (LERP)
        if (ab.translationKeyframes && anim.frameCount > 1) {
          const kf = ab.translationKeyframes
          _motionPos.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
        } else {
          _motionPos.set(ab.translationDefault[0], ab.translationDefault[1], ab.translationDefault[2])
        }

        // Interpolate motion scale (LERP)
        if (ab.scaleKeyframes && anim.frameCount > 1) {
          const kf = ab.scaleKeyframes
          _motionScale.set(
            kf[j * 3] + (kf[j1 * 3] - kf[j * 3]) * n,
            kf[j * 3 + 1] + (kf[j1 * 3 + 1] - kf[j * 3 + 1]) * n,
            kf[j * 3 + 2] + (kf[j1 * 3 + 2] - kf[j * 3 + 2]) * n,
          )
        } else {
          _motionScale.set(ab.scaleDefault[0], ab.scaleDefault[1], ab.scaleDefault[2])
        }

        // Matrix multiply: result = bind * motion (FFXI row-major convention)
        // The flat arrays are identical between FFXI and Three.js, so
        // Three.js multiplyMatrices(bind, motion) gives the same result.
        _bindLocal.copy(bone.matrix)
        _motionMat.compose(_motionPos, _motionQuat, _motionScale)
        bone.matrix.multiplyMatrices(_bindLocal, _motionMat)

        // Decompose for Three.js hierarchy propagation
        bone.matrix.decompose(bone.position, bone.quaternion, bone.scale)
      }
    }

    // Report frame for UI
    if (onFrameUpdate && animations.length > 0) {
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
