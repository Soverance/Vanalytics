import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { ParsedZone } from '../../lib/ffxi-dat'
import SpawnMarkers from './SpawnMarkers'
import type { SpawnPoint } from '../../lib/ffxi-dat/SpawnParser'

interface ThreeZoneViewerProps {
  zoneData: ParsedZone
  fogDensity?: number  // 0 = off, 0-1 = near/far multiplier (higher = thicker)
  cameraMode?: 'orbit' | 'fly'
  onFlySpeedChange?: (speed: number) => void
  spawnMarkers?: SpawnPoint[]
  showSpawns?: boolean
}

const FOG_COLOR = '#b8c8d8'


export default function ThreeZoneViewer({ zoneData, fogDensity = 0, cameraMode = 'orbit', onFlySpeedChange, spawnMarkers, showSpawns }: ThreeZoneViewerProps) {
  const { geometries, materials } = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.MeshBasicMaterial[] = []

    for (const prefab of zoneData.prefabs) {
      const geometry = new THREE.BufferGeometry()

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(prefab.vertices), 3))
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(prefab.normals), 3))

      // Drop alpha channel — use only RGB from the flat RGBA color array
      const rgbColors: number[] = []
      for (let i = 0; i < prefab.colors.length; i += 4) {
        rgbColors.push(prefab.colors[i], prefab.colors[i + 1], prefab.colors[i + 2])
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rgbColors), 3))

      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(prefab.uvs), 2))

      const maxIndex = prefab.indices.length > 0 ? Math.max(...prefab.indices) : 0
      if (maxIndex > 65535) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(prefab.indices), 1))
      } else {
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(prefab.indices), 1))
      }

      geometry.computeBoundingBox()

      geometries.push(geometry)

      const tex = zoneData.textures[prefab.materialIndex]
      const useAlpha = prefab.blending > 0
      let material: THREE.MeshBasicMaterial
      if (tex) {
        const rgba = new Uint8Array(tex.rgba)
        const texture = new THREE.DataTexture(rgba, tex.width, tex.height, THREE.RGBAFormat)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.generateMipmaps = true
        texture.flipY = false

        material = new THREE.MeshBasicMaterial({
          map: texture,
          vertexColors: true,
          side: THREE.DoubleSide,
          ...(useAlpha && { alphaTest: 0.1 }),
        })
      } else {
        material = new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        })
      }

      materials.push(material)
    }

    return { geometries, materials }
  }, [zoneData])

  const instanceData = useMemo(() => {
    return zoneData.instances.map(inst => {
      const matrix = new THREE.Matrix4()
      matrix.fromArray(inst.transform)
      return { meshIndex: inst.meshIndex, matrix }
    })
  }, [zoneData])

  const { center, size, farPlane } = useMemo(() => {
    const bbox = new THREE.Box3()
    for (const inst of zoneData.instances) {
      const prefab = zoneData.prefabs[inst.meshIndex]
      if (!prefab) continue
      // Transform translations — flip Y to match the Math.PI rotation
      const x = inst.transform[12], y = -inst.transform[13], z = -inst.transform[14]
      bbox.expandByPoint(new THREE.Vector3(x, y, z))
    }

    const center = new THREE.Vector3()
    const sizeVec = new THREE.Vector3()
    bbox.getCenter(center)
    bbox.getSize(sizeVec)
    const diagonalSize = Math.sqrt(sizeVec.x ** 2 + sizeVec.y ** 2 + sizeVec.z ** 2) || 100
    const size = diagonalSize
    const farPlane = Math.max(10000, diagonalSize * 3)

    return { center, size, farPlane }
  }, [zoneData])

  useEffect(() => {
    return () => {
      geometries.forEach(g => g.dispose())
      materials.forEach(m => {
        m.map?.dispose()
        m.dispose()
      })
    }
  }, [geometries, materials])

  if (zoneData.prefabs.length === 0 || zoneData.instances.length === 0) {
    return null
  }

  const cx = center.x, cy = center.y, cz = center.z

  return (
    <Canvas
      camera={{ position: [cx, cy + size * 0.5, cz + size], fov: 60, far: farPlane }}
      gl={{ antialias: true }}
      className="w-full h-full"
    >
      {/* Sky background — matches fog color for seamless blending */}
      <color attach="background" args={[fogDensity > 0 ? FOG_COLOR : '#1a1a2e']} />

      {/* Distance fog — density controls near/far range */}
      {fogDensity > 0 && (
        <FogController color={FOG_COLOR} size={size} density={fogDensity} />
      )}

      {cameraMode === 'orbit' ? (
        <OrbitControls target={[cx, cy, cz]} maxDistance={size * 5} />
      ) : (
        <FlyCamera center={center} size={size} onSpeedChange={onFlySpeedChange} />
      )}

      {/* FFXI uses inverted Y — flip with Math.PI rotation like entity viewer */}
      <group rotation={[Math.PI, 0, 0]}>
        {instanceData.map((inst, i) => {
          const geo = geometries[inst.meshIndex]
          const mat = materials[inst.meshIndex]
          if (!geo || !mat) return null
          return (
            <mesh
              key={i}
              geometry={geo}
              material={mat}
              matrixAutoUpdate={false}
              matrix={inst.matrix}
            />
          )
        })}
        <SpawnMarkers spawns={spawnMarkers ?? []} visible={showSpawns ?? false} />
      </group>
    </Canvas>
  )
}

/** Applies fog to the scene imperatively so density can change without remounting */
function FogController({ color, size, density }: { color: string; size: number; density: number }) {
  const { scene } = useThree()

  useEffect(() => {
    // density 0.5 = default range, lower = farther fog, higher = closer fog
    const near = size * (0.6 - density * 0.5)
    const far = size * (3.0 - density * 2.0)
    scene.fog = new THREE.Fog(color, Math.max(0, near), Math.max(far, near + 10))
    return () => { scene.fog = null }
  }, [scene, color, size, density])

  return null
}

function FlyCamera({ center, size, onSpeedChange }: { center: THREE.Vector3; size: number; onSpeedChange?: (speed: number) => void }) {
  const { camera, gl } = useThree()
  const moveState = useRef({ forward: false, backward: false, left: false, right: false, up: false, down: false })
  const speed = useRef(size * 0.003)  // Slower default (was 0.01)
  const locked = useRef(false)

  useEffect(() => {
    camera.position.set(center.x, center.y + size * 0.5, center.z + size)
    camera.lookAt(center)
    onSpeedChange?.(speed.current)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveState.current.forward = true
      if (e.code === 'KeyS') moveState.current.backward = true
      if (e.code === 'KeyA') moveState.current.left = true
      if (e.code === 'KeyD') moveState.current.right = true
      if (e.code === 'Space') moveState.current.up = true
      if (e.code === 'ShiftLeft') moveState.current.down = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') moveState.current.forward = false
      if (e.code === 'KeyS') moveState.current.backward = false
      if (e.code === 'KeyA') moveState.current.left = false
      if (e.code === 'KeyD') moveState.current.right = false
      if (e.code === 'Space') moveState.current.up = false
      if (e.code === 'ShiftLeft') moveState.current.down = false
    }
    const onWheel = (e: WheelEvent) => {
      speed.current = Math.max(0.05, speed.current * (e.deltaY > 0 ? 1.25 : 0.8))
      onSpeedChange?.(speed.current)
    }
    const onClick = () => {
      gl.domElement.requestPointerLock()
    }
    const onPointerLockChange = () => {
      locked.current = !!document.pointerLockElement
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!locked.current) return
      const euler = new THREE.Euler(0, 0, 0, 'YXZ')
      euler.setFromQuaternion(camera.quaternion)
      euler.y -= e.movementX * 0.002
      euler.x -= e.movementY * 0.002
      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x))
      camera.quaternion.setFromEuler(euler)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    gl.domElement.addEventListener('wheel', onWheel)
    gl.domElement.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      gl.domElement.removeEventListener('wheel', onWheel)
      gl.domElement.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [camera, gl, center, size, onSpeedChange])

  useFrame(() => {
    if (!locked.current) return
    const dir = new THREE.Vector3()
    const s = speed.current
    if (moveState.current.forward) dir.z -= s
    if (moveState.current.backward) dir.z += s
    if (moveState.current.left) dir.x -= s
    if (moveState.current.right) dir.x += s
    if (moveState.current.up) dir.y += s
    if (moveState.current.down) dir.y -= s
    dir.applyQuaternion(camera.quaternion)
    camera.position.add(dir)
  })

  return null
}
