/**
 * K8s resource towers on each island.
 *
 * Design: one glowing pillar per resource type arranged at the island rim,
 * each with a floating count badge and label. Click → store sets selectedResource
 * → HUD shows a ResourcePanel with details.
 *
 * Selector rule: always subscribe to the stable array from the store, then
 * filter with useMemo — never call .filter() inside a useStore selector.
 */

import { useRef, useMemo, useState, Suspense } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useSpring, animated } from '@react-spring/three'
import * as THREE from 'three'
import { useStore } from '@/state/store'
import { type Namespace } from '@/data/seed'
import { color, hex, fontUrl } from '@/theme'

// ─── Deterministic mock counts ────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function mockCount(nsId: string, seed: number, min: number, max: number): number {
  return min + (hashStr(nsId + seed) % (max - min + 1))
}

// ─── Resource type metadata ───────────────────────────────────────────────────
interface ResourceType {
  key: string
  label: string
  color: string
  shape: 'pod' | 'service' | 'configmap' | 'secret' | 'job' | 'cronjob'
}

const RESOURCE_TYPES: ResourceType[] = [
  { key: 'pods',       label: 'PODS',       color: color.cyan,  shape: 'pod'      },
  { key: 'services',   label: 'SERVICES',   color: '#7C5CBF', shape: 'service'  },
  { key: 'configmaps', label: 'CONFIGMAPS', color: '#4A90D9', shape: 'configmap'},
  { key: 'secrets',    label: 'SECRETS',    color: color.amber, shape: 'secret'   },
  { key: 'jobs',       label: 'JOBS',       color: '#4CAF50', shape: 'job'      },
  { key: 'cronjobs',   label: 'CRONJOBS',   color: '#E91E8C', shape: 'cronjob'  },
]

// ─── Mini shape rendered atop each tower ─────────────────────────────────────
function TowerShape({ shape, color, time }: { shape: ResourceType['shape']; color: string; time: number }) {
  const c = useMemo(() => new THREE.Color(color), [color])

  if (shape === 'pod') return (
    <mesh>
      <sphereGeometry args={[0.18, 10, 10]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={2.0} toneMapped={false} />
    </mesh>
  )

  if (shape === 'service') return (
    <mesh rotation={[0, time * 0.8, 0]}>
      <octahedronGeometry args={[0.2, 0]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.8} metalness={0.4} roughness={0.3} toneMapped={false} />
    </mesh>
  )

  if (shape === 'configmap') return (
    <mesh rotation={[0.3, time * 0.3, 0]}>
      <boxGeometry args={[0.28, 0.06, 0.22]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.6} toneMapped={false} />
    </mesh>
  )

  if (shape === 'secret') return (
    <mesh>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color="#0D0D1A" metalness={0.95} roughness={0.1} envMapIntensity={1.2} />
    </mesh>
  )

  if (shape === 'job') return (
    <mesh rotation={[0, time * 1.1, 0]}>
      <cylinderGeometry args={[0.18, 0.18, 0.1, 8]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.6} toneMapped={false} />
    </mesh>
  )

  // cronjob
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.2, 0.2, 0.04, 16]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.6} metalness={0.4} toneMapped={false} />
    </mesh>
  )
}

// ─── Single resource tower ────────────────────────────────────────────────────
function ResourceTower({
  rt, count, pos, nsId, hovered, onClick,
}: {
  rt: ResourceType
  count: number
  pos: [number, number, number]
  nsId: string
  hovered: boolean
  onClick: (e: ThreeEvent<MouseEvent>) => void
}) {
  const pillarRef = useRef<THREE.Mesh>(null)
  const matRef    = useRef<THREE.MeshStandardMaterial>(null)
  const labelRef  = useRef<THREE.Group>(null)
  const timeRef   = useRef(0)

  const c = useMemo(() => new THREE.Color(rt.color), [rt.color])

  // Pillar height scales with count (capped)
  const pillarH = Math.min(0.18 + count * 0.12, 1.6)

  const { scale } = useSpring({
    scale: hovered ? 1.18 : 1.0,
    config: { tension: 300, friction: 20 },
  })

  useFrame(({ clock }) => {
    timeRef.current = clock.getElapsedTime()
    if (matRef.current) {
      matRef.current.emissiveIntensity = hovered
        ? 2.5 + Math.sin(timeRef.current * 4) * 0.5
        : 1.2 + Math.sin(timeRef.current * 1.8 + pos[0]) * 0.3
    }
    // LOD for tower labels: hide when far, unless ns is near or tower hovered.
    if (labelRef.current) {
      const st = useStore.getState()
      const close = st.cam.distance < 28
      const active = hovered || st.selectedNs === nsId || st.hoveredNs === nsId
      labelRef.current.visible = close || active
    }
  })

  return (
    <animated.group
      position={pos}
      scale={scale}
      onClick={onClick}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      {/* Pillar base — dark platform */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.12, 8]} />
        <meshStandardMaterial color={hex.chassisMid} metalness={0.8} roughness={0.3} envMapIntensity={1.0} />
      </mesh>

      {/* Pillar column — emissive, height = count. The outer glow cylinder and
          count-badge sphere were removed: both were pure eye-candy with no info
          value (the pillar's height already encodes count, and the Text number
          is rendered without needing a sphere backdrop). Saves 2 meshes/tower
          × 6 towers × N islands. */}
      <mesh ref={pillarRef} position={[0, 0.12 + pillarH / 2, 0]}>
        <cylinderGeometry args={[0.1, 0.12, pillarH, 8]} />
        <meshStandardMaterial
          ref={matRef}
          color={c}
          emissive={c}
          emissiveIntensity={1.2}
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </mesh>

      {/* Shape icon on top */}
      <group position={[0, 0.12 + pillarH + 0.25, 0]}>
        {/* eslint-disable-next-line react-hooks/refs */}
        <TowerShape shape={rt.shape} color={rt.color} time={timeRef.current} />
      </group>

      {/* Labels — gated by LOD. Hidden at distance unless the owning ns is
          hovered/selected or this tower itself is hovered. */}
      <group ref={labelRef}>
        <Suspense fallback={null}>
          <Text
            position={[0, 0.12 + pillarH + 0.62, 0]}
            font={fontUrl.orbitronBold}
            fontSize={0.15}
            color={rt.color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.005}
            outlineColor="#000"
            renderOrder={10}
          >
            {String(count)}
          </Text>
          <Text
            position={[0, -0.04, 0]}
            font={fontUrl.jetbrainsMono}
            fontSize={0.085}
            color={hovered ? rt.color : '#6A8FAF'}
            anchorX="center"
            anchorY="top"
            renderOrder={10}
          >
            {rt.label}
          </Text>
        </Suspense>
      </group>
    </animated.group>
  )
}

// ─── Tooltip panel (HTML-like, rendered in 3D) ────────────────────────────────
function ResourceTooltip({ rt, count, pos }: { rt: ResourceType; count: number; pos: [number, number, number] }) {
  const c = useMemo(() => new THREE.Color(rt.color), [rt.color])
  const panelY = pos[1] + 2.8

  const detail = useMemo(() => {
    if (rt.shape === 'pod') return `${count} pod replica${count !== 1 ? 's' : ''} running`
    if (rt.shape === 'service') return `${count} network endpoint${count !== 1 ? 's' : ''}`
    if (rt.shape === 'configmap') return `${count} config key set${count !== 1 ? 's' : ''}`
    if (rt.shape === 'secret') return `${count} encrypted secret${count !== 1 ? 's' : ''}`
    if (rt.shape === 'job') return `${count} batch job${count !== 1 ? 's' : ''}`
    return `${count} scheduled job${count !== 1 ? 's' : ''}`
  }, [rt, count])

  return (
    <group position={[pos[0], panelY, pos[2]]}>
      {/* Background panel */}
      <mesh>
        <boxGeometry args={[1.8, 0.55, 0.02]} />
        <meshStandardMaterial color={hex.chassis} metalness={0.6} roughness={0.4} opacity={0.95} transparent />
      </mesh>
      {/* Border */}
      <mesh position={[0, 0, 0.011]}>
        <boxGeometry args={[1.82, 0.57, 0.004]} />
        <meshBasicMaterial color={c} transparent opacity={0.6} />
      </mesh>
      <Suspense fallback={null}>
        <Text
          position={[0, 0.1, 0.02]}
          font={fontUrl.orbitronBold}
          fontSize={0.13}
          color={rt.color}
          anchorX="center"
          anchorY="middle"
          renderOrder={20}
        >
          {rt.label}
        </Text>
        <Text
          position={[0, -0.1, 0.02]}
          font={fontUrl.jetbrainsMono}
          fontSize={0.1}
          color="#8AA6C4"
          anchorX="center"
          anchorY="middle"
          renderOrder={20}
        >
          {detail}
        </Text>
      </Suspense>
      {/* Connector line down */}
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[0.015, 0.7, 0.015]} />
        <meshBasicMaterial color={rt.color} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function IslandResources({ ns }: { ns: Namespace }) {
  const allPods       = useStore(s => s.pods)
  const allServices   = useStore(s => s.services)
  const allConfigMaps = useStore(s => s.configMaps)
  const allSecrets    = useStore(s => s.secrets)
  const allJobs       = useStore(s => s.jobs)
  const allCronJobs   = useStore(s => s.cronJobs)
  const engineStatus  = useStore(s => s.engineStatus)

  const pods = useMemo(() => allPods.filter(p => p.namespaceId === ns.id), [allPods, ns.id])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const R = ns.radius

  // Resource counts — pods live; rest from engine when connected, else mock
  const liveData = engineStatus === 'connected'
  const counts = useMemo<Record<string, number>>(() => ({
    pods:       pods.length,
    services:   liveData ? allServices.filter(s => s.namespace === ns.id).length   : mockCount(ns.id, 1, 1, 3),
    configmaps: liveData ? allConfigMaps.filter(c => c.namespace === ns.id).length : mockCount(ns.id, 2, 1, 4),
    secrets:    liveData ? allSecrets.filter(s => s.namespace === ns.id).length    : mockCount(ns.id, 3, 1, 3),
    jobs:       liveData ? allJobs.filter(j => j.namespace === ns.id).length       : mockCount(ns.id, 4, 0, 2),
    cronjobs:   liveData ? allCronJobs.filter(c => c.namespace === ns.id).length   : mockCount(ns.id, 5, 0, 2),
  }), [pods.length, ns.id, liveData, allServices, allConfigMaps, allSecrets, allJobs, allCronJobs])

  // Place towers evenly around the island at ~65% radius, above deck
  const towerPositions = useMemo<[number, number, number][]>(() => {
    const n = RESOURCE_TYPES.length
    const r = R * 0.62
    return RESOURCE_TYPES.map((_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / n
      return [Math.cos(a) * r, 0.62, Math.sin(a) * r]
    })
  }, [R])

  function handleTowerClick(e: ThreeEvent<MouseEvent>, key: string) {
    e.stopPropagation()
    setSelectedKey(prev => prev === key ? null : key)
  }

  const selectedRt = selectedKey ? RESOURCE_TYPES.find(r => r.key === selectedKey) : null
  const selectedIdx = selectedKey ? RESOURCE_TYPES.findIndex(r => r.key === selectedKey) : -1

  return (
    <group>
      {RESOURCE_TYPES.map((rt, i) => (
        <ResourceTower
          key={rt.key}
          rt={rt}
          count={counts[rt.key]}
          pos={towerPositions[i]}
          nsId={ns.id}
          hovered={selectedKey === rt.key}
          onClick={e => handleTowerClick(e, rt.key)}
        />
      ))}

      {selectedRt && selectedIdx >= 0 && (
        <ResourceTooltip
          rt={selectedRt}
          count={counts[selectedRt.key]}
          pos={towerPositions[selectedIdx]}
        />
      )}
    </group>
  )
}
