
/**
 * Ground-plane cursor ring.
 * Small ring under mouse on open ground, expands to island radius when hovering a namespace.
 * Pulsing opacity on island hover.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '@/state/store'
import { NAMESPACES } from '@/data/seed'
import { hex } from '@/theme'

export function Cursor() {
  const ringRef = useRef<THREE.Mesh>(null)
  const matRef  = useRef<THREE.MeshBasicMaterial>(null)

  const hoveredNs  = useStore(s => s.hoveredNs)
  const selectedNs = useStore(s => s.selectedNs)

  useFrame(({ clock, raycaster, camera }) => {
    const t = clock.getElapsedTime()
    const ring = ringRef.current
    const mat  = matRef.current
    if (!ring || !mat) return

    // Ground projection via stored raycaster (updated by RTSCamera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit   = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, hit)

    if (hoveredNs) {
      const ns = NAMESPACES.find(n => n.id === hoveredNs)
      if (ns) {
        ring.position.set(ns.center[0], 0.02, ns.center[1])
        ring.scale.setScalar(ns.radius * 0.95)
        const nsHex = parseInt(ns.hue.replace('#', ''), 16)
        mat.color.setHex(nsHex)
        mat.opacity = 0.4 + 0.3 * Math.sin(t * 3)
      }
    } else {
      if (hit.x !== undefined) ring.position.set(hit.x, 0.02, hit.z)
      ring.scale.setScalar(1)
      mat.color.setHex(hex.cyan)
      mat.opacity = 0.55 + 0.25 * Math.sin(t * 4)
    }
  })

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.0, 1.15, 48]} />
      <meshBasicMaterial
        ref={matRef}
        color={hex.cyan}
        side={THREE.DoubleSide}
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </mesh>
  )
}
