
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Suspense } from 'react'
import { useStore } from '@/state/store'
import { Environment } from './Environment'
import { Island } from './Island'
import { Bridge } from './Bridge'
import { Mothership } from './Mothership'
import { Pods } from './Pods'
import { RTSCamera } from './RTSCamera'
import { Cursor } from './Cursor'
import { Post } from './Post'
import { Starfield } from './Starfield'
import { MockStream } from '@/data/MockStream'
import { RemoteStream } from '@/net/RemoteStream'
import { hex } from '@/theme'

const USE_REMOTE = Boolean(import.meta.env.VITE_ENGINE_URL)

function WorldContent() {
  const namespaces = useStore(s => s.namespaces)
  const bridges    = useStore(s => s.bridges)

  return (
    <>
      <color attach="background" args={[hex.bg]} />
      <fogExp2 attach="fog" args={[hex.bg, 0.003]} />

      <RTSCamera />
      <Environment />
      <Starfield />

      {namespaces.map(ns => (
        <Island key={ns.id} ns={ns} />
      ))}

      {bridges.map(br => (
        <Bridge key={`${br.a}-${br.b}`} bridge={br} />
      ))}

      {namespaces.filter(ns => ns.ingress).map(ns => (
        <Mothership key={ns.id} ns={ns} />
      ))}

      <Pods />
      <Cursor />
      <Post />
      {USE_REMOTE ? <RemoteStream /> : <MockStream />}
    </>
  )
}

export function Scene() {
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%' }}
      camera={{ fov: 50, position: [36, 28, 36], near: 0.1, far: 2000 }}
      dpr={[1, 1.8]}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
      onPointerMissed={() => useStore.getState().setSelectedNs(null)}
    >
      <Suspense fallback={null}>
        <WorldContent />
      </Suspense>
    </Canvas>
  )
}
