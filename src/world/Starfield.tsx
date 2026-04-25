
/**
 * Starfield — 2000 additive-blended points in a sphere.
 * Slowly drifts to add life. Excludes a 120-unit inner radius (island zone).
 * Horizon haze ring: large inverted sphere with gradient emissive.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const STAR_COUNT    = 2000
const OUTER_RADIUS  = 500
const INNER_RADIUS  = 120
const DRIFT_SPEED   = 0.003

function buildStarPositions(): Float32Array {
  const positions = new Float32Array(STAR_COUNT * 3)
  let i = 0
  while (i < STAR_COUNT) {
    const x = (Math.random() - 0.5) * OUTER_RADIUS * 2
    const y = (Math.random() - 0.5) * OUTER_RADIUS * 2
    const z = (Math.random() - 0.5) * OUTER_RADIUS * 2
    const dist = Math.sqrt(x * x + y * y + z * z)
    if (dist > INNER_RADIUS && dist < OUTER_RADIUS) {
      positions[i * 3]     = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      i++
    }
  }
  return positions
}

function buildStarColors(): Float32Array {
  // Mix of cool whites, faint blues, faint cyans
  const colors = new Float32Array(STAR_COUNT * 3)
  const palette = [
    [1.0, 1.0, 1.0],
    [0.85, 0.92, 1.0],
    [0.7, 0.9, 1.0],
    [0.6, 1.0, 0.95],
  ]
  for (let i = 0; i < STAR_COUNT; i++) {
    const c = palette[Math.floor(Math.random() * palette.length)]
    const bright = 0.4 + Math.random() * 0.6
    colors[i * 3]     = c[0] * bright
    colors[i * 3 + 1] = c[1] * bright
    colors[i * 3 + 2] = c[2] * bright
  }
  return colors
}

export function Starfield() {
  const pointsRef = useRef<THREE.Points>(null)

  const { positions, colors } = useMemo(() => ({
    positions: buildStarPositions(),
    colors:    buildStarColors(),
  }), [])

  useFrame((_, dt) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += DRIFT_SPEED * dt
      pointsRef.current.rotation.x += DRIFT_SPEED * 0.3 * dt
    }
  })

  return (
    <>
      {/* Stars */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.9}
          vertexColors
          sizeAttenuation
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Horizon haze — large inverted sphere gradient */}
      <mesh scale={[-1, 1, -1]}>
        <sphereGeometry args={[450, 32, 16]} />
        <meshBasicMaterial
          color={0x030B1E}
          side={THREE.BackSide}
          fog={false}
        />
      </mesh>
    </>
  )
}
