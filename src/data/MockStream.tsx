
/**
 * Mock event stream — runs inside the R3F Canvas via useFrame.
 * Emits one event every 1.2–2.8 s (random interval).
 * Also randomly creates/deletes pods, spikes bridge error rates,
 * and spawns/despawns entire namespaces every ~45s.
 * Paused when tab is hidden.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '@/state/store'
import { color } from '@/theme'

const MIN_INTERVAL = 1.2
const MAX_INTERVAL = 2.8

// Namespace templates for dynamic spawning
const NS_TEMPLATES = [
  { name: 'STAGING',     hue: color.cyan2,  ingress: false },
  { name: 'CACHE',       hue: color.amber,  ingress: false },
  { name: 'MONITORING',  hue: color.obs,    ingress: false },
  { name: 'WORKERS',     hue: color.cyan,   ingress: false },
  { name: 'BATCH',       hue: color.amber,  ingress: false },
  { name: 'ML-SERVING',  hue: color.obs,    ingress: true  },
  { name: 'SEARCH',      hue: color.cyan2,  ingress: false },
  { name: 'AUTH',        hue: color.red,    ingress: false },
]

function randomInterval() {
  return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
}

let _dynNsCounter = 0

export function MockStream() {
  // useRef initial values are only consumed once — random calls here are intentional
  /* eslint-disable react-hooks/purity */
  const nextEvent     = useRef(randomInterval())
  const nextPod       = useRef(6)
  const nextDelete    = useRef(10)
  const nextBridge    = useRef(14)
  const nextNsSpawn   = useRef(30 + Math.random() * 20)   // 30-50s first spawn
  const nextNsDespawn = useRef(60 + Math.random() * 30)   // 60-90s first despawn
  /* eslint-enable react-hooks/purity */

  useFrame((_, dt) => {
    if (document.visibilityState === 'hidden') return

    nextEvent.current   -= dt
    nextPod.current     -= dt
    nextDelete.current  -= dt
    nextBridge.current  -= dt
    nextNsSpawn.current  -= dt
    nextNsDespawn.current -= dt

    const state = useStore.getState()

    // Emit random event
    if (nextEvent.current <= 0) {
      state.emitMockEvent()
      nextEvent.current = randomInterval()
    }

    // Create a pod (30% chance every ~6s)
    if (nextPod.current <= 0) {
      if (Math.random() < 0.3) state.createPod()
      nextPod.current = 5 + Math.random() * 4
    }

    // Delete a random pod (15% chance every ~10s)
    if (nextDelete.current <= 0) {
      if (Math.random() < 0.15) {
        const pods = state.pods
        if (pods.length > 10) {
          const victim = pods[Math.floor(Math.random() * pods.length)]
          state.deletePod(victim.id)
        }
      }
      nextDelete.current = 8 + Math.random() * 6
    }

    // Spike a bridge error rate for 4s (10% chance every ~14s)
    if (nextBridge.current <= 0) {
      if (Math.random() < 0.1) {
        const bridges = state.bridges
        const br = bridges[Math.floor(Math.random() * bridges.length)]
        state.setBridgeTraffic(br.a, br.b, br.traffic, 0.08)
        setTimeout(() => {
          useStore.getState().setBridgeTraffic(br.a, br.b, br.traffic, 0.01)
        }, 4000)
      }
      nextBridge.current = 12 + Math.random() * 6
    }

    // Spawn a new namespace (cap at 9 total)
    if (nextNsSpawn.current <= 0) {
      const { namespaces, removingNs } = state
      const active = namespaces.filter(ns => !removingNs.has(ns.id))
      if (active.length < 9) {
        const tpl = NS_TEMPLATES[_dynNsCounter % NS_TEMPLATES.length]
        const id = `dyn-${tpl.name.toLowerCase()}-${_dynNsCounter}`
        _dynNsCounter++
        state.addNamespace(id, tpl.name, tpl.hue, tpl.ingress)
      }
      nextNsSpawn.current = 35 + Math.random() * 25
    }

    // Despawn a dynamic namespace (never touch seed namespaces)
    if (nextNsDespawn.current <= 0) {
      const { namespaces, removingNs } = state
      const dynamic = namespaces.filter(ns =>
        ns.id.startsWith('dyn-') && !removingNs.has(ns.id)
      )
      if (dynamic.length > 0) {
        const victim = dynamic[Math.floor(Math.random() * dynamic.length)]
        state.removeNamespace(victim.id)
      }
      nextNsDespawn.current = 45 + Math.random() * 30
    }
  })

  return null
}
