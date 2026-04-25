
/**
 * Dark reflective floor + lighting.
 * Floor: MeshReflectorMaterial — planar reflection, roughness-blurred, very subtle.
 * Lighting: strong warm key, cold blue moon, cyan rim, bounce fill.
 * Environment: drei "night" HDRI for metalness reflections on assets.
 */

import { MeshReflectorMaterial, Environment as DreiEnvironment } from '@react-three/drei'
import { hex } from '@/theme'
import { useStore } from '@/state/store'

// ─── Reflective floor ─────────────────────────────────────────────────────────
function Floor() {
  return (
    <group>
      {/* Main reflective plane — sits at ocean level */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6, 0]} receiveShadow>
        <planeGeometry args={[800, 800]} />
        <MeshReflectorMaterial
          color="#060E1C"
          mirror={0.45}
          roughness={0.9}
          blur={[256, 64]}
          resolution={256}
          mixBlur={1.0}
          mixStrength={0.3}
          depthScale={0.3}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          metalness={0.0}
          reflectorOffset={0.0}
        />
      </mesh>

      {/* Far backdrop — extends to horizon, no reflection (performance) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6.1, 0]}>
        <planeGeometry args={[2400, 2400]} />
        <meshBasicMaterial color="#040A14" />
      </mesh>
    </group>
  )
}

// ─── Lighting ─────────────────────────────────────────────────────────────────
function Lights() {
  const namespaces = useStore(s => s.namespaces)

  return (
    <>
      <hemisphereLight args={[0x1A3A5C, 0x050D18, 0.35]} />

      <directionalLight
        color={0xFFF2DC}
        intensity={4.5}
        position={[30, 55, 18]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-near={1}
        shadow-camera-far={250}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />

      {/* Cold blue moon — opposite low angle */}
      <directionalLight color={0x1A4FD8} intensity={1.2} position={[-35, 12, -28]} />

      {/* Cyan rim from behind */}
      <directionalLight color={0x00F5FF} intensity={0.9} position={[-10, 20, -40]} />

      {/* Floor bounce fill — slightly warmer to complement reflection */}
      <directionalLight color={0x002D4A} intensity={0.4} position={[0, -20, 0]} />

      {/* Per-namespace under-glow reflected on floor */}
      {namespaces.map(ns => (
        <pointLight
          key={ns.id}
          color={ns.hue}
          intensity={1.4}
          distance={28}
          decay={2}
          position={[ns.center[0], -2, ns.center[1]]}
        />
      ))}

      <pointLight color={hex.cyan} intensity={0.6} distance={160} decay={1} position={[0, -4, 0]} />
    </>
  )
}

export function Environment() {
  return (
    <>
      <Lights />
      <Floor />
      <DreiEnvironment preset="night" />
    </>
  )
}
