import { useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { ParsedAnimation, ParsedSkeleton } from '../lib/ffxi-dat/types'

// --- Row-major 4×4 matrix utilities (same format as SkeletonParser) ---

function quatToMatrix(qi: number, qj: number, qk: number, qw: number,
                      tx: number, ty: number, tz: number): number[] {
  const xx = qi*qi, yy = qj*qj, zz = qk*qk
  const xy = qi*qj, xz = qi*qk, yz = qj*qk
  const wx = qw*qi, wy = qw*qj, wz = qw*qk
  return [
    1-2*(yy+zz), 2*(xy+wz), 2*(xz-wy), 0,
    2*(xy-wz), 1-2*(xx+zz), 2*(yz+wx), 0,
    2*(xz+wy), 2*(yz-wx), 1-2*(xx+yy), 0,
    tx, ty, tz, 1,
  ]
}

function mat4Multiply(a: number[], b: number[]): number[] {
  const r = new Array(16).fill(0)
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++)
      for (let k = 0; k < 4; k++)
        r[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col]
  return r
}

/** Invert a rigid-body 4×4 matrix (rotation + translation, no scale/skew). */
function invertRigidMatrix4(m: number[]): number[] {
  // R^T (transpose the 3×3 rotation block)
  const ir00 = m[0], ir01 = m[4], ir02 = m[8]
  const ir10 = m[1], ir11 = m[5], ir12 = m[9]
  const ir20 = m[2], ir21 = m[6], ir22 = m[10]
  // -t * R^T
  const tx = m[12], ty = m[13], tz = m[14]
  return [
    ir00, ir01, ir02, 0,
    ir10, ir11, ir12, 0,
    ir20, ir21, ir22, 0,
    -(tx*ir00 + ty*ir10 + tz*ir20),
    -(tx*ir01 + ty*ir11 + tz*ir21),
    -(tx*ir02 + ty*ir12 + tz*ir22),
    1,
  ]
}

export function quatMultiply(ax: number, ay: number, az: number, aw: number,
                             bx: number, by: number, bz: number, bw: number): [number, number, number, number] {
  return [
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw,
    aw*bw - ax*bx - ay*by - az*bz,
  ]
}

function quatSlerp(ax: number, ay: number, az: number, aw: number,
                   bx: number, by: number, bz: number, bw: number,
                   t: number): [number, number, number, number] {
  let dot = ax*bx + ay*by + az*bz + aw*bw
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot }
  if (dot > 0.9995) {
    // Linear fallback for near-identical quaternions
    const x = ax + (bx-ax)*t, y = ay + (by-ay)*t, z = az + (bz-az)*t, w = aw + (bw-aw)*t
    const len = Math.sqrt(x*x + y*y + z*z + w*w)
    return [x/len, y/len, z/len, w/len]
  }
  const theta = Math.acos(dot)
  const sinT = Math.sin(theta)
  const wa = Math.sin((1-t)*theta) / sinT
  const wb = Math.sin(t*theta) / sinT
  return [wa*ax + wb*bx, wa*ay + wb*by, wa*az + wb*bz, wa*aw + wb*bw]
}

// Set true to bypass animation and verify bind-pose identity deformation
const DEBUG_FORCE_BIND_POSE = false

// Animation transform interpretation:
//  'additive'    — Q = animQ * bindQ, T = bindPos + animT  (current, produces large deformations)
//  'replacement' — Q = animQ, T = animT  (animation provides complete local transform)
//  'rotOnly'     — Q = animQ * bindQ, T = bindPos  (ignore animation translation entirely)
const ANIM_MODE: 'additive' | 'replacement' | 'rotOnly' = 'rotOnly'

// Blend factor: 0.0 = bind pose, 1.0 = full animation. Use low values to test formula correctness.
const ANIM_BLEND = 1.0

// --- CPU skinning mesh data ---

export interface CpuSkinMesh {
  geometry: THREE.BufferGeometry
  origPositions: Float32Array   // bind-pose vertex positions (copy)
  boneIndices: Uint8Array       // 4 bone indices per vertex (uses first)
}

interface UseAnimationPlaybackOptions {
  animations: ParsedAnimation[]
  skeleton: ParsedSkeleton | null
  bindWorldMatrices: number[][] | null  // row-major 4×4 per bone (from SkeletonParser)
  meshes: CpuSkinMesh[]
  playing: boolean
  speed: number
  onFrameUpdate?: (frame: number, total: number) => void
}

export function useAnimationPlayback({
  animations, skeleton, bindWorldMatrices, meshes,
  playing, speed, onFrameUpdate,
}: UseAnimationPlaybackOptions) {
  const elapsedRef = useRef(0)
  const inverseBindRef = useRef<number[][] | null>(null)
  const loggedRef = useRef(false)
  const frameCountRef = useRef(0)

  useFrame((_, delta) => {
    if (!skeleton || !bindWorldMatrices || animations.length === 0 || meshes.length === 0) return

    if (playing) elapsedRef.current += delta * speed

    // Pre-compute inverse bind matrices once
    if (!inverseBindRef.current) {
      inverseBindRef.current = bindWorldMatrices.map(invertRigidMatrix4)
    }

    const boneCount = skeleton.bones.length

    // --- Step 1: Build animated LOCAL matrices ---
    // Start with bind-pose local transforms for every bone
    const localMats: number[][] = new Array(boneCount)
    for (let i = 0; i < boneCount; i++) {
      const b = skeleton.bones[i]
      localMats[i] = quatToMatrix(
        b.rotation[0], b.rotation[1], b.rotation[2], b.rotation[3],
        b.position[0], b.position[1], b.position[2],
      )
    }

    // Apply animation: modify local matrices for animated bones
    let debugBonesLogged = 0
    if (DEBUG_FORCE_BIND_POSE) {
      // Skip animation — localMats stay as bind pose.
      // deform should be identity, mesh should look like static bind pose.
    } else
    for (const anim of animations) {
      let j = 0, n = 0, j1 = 0
      if (anim.frameCount > 1) {
        const total = anim.frameCount - 1
        const frame = (elapsedRef.current * anim.speed * 30) % total
        j = Math.floor(frame)
        n = frame - j
        j1 = Math.min(j + 1, total)
      }

      for (const ab of anim.bones) {
        if (ab.boneIndex < 0 || ab.boneIndex >= boneCount) continue
        const bone = skeleton.bones[ab.boneIndex]

        // Interpolate rotation (SLERP)
        let mqx: number, mqy: number, mqz: number, mqw: number
        if (ab.rotationKeyframes && anim.frameCount > 1) {
          const kf = ab.rotationKeyframes
          ;[mqx, mqy, mqz, mqw] = quatSlerp(
            kf[j*4], kf[j*4+1], kf[j*4+2], kf[j*4+3],
            kf[j1*4], kf[j1*4+1], kf[j1*4+2], kf[j1*4+3], n)
        } else {
          mqx = ab.rotationDefault[0]; mqy = ab.rotationDefault[1]
          mqz = ab.rotationDefault[2]; mqw = ab.rotationDefault[3]
        }

        // Interpolate translation (LERP)
        let mtx: number, mty: number, mtz: number
        if (ab.translationKeyframes && anim.frameCount > 1) {
          const kf = ab.translationKeyframes
          mtx = kf[j*3] + (kf[j1*3] - kf[j*3]) * n
          mty = kf[j*3+1] + (kf[j1*3+1] - kf[j*3+1]) * n
          mtz = kf[j*3+2] + (kf[j1*3+2] - kf[j*3+2]) * n
        } else {
          mtx = ab.translationDefault[0]; mty = ab.translationDefault[1]; mtz = ab.translationDefault[2]
        }

        // Compute full-strength animated local transform based on ANIM_MODE
        let fullRx: number, fullRy: number, fullRz: number, fullRw: number
        let fullTx: number, fullTy: number, fullTz: number

        if (ANIM_MODE === 'replacement') {
          // Full replacement: animQ for rotation, animT for position
          fullRx = mqx; fullRy = mqy; fullRz = mqz; fullRw = mqw
          fullTx = mtx; fullTy = mty; fullTz = mtz
        } else if (ANIM_MODE === 'rotOnly') {
          // Delta rotation in bone-local space: bindQ * animQ
          // At rest (animQ=identity): bindQ*identity = bindQ ✓ (preserves bind)
          // During animation: bindQ * smallDelta = bind + perturbation ✓
          ;[fullRx, fullRy, fullRz, fullRw] = quatMultiply(
            bone.rotation[0], bone.rotation[1], bone.rotation[2], bone.rotation[3],
            mqx, mqy, mqz, mqw)  // bindQ first, animQ second
          fullTx = bone.position[0]; fullTy = bone.position[1]; fullTz = bone.position[2]
        } else {
          // bindQ * animQ + additive translation
          ;[fullRx, fullRy, fullRz, fullRw] = quatMultiply(
            bone.rotation[0], bone.rotation[1], bone.rotation[2], bone.rotation[3],
            mqx, mqy, mqz, mqw)
          fullTx = bone.position[0] + mtx; fullTy = bone.position[1] + mty; fullTz = bone.position[2] + mtz
        }

        // Blend between bind pose and full animation
        const br = bone.rotation, bp = bone.position
        const [rx, ry, rz, rw] = quatSlerp(
          br[0], br[1], br[2], br[3],
          fullRx, fullRy, fullRz, fullRw, ANIM_BLEND)
        const ftx = bp[0] + (fullTx - bp[0]) * ANIM_BLEND
        const fty = bp[1] + (fullTy - bp[1]) * ANIM_BLEND
        const ftz = bp[2] + (fullTz - bp[2]) * ANIM_BLEND

        localMats[ab.boneIndex] = quatToMatrix(rx, ry, rz, rw, ftx, fty, ftz)

        // One-time diagnostic for first 3 animated bones
        if (!loggedRef.current && debugBonesLogged < 3) {
          debugBonesLogged++
          const bindQ = bone.rotation
          const dotQuat = Math.abs(mqx*bindQ[0] + mqy*bindQ[1] + mqz*bindQ[2] + mqw*bindQ[3])
          console.log(`[CPUSkin] anim bone ${ab.boneIndex}: animQ=(${mqx.toFixed(4)},${mqy.toFixed(4)},${mqz.toFixed(4)},${mqw.toFixed(4)}) bindQ=(${bindQ[0].toFixed(4)},${bindQ[1].toFixed(4)},${bindQ[2].toFixed(4)},${bindQ[3].toFixed(4)}) dot=${dotQuat.toFixed(4)}`)
          console.log(`  animT=(${mtx.toFixed(4)},${mty.toFixed(4)},${mtz.toFixed(4)}) bindP=(${bone.position[0].toFixed(4)},${bone.position[1].toFixed(4)},${bone.position[2].toFixed(4)})`)
          console.log(`  combined: Q=(${rx.toFixed(4)},${ry.toFixed(4)},${rz.toFixed(4)},${rw.toFixed(4)}) T=(${(bone.position[0]+mtx).toFixed(4)},${(bone.position[1]+mty).toFixed(4)},${(bone.position[2]+mtz).toFixed(4)})`)
        }
      }
    }

    // --- Step 2: Cascade hierarchy → world matrices ---
    // Same cascade as SkeletonParser: world = local * parentWorld (row-major)
    const worldMats: number[][] = new Array(boneCount)
    for (let i = 0; i < boneCount; i++) {
      const parentIdx = skeleton.bones[i].parentIndex
      if (parentIdx < 0 || parentIdx >= i) {
        worldMats[i] = localMats[i]
      } else {
        worldMats[i] = mat4Multiply(localMats[i], worldMats[parentIdx])
      }
    }

    // --- Step 3: Compute per-bone deformation matrices ---
    // deform = inverseBind * animWorld  (row-major: vertex * inverseBind * animWorld)
    const inverseBind = inverseBindRef.current!
    const deformMats: number[][] = new Array(boneCount)
    for (let i = 0; i < boneCount; i++) {
      deformMats[i] = mat4Multiply(inverseBind[i], worldMats[i])
    }

    // Per-frame worst deformation tracking (first 30 render frames)
    frameCountRef.current++
    if (frameCountRef.current <= 30 && frameCountRef.current % 5 === 0) {
      let worstOD = 0, worstTr = 0, worstB = -1
      for (let i = 0; i < deformMats.length; i++) {
        const dm = deformMats[i]
        const od = Math.max(Math.abs(dm[0]-1), Math.abs(dm[5]-1), Math.abs(dm[10]-1))
        const tr = Math.max(Math.abs(dm[12]), Math.abs(dm[13]), Math.abs(dm[14]))
        if (od + tr > worstOD + worstTr) { worstOD = od; worstTr = tr; worstB = i }
      }
      // Check ACTUAL vertex displacement across ALL meshes
      let globalMaxDist = 0, globalMaxMesh = -1, globalMaxVert = -1, globalMaxBone = -1
      for (let mi = 0; mi < meshes.length; mi++) {
        const m = meshes[mi]
        const posArr = m.geometry.attributes.position.array as Float32Array
        for (let v = 0; v < Math.min(m.origPositions.length / 3, 500); v++) {
          const dx = posArr[v*3] - m.origPositions[v*3]
          const dy = posArr[v*3+1] - m.origPositions[v*3+1]
          const dz = posArr[v*3+2] - m.origPositions[v*3+2]
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
          if (dist > globalMaxDist) {
            globalMaxDist = dist; globalMaxMesh = mi; globalMaxVert = v; globalMaxBone = m.boneIndices[v*4]
          }
        }
      }
      console.log(`[CPUSkin] frame${frameCountRef.current}: deform_worst=bone${worstB}(${worstOD.toFixed(3)}) VERTEX_worst=mesh${globalMaxMesh}/v${globalMaxVert}(dist=${globalMaxDist.toFixed(4)},bone=${globalMaxBone}) cpuMeshes=${meshes.length}`)
    }

    // One-time debug log
    if (!loggedRef.current) {
      loggedRef.current = true
      const animatedBones = new Set<number>()
      for (const a of animations) for (const b of a.bones) animatedBones.add(b.boneIndex)
      console.log(`[CPUSkin] FORCE_BIND=${DEBUG_FORCE_BIND_POSE} MODE=${ANIM_MODE} | ${boneCount} bones, ${animatedBones.size} animated, ${meshes.length} meshes, ${animations.length} sections`)

      // Check skeleton bones and find animated ones with non-identity bind rotation
      let nonIdentityCount = 0
      const animBoneMap = new Map<number, { rotDefault: number[], transDefault: number[] }>()
      for (const a of animations) for (const b of a.bones) {
        animBoneMap.set(b.boneIndex, { rotDefault: [...b.rotationDefault], transDefault: [...b.translationDefault] })
      }
      let nonIdAnimLogged = 0
      for (let i = 0; i < boneCount; i++) {
        const r = skeleton.bones[i].rotation
        const isNonIdentity = Math.abs(r[3]) < 0.999 || Math.abs(r[0]) > 0.01 || Math.abs(r[1]) > 0.01 || Math.abs(r[2]) > 0.01
        if (isNonIdentity) nonIdentityCount++
        // Log animated bones with non-identity bind rotation — THIS is the key diagnostic
        const ab = animBoneMap.get(i)
        if (isNonIdentity && ab && nonIdAnimLogged < 5) {
          nonIdAnimLogged++
          const ar = ab.rotDefault, at_ = ab.transDefault
          const dotBind = Math.abs(ar[0]*r[0] + ar[1]*r[1] + ar[2]*r[2] + ar[3]*r[3])
          const dotIdentity = Math.abs(ar[3])  // dot with (0,0,0,1)
          console.log(`[CPUSkin] KEY bone ${i}: bindQ=(${r.map((v: number) => v.toFixed(4)).join(',')}) animDefault=(${ar.map((v: number) => v.toFixed(4)).join(',')})`)
          console.log(`  dot(anim,bind)=${dotBind.toFixed(4)} dot(anim,identity)=${dotIdentity.toFixed(4)} → ${dotBind > dotIdentity ? 'ABSOLUTE (anim≈bind)' : 'DELTA (anim≈identity)'}`)
          console.log(`  parent=${skeleton.bones[i].parentIndex} animT=(${at_.map((v: number) => v.toFixed(4)).join(',')}) bindP=(${skeleton.bones[i].position.map((v: number) => v.toFixed(4)).join(',')})`)
        }
      }
      console.log(`[CPUSkin] skeleton: ${nonIdentityCount}/${boneCount} bones have non-identity rotation, ${nonIdAnimLogged} are animated`)

      // Trace hierarchy chain for worst-deforming bone
      const traceChain = (boneIdx: number) => {
        const chain: string[] = []
        let idx = boneIdx
        while (idx >= 0 && chain.length < 15) {
          const b = skeleton.bones[idx]
          const isAnim = animatedBones.has(idx)
          const dm = deformMats[idx]
          const diag = `${dm[0].toFixed(2)},${dm[5].toFixed(2)},${dm[10].toFixed(2)}`
          const tr = `${dm[12].toFixed(2)},${dm[13].toFixed(2)},${dm[14].toFixed(2)}`
          chain.push(`${idx}${isAnim?'*':''}(d=${diag} t=${tr})`)
          idx = b.parentIndex
        }
        return chain.reverse().join(' → ')
      }

      // Check deformation matrices — ALL should be near-identity at bind pose
      let maxOffDiag = 0, maxTrans = 0, worstBone = -1
      for (let i = 0; i < deformMats.length; i++) {
        const dm = deformMats[i]
        const offDiag = Math.max(Math.abs(dm[0] - 1), Math.abs(dm[5] - 1), Math.abs(dm[10] - 1))
        const trans = Math.max(Math.abs(dm[12]), Math.abs(dm[13]), Math.abs(dm[14]))
        if (offDiag + trans > maxOffDiag + maxTrans) {
          maxOffDiag = offDiag; maxTrans = trans; worstBone = i
        }
      }
      console.log(`[CPUSkin] worst deform: bone ${worstBone} offDiag=${maxOffDiag.toFixed(6)} trans=${maxTrans.toFixed(4)}`)
      if (worstBone >= 0) {
        const dm = deformMats[worstBone]
        console.log(`[CPUSkin] deform[${worstBone}] = [${dm.map((v: number) => v.toFixed(4)).join(', ')}]`)
        console.log(`[CPUSkin] chain for bone ${worstBone}: ${traceChain(worstBone)}`)
      }
      // Also trace bone 3 (first animated) and bone 84 (potential weapon)
      if (deformMats.length > 3) console.log(`[CPUSkin] chain for bone 3: ${traceChain(3)}`)
      if (deformMats.length > 84) console.log(`[CPUSkin] chain for bone 84: ${traceChain(84)}`)

      // Log specific bone data for debugging
      for (const debugIdx of [3, 4, 24]) {
        const ab = animBoneMap.get(debugIdx)
        const sb = skeleton.bones[debugIdx]
        if (ab) {
          console.log(`[CPUSkin] bone ${debugIdx} detail: parent=${sb.parentIndex} bindQ=(${sb.rotation.map((v: number) => v.toFixed(4)).join(',')}) bindP=(${sb.position.map((v: number) => v.toFixed(4)).join(',')}) animQ=(${ab.rotDefault.map((v: number) => v.toFixed(4)).join(',')}) animT=(${ab.transDefault.map((v: number) => v.toFixed(4)).join(',')})`)
        }
      }

      // Log bone index distribution from first mesh
      if (meshes.length > 0) {
        const bi = meshes[0].boneIndices
        const counts = new Map<number, number>()
        for (let v = 0; v < bi.length / 4; v++) {
          const idx = bi[v * 4]
          counts.set(idx, (counts.get(idx) ?? 0) + 1)
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        console.log(`[CPUSkin] mesh[0] bone usage (top 10):`, sorted.map(([b, c]) => `bone${b}:${c}verts`).join(', '))
      }

      // Sample first vertex transform
      if (meshes.length > 0) {
        const m = meshes[0]
        const ox = m.origPositions[0], oy = m.origPositions[1], oz = m.origPositions[2]
        const posArr = m.geometry.attributes.position.array as Float32Array
        const nx = posArr[0], ny = posArr[1], nz = posArr[2]
        const bi = m.boneIndices[0]
        console.log(`[CPUSkin] vert[0]: orig=(${ox.toFixed(3)},${oy.toFixed(3)},${oz.toFixed(3)}) → new=(${nx.toFixed(3)},${ny.toFixed(3)},${nz.toFixed(3)}) bone=${bi}`)
      }
    }

    // --- Step 4: Transform vertices for each mesh ---
    // Test modes: 0 = no transform (bind pose), 1 = just add translation, 2 = full transform
    const DEBUG_TRANSFORM: number = 0  // TODO: set to 2 once animation formula is fixed
    for (const mesh of meshes) {
      const posArr = mesh.geometry.attributes.position.array as Float32Array
      const orig = mesh.origPositions
      const bones = mesh.boneIndices
      const vertCount = orig.length / 3

      if (DEBUG_TRANSFORM === 0) {
        for (let v = 0; v < vertCount * 3; v++) posArr[v] = orig[v]
      } else if (DEBUG_TRANSFORM === 1) {
        // Apply ONLY translation from deformation (identity rotation)
        for (let v = 0; v < vertCount; v++) {
          const bi = bones[v * 4]
          if (bi >= deformMats.length) continue
          const dm = deformMats[bi]
          posArr[v*3]   = orig[v*3]   + dm[12]
          posArr[v*3+1] = orig[v*3+1] + dm[13]
          posArr[v*3+2] = orig[v*3+2] + dm[14]
        }
      } else {
        for (let v = 0; v < vertCount; v++) {
          const bi = bones[v * 4]
          if (bi >= deformMats.length) continue
          const dm = deformMats[bi]
          const ox = orig[v*3], oy = orig[v*3+1], oz = orig[v*3+2]
          posArr[v*3]   = dm[0]*ox + dm[4]*oy + dm[8]*oz  + dm[12]
          posArr[v*3+1] = dm[1]*ox + dm[5]*oy + dm[9]*oz  + dm[13]
          posArr[v*3+2] = dm[2]*ox + dm[6]*oy + dm[10]*oz + dm[14]
        }
      }

      mesh.geometry.attributes.position.needsUpdate = true
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
