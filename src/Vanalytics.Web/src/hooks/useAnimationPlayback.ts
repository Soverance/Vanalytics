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

// Blend factor: 0.0 = pure bind pose, 1.0 = full animation.
// Use low values to test incrementally: 0.0 → verify bind, 0.1 → slight anim, etc.
const ANIM_BLEND = 1.0

// --- CPU skinning mesh data ---

export interface CpuSkinMesh {
  geometry: THREE.BufferGeometry
  origPositions: Float32Array   // bind-pose vertex positions (copy)
  boneIndices: Uint8Array       // 4 bone indices per vertex (uses first)
  dualBone?: {
    localPos1: Float32Array   // bone-local positions for bone 1 (3 per vert)
    localPos2: Float32Array   // bone-local positions for bone 2 (3 per vert)
    weights: Float32Array     // (w1, w2) per vertex
  }
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

        // Galkareeve formula: mat[bno] = matBones[bno] * motionMatrix
        // Where motionMatrix = T(-bindPos) * R(animQ) * T(bindPos + animT)
        // Combined result: rotation = R(bindQ) * R(animQ), translation = bindT + animT
        // In quaternion terms: R(A)*R(B) = R(B*A), so combined quat = animQ * bindQ
        const [rx, ry, rz, rw] = quatMultiply(
          mqx, mqy, mqz, mqw,
          bone.rotation[0], bone.rotation[1], bone.rotation[2], bone.rotation[3])
        const ftx = bone.position[0] + mtx
        const fty = bone.position[1] + mty
        const ftz = bone.position[2] + mtz

        // Blend between bind pose and animated local transform
        if (ANIM_BLEND < 1.0) {
          const br = bone.rotation, bp = bone.position
          const [brx, bry, brz, brw] = quatSlerp(
            br[0], br[1], br[2], br[3], rx, ry, rz, rw, ANIM_BLEND)
          const btx = bp[0] + (ftx - bp[0]) * ANIM_BLEND
          const bty = bp[1] + (fty - bp[1]) * ANIM_BLEND
          const btz = bp[2] + (ftz - bp[2]) * ANIM_BLEND
          localMats[ab.boneIndex] = quatToMatrix(brx, bry, brz, brw, btx, bty, btz)
        } else {
          localMats[ab.boneIndex] = quatToMatrix(rx, ry, rz, rw, ftx, fty, ftz)
        }

        // One-time diagnostic for first 3 animated bones
        if (!loggedRef.current && debugBonesLogged < 3) {
          debugBonesLogged++
          console.log(`[CPUSkin] bone ${ab.boneIndex}: animQ=(${mqx.toFixed(4)},${mqy.toFixed(4)},${mqz.toFixed(4)},${mqw.toFixed(4)}) bindQ=(${bone.rotation.map((v: number) => v.toFixed(4)).join(',')})`)
          console.log(`  animT=(${mtx.toFixed(4)},${mty.toFixed(4)},${mtz.toFixed(4)}) bindP=(${bone.position.map((v: number) => v.toFixed(4)).join(',')})`)
          console.log(`  result: Q=(${rx.toFixed(4)},${ry.toFixed(4)},${rz.toFixed(4)},${rw.toFixed(4)}) T=(${ftx.toFixed(4)},${fty.toFixed(4)},${ftz.toFixed(4)})`)
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
      console.log(`[CPUSkin] FORCE_BIND=${DEBUG_FORCE_BIND_POSE} | ${boneCount} bones, ${animatedBones.size} animated, ${meshes.length} meshes, ${animations.length} sections`)

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

    // --- Step 3b: Check for NaN/Infinity in deformation matrices (once) ---
    if (!loggedRef.current) {
      let nanCount = 0, infCount = 0, hugeCount = 0
      for (let i = 0; i < deformMats.length; i++) {
        const dm = deformMats[i]
        for (let k = 0; k < 16; k++) {
          if (isNaN(dm[k])) nanCount++
          else if (!isFinite(dm[k])) infCount++
          else if (Math.abs(dm[k]) > 100) hugeCount++
        }
      }
      if (nanCount || infCount || hugeCount) {
        console.error(`[CPUSkin] BAD DEFORM MATRICES: NaN=${nanCount} Inf=${infCount} huge=${hugeCount}`)
      }
    }

    // --- Step 4: Transform vertices for each mesh ---
    for (const mesh of meshes) {
      const posArr = mesh.geometry.attributes.position.array as Float32Array
      const orig = mesh.origPositions
      const bones = mesh.boneIndices
      const vertCount = orig.length / 3

      if (mesh.dualBone) {
        // Dual-bone path: transform each bone's local position by its world matrix, sum.
        // MV2 vertices use worldMats directly (not deformMats) because they store
        // bone-local positions that need D3DXVec4Transform with w-weighted translation.
        // MV1 vertices in a dual-bone mesh also use worldMats for consistency (w=1).
        const lp1 = mesh.dualBone.localPos1
        const lp2 = mesh.dualBone.localPos2
        const wts = mesh.dualBone.weights
        for (let v = 0; v < vertCount; v++) {
          const bi1 = bones[v * 4]
          const bi2 = bones[v * 4 + 1]
          const w1 = wts[v * 2], w2 = wts[v * 2 + 1]

          // Bone 1: D3DXVec4Transform(localPos1, w1, worldMats[bi1])
          const wm1 = (bi1 < worldMats.length) ? worldMats[bi1] : null
          const wm2 = (bi2 < worldMats.length && w2 > 0) ? worldMats[bi2] : null

          let px = 0, py = 0, pz = 0
          if (wm1) {
            const x = lp1[v*3], y = lp1[v*3+1], z = lp1[v*3+2]
            px += x*wm1[0] + y*wm1[4] + z*wm1[8]  + w1*wm1[12]
            py += x*wm1[1] + y*wm1[5] + z*wm1[9]  + w1*wm1[13]
            pz += x*wm1[2] + y*wm1[6] + z*wm1[10] + w1*wm1[14]
          }
          if (wm2) {
            const x = lp2[v*3], y = lp2[v*3+1], z = lp2[v*3+2]
            px += x*wm2[0] + y*wm2[4] + z*wm2[8]  + w2*wm2[12]
            py += x*wm2[1] + y*wm2[5] + z*wm2[9]  + w2*wm2[13]
            pz += x*wm2[2] + y*wm2[6] + z*wm2[10] + w2*wm2[14]
          }

          posArr[v*3] = px; posArr[v*3+1] = py; posArr[v*3+2] = pz
        }
      } else {
        // Single-bone path: use deformation matrices (existing approach)
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

      // Post-transform: check for extreme vertex positions (once per mesh, first frame only)
      if (!loggedRef.current) {
        let maxDist = 0, maxV = -1, nanVerts = 0
        for (let v = 0; v < vertCount; v++) {
          const px = posArr[v*3], py = posArr[v*3+1], pz = posArr[v*3+2]
          if (isNaN(px) || isNaN(py) || isNaN(pz)) { nanVerts++; continue }
          const dist = Math.sqrt(px*px + py*py + pz*pz)
          if (dist > maxDist) { maxDist = dist; maxV = v }
        }
        if (nanVerts > 0 || maxDist > 5) {
          const bi = maxV >= 0 ? bones[maxV * 4] : -1
          console.error(`[CPUSkin] MESH PROBLEM: verts=${vertCount} nanVerts=${nanVerts} maxDist=${maxDist.toFixed(2)} at v${maxV}(bone${bi})`)
          if (maxV >= 0) {
            const ox = orig[maxV*3], oy = orig[maxV*3+1], oz = orig[maxV*3+2]
            console.error(`  orig=(${ox.toFixed(3)},${oy.toFixed(3)},${oz.toFixed(3)}) new=(${posArr[maxV*3].toFixed(3)},${posArr[maxV*3+1].toFixed(3)},${posArr[maxV*3+2].toFixed(3)}) bone=${bi}`)
            if (bi < deformMats.length) {
              const dm = deformMats[bi]
              console.error(`  deform=[${dm.slice(0,4).map((v: number) => v.toFixed(3)).join(',')};${dm.slice(4,8).map((v: number) => v.toFixed(3)).join(',')};${dm.slice(8,12).map((v: number) => v.toFixed(3)).join(',')};${dm.slice(12).map((v: number) => v.toFixed(3)).join(',')}]`)
            }
          }
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
