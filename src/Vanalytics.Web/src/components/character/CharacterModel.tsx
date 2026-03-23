import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFfxiFileSystem } from '../../context/FfxiFileSystemContext'
import { parseDatFile } from '../../lib/ffxi-dat'
import type { ParsedMesh, ParsedTexture } from '../../lib/ffxi-dat'

interface SlotModel {
  slotId: number
  datPath: string
}

interface CharacterModelProps {
  race?: string
  gender?: string
  slots: SlotModel[]
  onSlotLoaded?: (slotId: number) => void
  onError?: (slotId: number, error: string) => void
}

const datCache = new Map<string, { meshes: ParsedMesh[]; textures: ParsedTexture[] }>()

export default function CharacterModel({
  slots,
  onSlotLoaded,
  onError,
}: CharacterModelProps) {
  const { readFile } = useFfxiFileSystem()
  const groupRef = useRef<THREE.Group>(null)
  const [loadedMeshes, setLoadedMeshes] = useState<Map<number, THREE.Mesh[]>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function loadSlot(slot: SlotModel) {
      try {
        let parsed = datCache.get(slot.datPath)
        if (!parsed) {
          const buffer = await readFile(slot.datPath)
          const dat = parseDatFile(buffer)
          parsed = { meshes: dat.meshes, textures: dat.textures }
          datCache.set(slot.datPath, parsed)
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
            const texture = new THREE.DataTexture(tex.rgba, tex.width, tex.height, THREE.RGBAFormat)
            texture.needsUpdate = true
            texture.magFilter = THREE.NearestFilter
            texture.minFilter = THREE.NearestMipmapLinearFilter
            material = new THREE.MeshStandardMaterial({ map: texture })
          } else {
            material = new THREE.MeshStandardMaterial({ color: 0x888888 })
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

    slots.forEach(loadSlot)
    return () => { cancelled = true }
  }, [slots, readFile, onSlotLoaded, onError])

  useEffect(() => {
    return () => {
      loadedMeshes.forEach(meshes => {
        meshes.forEach(mesh => {
          mesh.geometry.dispose()
          if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.map?.dispose()
            mesh.material.dispose()
          }
        })
      })
    }
  }, [loadedMeshes])

  return (
    <group ref={groupRef}>
      {Array.from(loadedMeshes.values()).flat().map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}
