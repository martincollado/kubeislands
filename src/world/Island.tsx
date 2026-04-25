
/**
 * HexIsland — renders one namespace platform with:
 * - Hex deck (ExtrudeGeometry) + circuit-shader inlay
 * - Skirt, trim ring, 6 corner pylons (no caps — emissive baked into chassis)
 * - Core column + LOD-gated hologram label (hidden when far & not active)
 * - Simplified server racks (chassis + 2 light-bars + beacon)
 */

import { useRef, useMemo, Suspense } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useSpring, animated } from '@react-spring/three'
import * as THREE from 'three'
import { useStore } from '@/state/store'
import { type Namespace } from '@/data/seed'
import { hex, fontUrl } from '@/theme'
import { IslandResources } from './IslandResources'

// ─── Circuit shader for deck surface ─────────────────────────────────────────
const CIRCUIT_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const CIRCUIT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uR;
  uniform float uAnim;
  varying vec2  vPos;

  float hexSdf(vec2 p, float r) {
    p = abs(p);
    float c = max(p.x * 0.866025 + p.y * 0.5, p.y);
    return c - r * 0.9;
  }

  void main() {
    if (hexSdf(vPos, uR) > 0.0) discard;

    vec2 q = vPos * 0.55;
    float g1 = step(0.47, abs(fract(q.x + q.y * 0.57735) - 0.5));
    float g2 = step(0.47, abs(fract(q.x - q.y * 0.57735) - 0.5));
    float g3 = step(0.47, abs(fract(q.y) - 0.5));
    float grid = max(max(g1, g2), g3);

    float r = length(vPos);
    float t = uTime * uAnim;
    float pulse = sin(r * 1.2 - t * 2.0) * 0.5 + 0.5;
    float core  = 1.0 - smoothstep(0.0, 1.8, r);

    vec3 col = uColor * (0.3 * grid + 0.55 * pulse * grid + 0.85 * core);
    float fade = 1.0 - smoothstep(uR * 0.82, uR * 0.97, r);
    float a = (0.3 + 0.5 * grid + core * 0.4) * fade;

    gl_FragColor = vec4(col, a);
  }
`

// ─── Build hex shape ──────────────────────────────────────────────────────────
function makeHexShape(R: number): THREE.Shape {
  const s = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6
    const x = R * Math.cos(a)
    const y = R * Math.sin(a)
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

// ─── Rack ─────────────────────────────────────────────────────────────────────
// Simplified: chassis + 2 light-bars + top beacon. Was 7 meshes, now 4. The
// side vent slits and half the light-bars were pure decoration.
function Rack({ index, total, ringR, nsHue }: {
  index: number
  total: number
  ringR: number
  nsHue: number
}) {
  const angle = (index / total) * Math.PI * 2
  const rx = ringR * Math.cos(angle)
  const rz = ringR * Math.sin(angle)

  return (
    <group position={[rx, 0, rz]} rotation={[0, Math.atan2(rx, rz), 0]}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[0.8, 1.6, 0.5]} />
        <meshStandardMaterial
          color={hex.chassisMid}
          metalness={0.75}
          roughness={0.3}
          envMapIntensity={0.8}
        />
      </mesh>

      {/* Face slot light-bars — 2 emissive strips (was 4) */}
      {[0.9, 1.3].map((y, k) => (
        <mesh key={k} position={[0, y, 0.251]}>
          <boxGeometry args={[0.7, 0.04, 0.01]} />
          <meshStandardMaterial
            color={nsHue}
            emissive={new THREE.Color(nsHue)}
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Top beacon */}
      <mesh position={[0, 1.68, 0]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial
          color={nsHue}
          emissive={new THREE.Color(nsHue)}
          emissiveIntensity={2.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// ─── Core column ──────────────────────────────────────────────────────────────
function CoreColumn({ ns }: { ns: Namespace }) {
  const colRef   = useRef<THREE.Group>(null)
  const labelRef = useRef<THREE.Group>(null)
  const hueNum = parseInt(ns.hue.replace('#', ''), 16)

  useFrame((_, dt) => {
    if (colRef.current) colRef.current.rotation.y += 0.04 * dt
    // LOD: hide labels when camera is far unless this ns is hovered/selected.
    // Reading from store inside useFrame avoids per-hover rerenders of every Island.
    if (labelRef.current) {
      const s = useStore.getState()
      const close = s.cam.distance < 38
      const active = s.selectedNs === ns.id || s.hoveredNs === ns.id
      labelRef.current.visible = close || active
    }
  })

  return (
    <group ref={colRef}>
      {/* Base disc */}
      <mesh position={[0, 0.13, 0]} castShadow>
        <cylinderGeometry args={[1.4, 1.4, 0.25, 12]} />
        <meshStandardMaterial
          color={hex.chassisMid}
          metalness={0.7}
          roughness={0.35}
          envMapIntensity={0.9}
        />
      </mesh>

      {/* Column */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 1.5, 16]} />
        <meshStandardMaterial
          color={hex.chassis}
          metalness={0.75}
          roughness={0.3}
          envMapIntensity={0.9}
          emissive={new THREE.Color(hueNum)}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Cyan ring trims — emissive for bloom */}
      {[0.6, 1.55].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.15, 0.05, 8, 32]} />
          <meshStandardMaterial
            color={hueNum}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={2.0}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Top cap */}
      <mesh position={[0, 1.86, 0]}>
        <cylinderGeometry args={[1.2, 1.1, 0.12, 16]} />
        <meshStandardMaterial color={hex.chassisMid} metalness={0.7} roughness={0.25} />
      </mesh>

      {/* Ingress termination cone */}
      {ns.ingress && (
        <mesh position={[0, 1.95, 0]}>
          <coneGeometry args={[0.4, 0.2, 16, 1, true]} />
          <meshStandardMaterial
            color={hueNum}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={2.0}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Hologram labels — gated by LOD: hidden when far & not active. */}
      <group ref={labelRef}>
        <Suspense fallback={null}>
          <Text
            position={[0, 2.4, 0]}
            font={fontUrl.orbitronBold}
            fontSize={0.35}
            color={ns.hue}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.005}
            outlineColor={ns.hue}
          >
            {`NAMESPACE · ${ns.name}`}
          </Text>
          <Text
            position={[0, 2.05, 0]}
            font={fontUrl.jetbrainsMono}
            fontSize={0.18}
            color="#8AA6C4"
            anchorX="center"
            anchorY="middle"
          >
            {`DECK-${String(0).padStart(2, '0')}`}
          </Text>
        </Suspense>
      </group>
    </group>
  )
}

// ─── HexIsland ────────────────────────────────────────────────────────────────
export function Island({ ns }: { ns: Namespace }) {
  const inlayRef    = useRef<THREE.ShaderMaterial>(null)
  const circuitAnim = useStore(s => s.tweaks.circuitAnim)
  const selectedNs  = useStore(s => s.selectedNs)
  const isRemoving  = useStore(s => s.removingNs.has(ns.id))
  // Subscribe to the stable array ref, filter in memo — avoids infinite loop from selector returning new array
  const allDeps   = useStore(s => s.deployments)
  const storeDeps = useMemo(() => allDeps.filter(d => d.namespaceId === ns.id), [allDeps, ns.id])

  // Spawn: rise from -5 below ocean; Despawn: sink back down.
  // posX/posZ track ns.center — when the engine re-lays out the grid based
  // on bridge topology, islands glide to their new position instead of teleporting.
  const { posY, scale, posX, posZ } = useSpring({
    posY:  isRemoving ? -5 : 0,
    scale: isRemoving ? 0 : 1,
    posX:  ns.center[0],
    posZ:  ns.center[1],
    from:  { posY: -5, scale: 0, posX: ns.center[0], posZ: ns.center[1] },
    config: isRemoving
      ? { tension: 180, friction: 28 }  // sink fast
      : { tension: 80, friction: 22 },   // smooth rise + slide
  })

  const hueNum = useMemo(() => parseInt(ns.hue.replace('#', ''), 16), [ns.hue])
  const R = ns.radius

  const deckGeo = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(makeHexShape(R), {
      depth: 0.6,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 1,
    })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [R])

  const skirtGeo = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(makeHexShape(R + 0.8), {
      depth: 0.25,
      bevelEnabled: false,
    })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [R])

  const inlayGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(R * 2, R * 2, 1, 1)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [R])

  const ringPts = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const a = (i * Math.PI) / 3 + Math.PI / 6
      return new THREE.Vector3(R * Math.cos(a), 0, R * Math.sin(a))
    }),
  [R])

  const pylonPositions = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3 + Math.PI / 6
      return [R * Math.cos(a), 0, R * Math.sin(a)] as [number, number, number]
    }),
  [R])

  const totalRacks = useMemo(() => {
    const n = storeDeps.reduce((sum, d) => sum + Math.ceil(d.replicas / 4), 0)
    return Math.max(n, 3)
  }, [storeDeps])
  const ringR = R * 0.55

  const circuitUniforms = useMemo(() => ({
    uTime:  { value: 0 },
    uColor: { value: new THREE.Color(hueNum) },
    uR:     { value: R },
    uAnim:  { value: circuitAnim ? 1.0 : 0.0 },
  }), [hueNum, R, circuitAnim])

  useFrame(({ clock }) => {
    if (inlayRef.current) {
      inlayRef.current.uniforms.uTime.value = clock.getElapsedTime()
      inlayRef.current.uniforms.uAnim.value = circuitAnim ? 1.0 : 0.0
    }
  })

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    useStore.getState().setSelectedNs(ns.id)
  }

  function handlePointerOver(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    useStore.getState().setHoveredNs(ns.id)
  }

  function handlePointerOut() {
    useStore.getState().setHoveredNs(null)
  }

  const isSelected = selectedNs === ns.id

  return (
    <animated.group position-x={posX} position-y={posY} position-z={posZ} scale={scale}>
      {/* Deck — PBR metal */}
      <mesh
        geometry={deckGeo}
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial
          color={hex.chassis}
          metalness={0.75}
          roughness={0.35}
          envMapIntensity={0.9}
        />
      </mesh>

      {/* Skirt */}
      <mesh geometry={skirtGeo} position={[0, -0.35, 0]}>
        <meshStandardMaterial
          color={hex.chassisLo}
          metalness={0.5}
          roughness={0.65}
          emissive={new THREE.Color(hueNum)}
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* Trim ring */}
      <line>
        <bufferGeometry setFromPoints={ringPts} />
        <lineBasicMaterial color={hueNum} linewidth={1.5} />
      </line>

      {/* Selection highlight ring */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[R * 0.98, R * 1.04, 48]} />
          <meshBasicMaterial
            color={hueNum}
            transparent
            opacity={0.8}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Corner pylons — single mesh each with emissive cap merged onto top face
          via emissive material. Dropped the separate cap box (6 meshes saved). */}
      {pylonPositions.map(([px, , pz], i) => (
        <mesh key={i} position={[px, 0.65, pz]} castShadow>
          <boxGeometry args={[0.5, 1.3, 0.5]} />
          <meshStandardMaterial
            color={hex.chassisMid}
            metalness={0.7}
            roughness={0.35}
            envMapIntensity={0.8}
            emissive={new THREE.Color(hueNum)}
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}

      {/* Runway lights & access ramp dock removed — pure decoration with no
          info content, ~19 meshes per island eliminated. The trim ring line
          and pylon emissive already communicate the island perimeter. */}

      {/* Circuit inlay */}
      <mesh geometry={inlayGeo} position={[0, 0.31, 0]}>
        <shaderMaterial
          ref={inlayRef}
          uniforms={circuitUniforms}
          vertexShader={CIRCUIT_VERT}
          fragmentShader={CIRCUIT_FRAG}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Core column */}
      <CoreColumn ns={ns} />

      {/* Server racks */}
      {Array.from({ length: totalRacks }, (_, i) => (
        <Rack key={i} index={i} total={totalRacks} ringR={ringR} nsHue={hueNum} />
      ))}

      {/* K8s resource objects — pods, services, configmaps, secrets, jobs, cronjobs */}
      <IslandResources ns={ns} />

      {/* Ingress shockwave ring */}
      {ns.ingress && <ShockwaveRing hueNum={hueNum} R={R} />}

      {/* Red point-light if any pod in this ns is failed */}
      <FailedLight nsId={ns.id} />
    </animated.group>
  )
}

function FailedLight({ nsId }: { nsId: string }) {
  const hasFailed = useStore(s => s.pods.some(p => p.namespaceId === nsId && p.health === 'failed'))
  if (!hasFailed) return null
  return <pointLight color={0xff3355} intensity={2.0} distance={12} decay={2} position={[0, -0.8, 0]} />
}

// Expanding shockwave ring for ingress namespaces
function ShockwaveRing({ hueNum, R }: { hueNum: number; R: number }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  // eslint-disable-next-line react-hooks/purity
  const t = useRef(Math.random() * 4) // stagger phase — useRef only uses initial value once

  useFrame((_, dt) => {
    t.current += dt * 0.5
    const cycle = (t.current % 4) / 4  // 0..1 every 8s
    if (ringRef.current && matRef.current) {
      const s = 0.5 + cycle * (R * 0.25)
      ringRef.current.scale.setScalar(s)
      matRef.current.opacity = (1 - cycle) * 0.6
    }
  })

  return (
    <mesh ref={ringRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[R * 0.9, R * 1.05, 48]} />
      <meshBasicMaterial
        ref={matRef}
        color={hueNum}
        transparent
        depthWrite={false}
        opacity={0.5}
      />
    </mesh>
  )
}
