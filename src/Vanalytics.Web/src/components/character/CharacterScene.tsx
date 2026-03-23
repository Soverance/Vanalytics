import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, type ReactNode } from 'react'

interface CharacterSceneProps {
  children: ReactNode
  className?: string
}

export default function CharacterScene({ children, className }: CharacterSceneProps) {
  return (
    <Canvas
      className={className}
      camera={{ position: [0, 1.2, 3], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.4} color="#c8b8a0" />
      <directionalLight position={[2, 4, 3]} intensity={0.8} color="#fff0d8" castShadow />
      <directionalLight position={[-1, 2, -2]} intensity={0.3} color="#a0b8d0" />
      <OrbitControls
        target={[0, 1, 0]}
        minDistance={1.5}
        maxDistance={6}
        enablePan={false}
        maxPolarAngle={Math.PI * 0.85}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[1.5, 32]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.3} />
      </mesh>
      <Suspense fallback={null}>
        {children}
      </Suspense>
    </Canvas>
  )
}
