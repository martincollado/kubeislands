
/**
 * Mothership — hovering above ingress namespaces.
 * Orbits at r=2 (0.08 rad/s), self-rotates (0.12 rad/s).
 * Ingress beam: additive cone from mothership down to island core.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { type Namespace } from '@/data/seed'
import { useStore } from '@/state/store'
import { hex } from '@/theme'

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uFlicker;
  varying vec2  vUv;

  void main() {
    float vert  = pow(vUv.y, 1.6) * 0.9;
    float flick = uFlicker > 0.5
      ? (0.9 + 0.1 * sin(uTime * 47.0))
      : 1.0;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.5);

    // Spiral swirl pattern
    float swirl = sin(vUv.x * 12.0 + uTime * 3.0 + vUv.y * 8.0) * 0.08;

    float edge  = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float alpha = vert * flick * pulse * (edge + swirl);
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`

const MOTHERSHIP_Y = 22
const BEAM_HEIGHT  = MOTHERSHIP_Y - 2.55

export function Mothership({ ns }: { ns: Namespace }) {
  const groupRef   = useRef<THREE.Group>(null)
  const beamMeshRef = useRef<THREE.Mesh>(null)
  const beamRef    = useRef<THREE.ShaderMaterial>(null)

  const hasFailed   = useStore(s => s.pods.some(p => p.namespaceId === ns.id && p.health === 'failed'))
  const beamFlicker = useStore(s => s.tweaks.beamFlicker)

  const hueNum = useMemo(() => parseInt(ns.hue.replace('#', ''), 16), [ns.hue])
  const beamColor = useMemo(() => hasFailed
    ? new THREE.Color(hex.red)
    : new THREE.Color(hueNum),
  [hasFailed, hueNum])

  const beamUniforms = useMemo(() => ({
    uTime:    { value: 0 },
    uColor:   { value: beamColor.clone() },
    uFlicker: { value: beamFlicker ? 1.0 : 0.0 },
  }), [beamColor, beamFlicker])

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.12 * dt
      groupRef.current.position.x = ns.center[0] + Math.cos(t * 0.08) * 2
      groupRef.current.position.z = ns.center[1] + Math.sin(t * 0.08) * 2
      groupRef.current.position.y = MOTHERSHIP_Y + Math.sin(t * 0.4) * 0.5
      // Beam tracks ship XZ so it always hangs directly below
      if (beamMeshRef.current) {
        beamMeshRef.current.position.x = groupRef.current.position.x
        beamMeshRef.current.position.z = groupRef.current.position.z
      }
    }
    if (beamRef.current) {
      beamRef.current.uniforms.uTime.value    = t
      beamRef.current.uniforms.uFlicker.value = beamFlicker ? 1.0 : 0.0
      beamRef.current.uniforms.uColor.value   = beamColor
    }
  })

  return (
    <>
      {/* Mothership hull */}
      <group ref={groupRef} position={[ns.center[0], MOTHERSHIP_Y, ns.center[1]]}>
        {/* Hull top disc — PBR */}
        <mesh rotation={[0, Math.PI / 6, 0]} castShadow>
          <cylinderGeometry args={[3, 3, 0.8, 8]} />
          <meshStandardMaterial
            color={hex.chassisMid}
            metalness={0.85}
            roughness={0.2}
            envMapIntensity={1.1}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={0.18}
          />
        </mesh>

        {/* Hull bottom cone */}
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[1.4, 2.4, 0.6, 8]} />
          <meshStandardMaterial
            color={hex.chassis}
            metalness={0.8}
            roughness={0.3}
            envMapIntensity={1.0}
          />
        </mesh>

        {/* Rim ring — emissive */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[3, 0.09, 8, 48]} />
          <meshStandardMaterial
            color={hueNum}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>

        {/* Underside ring-light */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.95, 0]}>
          <torusGeometry args={[2, 0.07, 6, 48]} />
          <meshStandardMaterial
            color={hueNum}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={1.8}
            transparent
            opacity={0.95}
            toneMapped={false}
          />
        </mesh>

        {/* Emitter cone pointing down */}
        <mesh position={[0, -1.2, 0]} rotation={[Math.PI, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.9, 0.4, 16]} />
          <meshStandardMaterial
            color={hueNum}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={2.5}
            toneMapped={false}
          />
        </mesh>

        {/* Point-light underneath for local illumination */}
        <pointLight
          color={hueNum}
          intensity={hasFailed ? 3.0 : 1.5}
          distance={25}
          decay={2}
          position={[0, -2, 0]}
        />
      </group>

      {/* Ingress beam — XZ tracked via beamMeshRef in useFrame */}
      <mesh
        ref={beamMeshRef}
        position={[ns.center[0], 2.55 + BEAM_HEIGHT / 2, ns.center[1]]}
      >
        <cylinderGeometry args={[0.2, 0.9, BEAM_HEIGHT, 16, 1, true]} />
        <shaderMaterial
          ref={beamRef}
          uniforms={beamUniforms}
          vertexShader={BEAM_VERT}
          fragmentShader={BEAM_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  )
}
