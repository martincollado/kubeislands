
/**
 * Global InstancedMesh for all pods.
 * One draw call for up to 2000 pod slabs across all islands.
 * Pod positions are computed from namespace center + rack ring + slot index.
 * Colors: ready=cyan, pending=amber, failed=red.
 * Uses store namespaces (supports dynamic add/remove).
 */

import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, type Namespace } from '@/state/store'
import { hex } from '@/theme'

const CAPACITY = 2000

const COLOR_MAP: Record<string, THREE.Color> = {
  ready:   new THREE.Color(hex.cyan),
  pending: new THREE.Color(hex.amber),
  failed:  new THREE.Color(hex.red),
}

function getRackPositions(ns: Namespace, totalRacks: number): Array<{ x: number; z: number; angle: number }> {
  const ringR = ns.radius * 0.55
  return Array.from({ length: totalRacks }, (_, i) => {
    const angle = (i / totalRacks) * Math.PI * 2
    return {
      x: ns.center[0] + ringR * Math.cos(angle),
      z: ns.center[1] + ringR * Math.sin(angle),
      angle,
    }
  })
}

export function Pods() {
  const meshRef   = useRef<THREE.InstancedMesh>(null)
  const dummy     = useMemo(() => new THREE.Object3D(), [])
  const colorBuf  = useRef<Float32Array>(new Float32Array(CAPACITY * 3))
  const pulseRef  = useRef(0)

  const pods        = useStore(s => s.pods)
  const namespaces  = useStore(s => s.namespaces)
  const deployments = useStore(s => s.deployments)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const identity = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < CAPACITY; i++) mesh.setMatrixAt(i, identity)

    // Build rack positions per namespace from store state
    const racksByNs: Record<string, Array<{ x: number; z: number; angle: number }>> = {}
    for (const ns of namespaces) {
      const deps = deployments.filter(d => d.namespaceId === ns.id)
      const totalRacks = Math.max(deps.reduce((s, d) => s + Math.ceil(d.replicas / 4), 0), 3)
      racksByNs[ns.id] = getRackPositions(ns, totalRacks)
    }

    let idx = 0
    const cursorByNs: Record<string, number> = {}
    for (const ns of namespaces) cursorByNs[ns.id] = 0

    for (const pod of pods) {
      if (idx >= CAPACITY) break
      const racks = racksByNs[pod.namespaceId]
      if (!racks || racks.length === 0) continue

      const cursor = cursorByNs[pod.namespaceId]
      const rack   = racks[cursor % racks.length]
      const slotInRack = Math.floor(cursor / racks.length) % 4
      cursorByNs[pod.namespaceId]++

      const outwardX = Math.sin(rack.angle)
      const outwardZ = Math.cos(rack.angle)

      dummy.position.set(
        rack.x + outwardX * 0.26,
        0.68 + slotInRack * 0.36 - 0.04,
        rack.z + outwardZ * 0.26,
      )
      dummy.rotation.set(0, rack.angle, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(idx, dummy.matrix)

      const col = COLOR_MAP[pod.health] ?? COLOR_MAP.ready
      col.toArray(colorBuf.current, idx * 3)

      idx++
    }

    mesh.count = idx
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pods, namespaces, deployments, dummy])

  // Pulse emissive intensity for visual activity
  useFrame(({ clock }) => {
    pulseRef.current = clock.getElapsedTime()
    const mesh = meshRef.current
    if (mesh?.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.4 + Math.sin(pulseRef.current * 2.5) * 0.15
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, CAPACITY]}
      castShadow
    >
      <boxGeometry args={[0.26, 0.08, 0.26]} />
      <meshStandardMaterial
        metalness={0.3}
        roughness={0.35}
        vertexColors
        emissive={new THREE.Color(0xffffff)}
        emissiveIntensity={0.5}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
