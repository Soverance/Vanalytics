import type { SpawnPoint } from '../../lib/ffxi-dat/SpawnParser'

interface SpawnMarkersProps {
  spawns: SpawnPoint[]
  visible: boolean
}

export default function SpawnMarkers({ spawns, visible }: SpawnMarkersProps) {
  if (!visible || spawns.length === 0) return null
  return (
    <group>
      {spawns.map((spawn, i) => (
        <group key={i} position={[spawn.x, spawn.y, spawn.z]}>
          <mesh>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#ff4444" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
