
/**
 * Bridge between two namespace islands.
 * Span deck (PBR box) + two emissive rails + animated pulse track (shader).
 * Pulse color: cyan (healthy), red (errorRate > 0.05), amber (traffic > 0.8).
 *
 * Pulse UV fix: the plane lives inside a group rotated to bridge angle (Y-axis),
 * then the plane is just rotated -90° on X to lie flat. This ensures UV.y always
 * runs along the bridge length — no more diagonal artifacts.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { type Bridge as BridgeData } from '@/data/seed'
import { useStore } from '@/state/store'
import { hex } from '@/theme'

const PULSE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const PULSE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3  uColor;
  varying vec2  vUv;

  void main() {
    // vUv.y now goes 0→1 from island A to island B (correct after rotation fix)
    float t = fract(vUv.y - uTime * uSpeed * 0.18);

    // Sharp packet with bright head and fading tail
    float head = smoothstep(0.0, 0.04, t);
    float tail = 1.0 - smoothstep(0.04, 0.22, t);
    float packet = head * tail;

    // Width vignette — fade at edges
    float edge = 1.0 - smoothstep(0.3, 0.5, abs(vUv.x - 0.5));

    // Multiple staggered packets
    float t2 = fract(vUv.y - uTime * uSpeed * 0.18 + 0.33);
    float p2 = smoothstep(0.0, 0.04, t2) * (1.0 - smoothstep(0.04, 0.22, t2)) * 0.6;
    float t3 = fract(vUv.y - uTime * uSpeed * 0.18 + 0.66);
    float p3 = smoothstep(0.0, 0.04, t3) * (1.0 - smoothstep(0.04, 0.22, t3)) * 0.4;

    float brightness = (packet + p2 + p3) * edge;
    gl_FragColor = vec4(uColor * 1.8, brightness * 1.2);
  }
`

export function Bridge({ bridge }: { bridge: BridgeData }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const namespaces = useStore(s => s.namespaces)

  const nsA = useMemo(() => namespaces.find(n => n.id === bridge.a), [namespaces, bridge.a])
  const nsB = useMemo(() => namespaces.find(n => n.id === bridge.b), [namespaces, bridge.b])

  if (!nsA || !nsB) return null

  const { mid, length, angle } = useMemo(() => {
    const A = new THREE.Vector3(nsA.center[0], 0, nsA.center[1])
    const B = new THREE.Vector3(nsB.center[0], 0, nsB.center[1])
    const dir = new THREE.Vector3().subVectors(B, A)
    const fullLen = dir.length()
    // Trim ends so bridge meets the island edge (factor ~0.92 = just inside rim)
    const L = Math.max(1, fullLen - (nsA.radius + nsB.radius) * 0.92)
    const midPt = new THREE.Vector3().lerpVectors(A, B, 0.5)
    const a = Math.atan2(dir.x, dir.z)
    return { mid: midPt, length: L, angle: a }
  }, [nsA, nsB])

  const pulseColor = useMemo(() => {
    if (bridge.errorRate > 0.05) return new THREE.Color(hex.red)
    if (bridge.traffic > 0.8)    return new THREE.Color(hex.amber)
    return new THREE.Color(hex.cyan)
  }, [bridge.errorRate, bridge.traffic])

  const railColor = bridge.errorRate > 0.05
    ? new THREE.Color(hex.red)
    : new THREE.Color(hex.cyan)

  const uniforms = useMemo(() => ({
    uTime:  { value: 0 },
    uSpeed: { value: bridge.traffic },
    uColor: { value: pulseColor.clone() },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    if (!matRef.current) return
    matRef.current.uniforms.uTime.value  = clock.getElapsedTime()
    matRef.current.uniforms.uSpeed.value = bridge.traffic
    matRef.current.uniforms.uColor.value.copy(pulseColor)
  })

  const strutCount = Math.max(2, Math.floor(length / 4))
  const strutPositions = useMemo(() => {
    const A = new THREE.Vector3(nsA.center[0], 0, nsA.center[1])
    const B = new THREE.Vector3(nsB.center[0], 0, nsB.center[1])
    const dir = new THREE.Vector3().subVectors(B, A).normalize()
    const start = A.clone().addScaledVector(dir, nsA.radius * 0.92)
    return Array.from({ length: strutCount - 1 }, (_, i) => {
      const t = (i + 1) / strutCount
      return start.clone().addScaledVector(dir, t * length)
    })
  }, [nsA, nsB, length, strutCount])

  return (
    // Master group: rotate to bridge angle around Y — everything inside aligns automatically
    <group position={[mid.x, 0, mid.z]} rotation={[0, angle, 0]}>
      {/* Span deck — PBR metal, length along local Z */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.14, length]} />
        <meshStandardMaterial
          color={hex.chassisMid}
          metalness={0.8}
          roughness={0.3}
          envMapIntensity={1.0}
        />
      </mesh>

      {/* Side rails — perpendicular offset on X, run along Z */}
      {[-0.58, 0.58].map((ox, i) => (
        <mesh key={i} position={[ox, 0.52, 0]}>
          <boxGeometry args={[0.05, 0.38, length]} />
          <meshStandardMaterial
            color={railColor}
            emissive={railColor}
            emissiveIntensity={bridge.errorRate > 0.05 ? 2.2 : 1.4}
            transparent opacity={0.92}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Pulse track — UV.y runs along Z (bridge length) thanks to group rotation */}
      <mesh position={[0, 0.37, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.55, length, 1, 16]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={PULSE_VERT}
          fragmentShader={PULSE_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Underside glow strip */}
      <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, length]} />
        <meshBasicMaterial
          color={railColor}
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
