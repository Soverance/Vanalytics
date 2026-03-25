import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import { parseDatFile, parseSkeletonDat, parseAnimationDat } from '../../lib/ffxi-dat'
import { SKELETON_PATHS } from '../../lib/ffxi-dat/SkeletonParser'
import type { ParsedMesh, ParsedTexture, ParsedSkeleton, ParsedAnimation } from '../../lib/ffxi-dat'
import { toRaceId } from '../../lib/model-mappings'
import { useAnimationPlayback, type CpuSkinMesh } from '../../hooks/useAnimationPlayback'

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

  // CPU skinning data — no THREE.Skeleton or SkinnedMesh needed
  const parsedSkeletonRef = useRef<ParsedSkeleton | null>(null)
  const bindWorldMatricesRef = useRef<number[][] | null>(null)
  const cpuSkinMeshesRef = useRef<CpuSkinMesh[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadSkeleton(): Promise<{ matrices: number[][] | null; parsed: ParsedSkeleton | null }> {
      const raceId = toRaceId(race, gender)
      if (!raceId) return { matrices: null, parsed: null }

      const skelPath = SKELETON_PATHS[raceId]
      if (!skelPath) return { matrices: null, parsed: null }

      const cached = skeletonCache.get(skelPath)
      if (cached !== undefined) {
        return { matrices: cached.matrices, parsed: cached.parsed }
      }

      try {
        const buffer = await readFile(skelPath)
        const skeleton = parseSkeletonDat(buffer)
        const matrices = skeleton?.matrices ?? null
        skeletonCache.set(skelPath, { matrices, parsed: skeleton ?? null })
        return { matrices, parsed: skeleton ?? null }
      } catch {
        skeletonCache.set(skelPath, { matrices: null, parsed: null })
        return { matrices: null, parsed: null }
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

          const threeMesh = new THREE.Mesh(geometry, material)

          // Register for CPU skinning if this mesh has bone data
          if (mesh.boneIndices.length > 0) {
            cpuSkinMeshesRef.current.push({
              geometry,
              origPositions: new Float32Array(mesh.vertices),  // copy of bind-pose positions
              boneIndices: mesh.boneIndices,
            })
          }

          return threeMesh
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
      const { matrices, parsed } = await loadSkeleton()
      if (cancelled) return

      // Store skeleton data for CPU skinning (no THREE.Skeleton needed)
      parsedSkeletonRef.current = parsed
      bindWorldMatricesRef.current = matrices
      cpuSkinMeshesRef.current = []  // reset for new load

      slots.forEach(slot => loadSlot(slot, matrices))
    }

    loadAll()
    return () => { cancelled = true }
  }, [race, gender, slots, readFile, onSlotLoaded, onError])

  useEffect(() => {
    return () => {
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
      // Load block 0 from the first DAT for now.
      // TODO: proper animation-to-block-index mapping.
      const path = animationPaths![0]
      const cacheKey = `anim:${path}`
      let sections = animCache.get(cacheKey)
      if (!sections) {
        try {
          const buffer = await readFile(path)
          console.log('[CharModel] parsing anim DAT:', path, 'size:', buffer.byteLength)
          sections = parseAnimationDat(buffer, path)
          console.log('[CharModel] parsed:', sections.length, 'blocks from', path)
          animCache.set(cacheKey, sections)
        } catch (err) {
          console.warn('[CharModel] failed to load anim:', path, err)
          if (!cancelled) setAnimations([])
          return
        }
      }
      // Log all sections to understand the body-part split
      for (let i = 0; i < Math.min(sections.length, 5); i++) {
        const s = sections[i]
        const boneIdxs = s.bones.slice(0, 5).map(b => b.boneIndex)
        console.log(`[CharModel] block[${i}]: ${s.frameCount} frames, speed=${s.speed}, ${s.bones.length} bones, first indices=[${boneIdxs}]`)
      }
      // DEBUG: Override with idle/breathing animation (ROM/71/99.dat motion 1 = "idl")
      // Remove this override once animation selection is working
      const debugAnimPath = 'ROM/71/99.dat'
      const debugMotionIdx = 1  // 0=id1 (hands on hips), 1=idl (arms by sides, breathing)
      let debugSections = animCache.get(`anim:${debugAnimPath}`)
      if (!debugSections) {
        try {
          const buf = await readFile(debugAnimPath)
          debugSections = parseAnimationDat(buf, debugAnimPath)
          console.log(`[CharModel] DEBUG: parsed ${debugSections.length} blocks from ${debugAnimPath}`)
          animCache.set(`anim:${debugAnimPath}`, debugSections)
        } catch (err) {
          console.warn('[CharModel] DEBUG: failed to load idle anim:', err)
          debugSections = undefined
        }
      }
      // Skip the original DAT entirely when debug override is active
      if (debugSections) { sections = debugSections }
      // Group blocks into motions: same frame count + speed, non-overlapping bones
      const src = debugSections ?? sections
      const motionGroups: typeof src[] = []
      let currentGroup: typeof src = []
      let currentBones = new Set<number>()
      for (let i = 0; i < src.length; i++) {
        const block = src[i]
        const matchesTiming = currentGroup.length === 0 ||
          (block.frameCount === currentGroup[0].frameCount &&
           Math.abs(block.speed - currentGroup[0].speed) < 0.001)
        // Check if this block's bones overlap with current group
        const hasOverlap = block.bones.some(b => currentBones.has(b.boneIndex))

        if (matchesTiming && !hasOverlap) {
          currentGroup.push(block)
          for (const b of block.bones) currentBones.add(b.boneIndex)
        } else {
          if (currentGroup.length > 0) motionGroups.push(currentGroup)
          currentGroup = [block]
          currentBones = new Set(block.bones.map(b => b.boneIndex))
        }
      }
      if (currentGroup.length > 0) motionGroups.push(currentGroup)
      console.log(`[CharModel] ${motionGroups.length} motions detected:`, motionGroups.map((g, i) =>
        `motion${i}(${g.length}blk, ${g[0].frameCount}fr, ${g.reduce((s, b) => s + b.bones.length, 0)}bones)`
      ).join(', '))
      // Select motion (debugMotionIdx when overriding, else 0)
      const motionIdx = debugSections ? debugMotionIdx : 0
      const clip = motionGroups[motionIdx] ?? motionGroups[0] ?? src.slice(0, 1)
      console.log(`[CharModel] using motion ${motionIdx}: ${clip.length} blocks, ${clip.reduce((s, b) => s + b.bones.length, 0)} bones`)
      console.log('[CharModel] using', clip.length, '/', sections.length, 'sections, frames:', clip.map(s => s.frameCount), 'bones:', clip.map(s => s.bones.length))
      if (!cancelled) setAnimations(clip)
    }
    loadAnims()
    return () => { cancelled = true }
  }, [animationPaths, readFile])

  // CPU skinning animation playback
  const { seekToFrame } = useAnimationPlayback({
    animations,
    skeleton: parsedSkeletonRef.current,
    bindWorldMatrices: bindWorldMatricesRef.current,
    meshes: cpuSkinMeshesRef.current,
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
