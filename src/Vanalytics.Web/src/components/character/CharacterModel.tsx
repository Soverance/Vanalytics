import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import { parseDatFile, parseSkeletonDat, parseAnimationDat } from '../../lib/ffxi-dat'
import { SKELETON_PATHS } from '../../lib/ffxi-dat/SkeletonParser'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton, ParsedAnimation } from '../../lib/ffxi-dat'
import { toRaceId } from '../../lib/model-mappings'
import { useAnimationPlayback } from '../../hooks/useAnimationPlayback'

interface SlotModel {
  slotId: number
  datPath: string
}

interface CharacterModelProps {
  race?: string
  gender?: string
  slots: SlotModel[]
  animationPaths?: string[]
  animationPlaying?: boolean
  animationSpeed?: number
  onAnimationFrame?: (frame: number, total: number) => void
  onSeekRef?: (seekFn: (frame: number) => void) => void
  onSlotLoaded?: (slotId: number) => void
  onError?: (slotId: number, error: string) => void
}

const datCache = new Map<string, { meshes: ParsedMesh[]; textures: ParsedTexture[] }>()
const skeletonCache = new Map<string, { matrices: number[][] | null; parsed: ParsedSkeleton | null }>()
const animCache = new Map<string, ParsedAnimation[]>()

function buildThreeSkeleton(skeleton: ParsedSkeleton): THREE.Skeleton {
  const bones: THREE.Bone[] = skeleton.bones.map(() => new THREE.Bone())

  // Set up parent hierarchy
  skeleton.bones.forEach((b, i) => {
    if (b.parentIndex >= 0 && b.parentIndex < bones.length) {
      bones[b.parentIndex].add(bones[i])
    }
  })

  // Set local transforms from bind pose
  skeleton.bones.forEach((b, i) => {
    const bone = bones[i]
    bone.position.set(b.position[0], b.position[1], b.position[2])
    bone.quaternion.set(b.rotation[0], b.rotation[1], b.rotation[2], b.rotation[3])
    bone.updateMatrix()
  })

  // Compute world matrices for bind-pose inverse
  const rootBones = bones.filter((_, i) => skeleton.bones[i].parentIndex < 0)
  rootBones.forEach(b => b.updateWorldMatrix(false, true))

  // Build inverse bind matrices
  const bindMatrices = bones.map(bone =>
    new THREE.Matrix4().copy(bone.matrixWorld).invert()
  )

  return new THREE.Skeleton(bones, bindMatrices)
}

export default function CharacterModel({
  race,
  gender,
  slots,
  animationPaths,
  animationPlaying,
  animationSpeed,
  onAnimationFrame,
  onSeekRef,
  onSlotLoaded,
  onError,
}: CharacterModelProps) {
  const { readFile } = useFfxiFileSystem()
  const groupRef = useRef<THREE.Group>(null)
  const [loadedMeshes, setLoadedMeshes] = useState<Map<number, THREE.Mesh[]>>(new Map())
  const [animations, setAnimations] = useState<ParsedAnimation[]>([])
  const [bindPose, setBindPose] = useState<Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> | null>(null)
  // Shared skeleton — ALL SkinnedMeshes bind to the same skeleton instance
  // so animation updates are visible to every mesh
  const sharedSkeletonRef = useRef<THREE.Skeleton | null>(null)
  const [, setSkeletonReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadSkeleton(): Promise<{ matrices: number[][] | null; threeSkeleton: THREE.Skeleton | null }> {
      const raceId = toRaceId(race, gender)
      if (!raceId) return { matrices: null, threeSkeleton: null }

      const skelPath = SKELETON_PATHS[raceId]
      if (!skelPath) return { matrices: null, threeSkeleton: null }

      const cached = skeletonCache.get(skelPath)
      if (cached !== undefined) {
        const threeSkel = cached.parsed ? buildThreeSkeleton(cached.parsed) : null
        return { matrices: cached.matrices, threeSkeleton: threeSkel }
      }

      try {
        const buffer = await readFile(skelPath)
        const skeleton = parseSkeletonDat(buffer)
        const matrices = skeleton?.matrices ?? null
        skeletonCache.set(skelPath, { matrices, parsed: skeleton ?? null })
        const threeSkel = skeleton ? buildThreeSkeleton(skeleton) : null
        return { matrices, threeSkeleton: threeSkel }
      } catch {
        skeletonCache.set(skelPath, { matrices: null, parsed: null })
        return { matrices: null, threeSkeleton: null }
      }
    }

    async function loadSlot(slot: SlotModel, skelMatrices: number[][] | null) {
      const cacheKey = skelMatrices ? `skel:${slot.datPath}` : slot.datPath
      try {
        let parsed = datCache.get(cacheKey)
        if (!parsed) {
          const buffer = await readFile(slot.datPath)
          const dat = parseDatFile(buffer, skelMatrices)
          parsed = { meshes: dat.meshes, textures: dat.textures }
          datCache.set(cacheKey, parsed)
        }

        if (cancelled) return

        const threeMeshes = parsed.meshes.map((mesh) => {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
          geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2))
          let material: THREE.Material
          const tex = parsed!.textures[mesh.materialIndex]
          if (tex) {
            const rgba = new Uint8Array(tex.rgba)
            const texture = new THREE.DataTexture(rgba, tex.width, tex.height, THREE.RGBAFormat)
            texture.wrapS = THREE.RepeatWrapping
            texture.wrapT = THREE.RepeatWrapping
            texture.needsUpdate = true
            texture.magFilter = THREE.LinearFilter
            texture.minFilter = THREE.LinearMipmapLinearFilter
            texture.generateMipmaps = true
            material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
          } else {
            material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide })
          }

          // SkinnedMesh — all meshes share the SAME skeleton so animation
          // updates are visible to every mesh simultaneously
          if (mesh.boneIndices.length > 0 && sharedSkeletonRef.current) {
            geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(
              new Uint16Array(mesh.boneIndices), 4))
            geometry.setAttribute('skinWeight', new THREE.BufferAttribute(mesh.boneWeights, 4))
            const skinned = new THREE.SkinnedMesh(geometry, material)
            skinned.bind(sharedSkeletonRef.current)
            return skinned as THREE.Mesh
          }

          return new THREE.Mesh(geometry, material)
        })

        if (!cancelled) {
          setLoadedMeshes(prev => {
            const next = new Map(prev)
            next.set(slot.slotId, threeMeshes)
            return next
          })
          onSlotLoaded?.(slot.slotId)
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(slot.slotId, err instanceof Error ? err.message : String(err))
        }
      }
    }

    async function loadAll() {
      const { matrices, threeSkeleton } = await loadSkeleton()
      if (cancelled) return
      if (threeSkeleton) {
        // Store shared skeleton and bind pose
        sharedSkeletonRef.current = threeSkeleton
        const bp = threeSkeleton.bones.map(b => ({
          position: b.position.clone(),
          quaternion: b.quaternion.clone(),
        }))
        setBindPose(bp)
        setSkeletonReady(true)

        // Add root bone(s) to the group so they're in the scene graph
        // (required for SkinnedMesh world-space computation)
        if (groupRef.current) {
          threeSkeleton.bones.forEach((bone) => {
            if (!bone.parent || !(bone.parent as THREE.Bone).isBone) {
              groupRef.current!.add(bone)
            }
          })
        }
      }
      slots.forEach(slot => loadSlot(slot, matrices))
    }

    loadAll()
    return () => { cancelled = true }
  }, [race, gender, slots, readFile, onSlotLoaded, onError])

  useEffect(() => {
    return () => {
      // Dispose skeleton
      sharedSkeletonRef.current?.dispose()
      sharedSkeletonRef.current = null
      loadedMeshes.forEach(meshes => {
        meshes.forEach(mesh => {
          mesh.geometry.dispose()
          if (mesh.material instanceof THREE.MeshBasicMaterial) {
            mesh.material.map?.dispose()
            mesh.material.dispose()
          }
        })
      })
    }
  }, [loadedMeshes])

  // Load animation DATs when animationPaths changes
  useEffect(() => {
    console.log('[CharModel] animationPaths changed:', animationPaths?.length ?? 0, 'paths:', animationPaths?.slice(0, 3))
    if (!animationPaths || animationPaths.length === 0) {
      setAnimations([])
      return
    }
    let cancelled = false
    async function loadAnims() {
      // Each DAT contains multiple animation clips (~3 sections each: upper/lower/additional body).
      // Load only the FIRST DAT path — it contains the animation for this entry.
      // Each clip is 3 consecutive sections; take the first 3 for the primary animation.
      const path = animationPaths![0]
      const cacheKey = `anim:${path}`
      let sections = animCache.get(cacheKey)
      if (!sections) {
        try {
          const buffer = await readFile(path)
          console.log('[CharModel] parsing anim DAT:', path, 'size:', buffer.byteLength)
          sections = parseAnimationDat(buffer, path)
          console.log('[CharModel] parsed:', sections.length, 'sections from', path)
          animCache.set(cacheKey, sections)
        } catch (err) {
          console.warn('[CharModel] failed to load anim:', path, err)
          if (!cancelled) setAnimations([])
          return
        }
      }
      // Each 0x2B block is a complete full-body animation clip.
      // Take only the first one.
      const clip = sections.slice(0, 1)
      console.log('[CharModel] using', clip.length, 'sections, frames:', clip.map(s => s.frameCount), 'bones:', clip.map(s => s.bones.length))
      if (!cancelled) setAnimations(clip)
    }
    loadAnims()
    return () => { cancelled = true }
  }, [animationPaths, readFile])

  // Wire up animation playback — uses the shared skeleton ref
  const { seekToFrame } = useAnimationPlayback({
    animations,
    skeleton: sharedSkeletonRef.current,
    bindPose,
    playing: animationPlaying ?? false,
    speed: animationSpeed ?? 1.0,
    onFrameUpdate: onAnimationFrame,
  })

  // Expose seekToFrame to parent via callback ref
  useEffect(() => { onSeekRef?.(seekToFrame) }, [seekToFrame, onSeekRef])

  return (
    <group ref={groupRef} rotation={[Math.PI, Math.PI / 2, 0]}>
      {Array.from(loadedMeshes.values()).flat().map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}
