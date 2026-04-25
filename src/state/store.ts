/**
 * Global Zustand store — every HUD panel and every 3D prop reads from here.
 * No prop drilling past one level. Zustand 5 pattern: create<T>()(...).
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import {
  type Health, type Namespace, type Deployment, type Pod,
  type Bridge, type EventLog,
  type Service, type ConfigMap, type Secret, type Job, type CronJob, type Node,
  NAMESPACES, DEPLOYMENTS, PODS, BRIDGES, SEED_EVENTS,
} from '@/data/seed'
import { slotToCenter } from '@/world/layout'

// ─── Re-export types so consumers import from one place ───────────────────────
export type { Health, Namespace, Deployment, Pod, Bridge, EventLog, Service, ConfigMap, Secret, Job, CronJob, Node }

// Snapshot shape for WS wire protocol
export interface WorldStateSnapshot {
  namespaces:  Namespace[]
  deployments: Deployment[]
  pods:        Pod[]
  bridges:     Bridge[]
  services?:   Service[]
  configMaps?: ConfigMap[]
  secrets?:    Secret[]
  jobs?:       Job[]
  cronJobs?:   CronJob[]
  nodes?:      Node[]
  clusterName?: string
}

// ─── Tweaks ───────────────────────────────────────────────────────────────────
export interface Tweaks {
  bloomIntensity: number
  bloomThreshold: number
  bloomSmoothing: number
  chromaticAberration: number
  vignetteDarkness: number
  fov: number
  dpr: number
  circuitAnim: boolean
  beamFlicker: boolean
  oceanOpacity: number
}

const DEFAULT_TWEAKS: Tweaks = {
  bloomIntensity: 0.6,
  bloomThreshold: 0.9,
  bloomSmoothing: 0.3,
  chromaticAberration: 0.0008,
  vignetteDarkness: 0.5,
  fov: 50,
  dpr: 1.8,
  circuitAnim: true,
  beamFlicker: true,
  oceanOpacity: 1.0,
}

// ─── Camera rig state ─────────────────────────────────────────────────────────
export interface CamRig {
  targetX: number
  targetZ: number
  distance: number
  yaw: number
  pitch: number
  cinematic: boolean
}

// ─── Store shape ──────────────────────────────────────────────────────────────
interface KubeState {
  // World data
  namespaces: Namespace[]
  deployments: Deployment[]
  pods: Pod[]
  bridges: Bridge[]
  services: Service[]
  configMaps: ConfigMap[]
  secrets: Secret[]
  jobs: Job[]
  cronJobs: CronJob[]
  nodes: Node[]
  clusterName: string
  events: EventLog[]

  // Dynamic namespace lifecycle
  removingNs: Set<string>   // ids currently playing despawn animation
  nextNsSlot: number        // monotonic slot counter for layout algorithm

  // Camera
  cam: CamRig
  hoveredNs: string | null
  selectedNs: string | null

  // HUD
  tweaks: Tweaks
  showTweaks: boolean
  engineStatus: 'connecting' | 'connected' | 'reconnecting' | 'offline' | null

  // Actions
  createPod: (deploymentId?: string) => void
  deletePod: (id: string) => void
  updatePodHealth: (id: string, health: Health) => void
  scaleDeployment: (id: string, delta: number) => void
  pushEvent: (e: Omit<EventLog, 'id' | 't'>) => void
  emitMockEvent: (overrides?: Partial<EventLog>) => void
  addNamespace: (id: string, name: string, hue: string, ingress?: boolean) => void
  removeNamespace: (id: string) => void
  setCam: (patch: Partial<CamRig>) => void
  setHoveredNs: (id: string | null) => void
  setSelectedNs: (id: string | null) => void
  setTweaks: (patch: Partial<Tweaks>) => void
  toggleTweaks: () => void
  setBridgeTraffic: (a: string, b: string, traffic: number, errorRate: number) => void
}

// ─── Verb weights for mock events ────────────────────────────────────────────
const VERB_WEIGHTS: Array<[EventLog['verb'], number]> = [
  ['ADDED',    35],
  ['MODIFIED', 40],
  ['DELETED',  10],
  ['WARN',     10],
  ['ERROR',     5],
]

function pickVerb(): EventLog['verb'] {
  const total = VERB_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [verb, weight] of VERB_WEIGHTS) {
    r -= weight
    if (r <= 0) return verb
  }
  return 'ADDED'
}

const MESSAGES: Record<EventLog['verb'], ((ns: string) => string)[]> = {
  ADDED:    [
    ns => `pod ${ns}-${uid()} scheduled`,
    ns => `svc ${ns}-api endpoints updated`,
    ns => `configmap ${ns}-config-v${1 + Math.floor(Math.random() * 9)} applied`,
  ],
  MODIFIED: [
    ns => `deployment ${ns} scaled ${2 + Math.floor(Math.random() * 3)} → ${3 + Math.floor(Math.random() * 4)}`,
    ns => `hpa ${ns}-web adjusted replicas`,
    ns => `pod ${ns}-${uid()} restarted (cpu throttled)`,
  ],
  DELETED:  [
    ns => `pod ${ns}-${uid()} terminated (complete)`,
    ns => `job ${ns}-batch-${uid()} finished`,
  ],
  WARN:     [
    () => `node-${1 + Math.floor(Math.random() * 8)} memory 87% threshold`,
    ns => `pod ${ns}-${uid()} restart count 3`,
  ],
  ERROR:    [
    ns => `pod ${ns}-${uid()} CrashLoopBackOff`,
    ns => `readiness probe failed ${ns}-${uid()}`,
    ns => `OOMKilled ${ns}-${uid()}`,
  ],
}

let _eid = 100
function uid() { return Math.random().toString(36).slice(2, 7) }
function nextId() { return `e${_eid++}` }

// ─── Create store ─────────────────────────────────────────────────────────────
export const useStore = create<KubeState>()(
  subscribeWithSelector((set, get) => ({
    namespaces:  NAMESPACES,
    deployments: DEPLOYMENTS,
    pods:        [...PODS],
    bridges:     [...BRIDGES],
    services:    [],
    configMaps:  [],
    secrets:     [],
    jobs:        [],
    cronJobs:    [],
    nodes:       [],
    clusterName: '',
    events:      [...SEED_EVENTS].reverse(), // newest first

    removingNs: new Set<string>(),
    nextNsSlot: NAMESPACES.length,

    cam: {
      targetX: 0, targetZ: 0,
      distance: 42,
      yaw: Math.PI * 0.25,
      pitch: -0.75,
      cinematic: false,
    },
    hoveredNs:  null,
    selectedNs: null,

    tweaks:        { ...DEFAULT_TWEAKS },
    showTweaks:    false,
    engineStatus:  null,

    // ── Pod actions ──────────────────────────────────────────────────────────
    createPod(deploymentId) {
      const { deployments, pods } = get()
      const dep = deploymentId
        ? deployments.find(d => d.id === deploymentId)
        : deployments[Math.floor(Math.random() * deployments.length)]
      if (!dep) return
      const newPod: Pod = {
        id: `${dep.id}-pod${uid()}`,
        deploymentId: dep.id,
        namespaceId: dep.namespaceId,
        slot: pods.filter(p => p.deploymentId === dep.id).length,
        health: 'pending',
        createdAt: Date.now(),
      }
      set({ pods: [...pods, newPod] })
    },

    deletePod(id) {
      set(s => ({ pods: s.pods.filter(p => p.id !== id) }))
    },

    updatePodHealth(id, health) {
      set(s => ({
        pods: s.pods.map(p => p.id === id ? { ...p, health } : p),
      }))
    },

    scaleDeployment(id, delta) {
      const { pods, deployments } = get()
      const dep = deployments.find(d => d.id === id)
      if (!dep) return
      if (delta > 0) {
        // add pods
        const newPods = Array.from({ length: delta }, (_, i) => ({
          id: `${dep.id}-pod${uid()}`,
          deploymentId: dep.id,
          namespaceId: dep.namespaceId,
          slot: pods.filter(p => p.deploymentId === dep.id).length + i,
          health: 'pending' as Health,
          createdAt: Date.now(),
        }))
        set({ pods: [...pods, ...newPods] })
      } else {
        // remove pods
        const depPods = pods.filter(p => p.deploymentId === dep.id)
        const toRemove = depPods.slice(delta).map(p => p.id)
        set({ pods: pods.filter(p => !toRemove.includes(p.id)) })
      }
    },

    // ── Events ────────────────────────────────────────────────────────────────
    pushEvent(e) {
      const entry: EventLog = { ...e, id: nextId(), t: Date.now() }
      set(s => {
        const events = [entry, ...s.events]
        if (events.length > 200) events.splice(200)
        return { events }
      })
    },

    emitMockEvent(overrides) {
      const { namespaces } = get()
      const ns = namespaces[Math.floor(Math.random() * namespaces.length)]
      const verb = overrides?.verb ?? pickVerb()
      const msgs = MESSAGES[verb]
      const message = overrides?.message ?? msgs[Math.floor(Math.random() * msgs.length)](ns.id)
      get().pushEvent({ verb, namespace: overrides?.namespace ?? ns.id, message })
    },

    // ── Namespace lifecycle ───────────────────────────────────────────────────
    addNamespace(id, name, hue, ingress = false) {
      // Find first slot whose center is at least 15 units from every existing island
      const existing = get().namespaces
      let slot = get().nextNsSlot
      while (true) {
        const [cx, cz] = slotToCenter(slot)
        const tooClose = existing.some(n =>
          Math.hypot(n.center[0] - cx, n.center[1] - cz) < 15
        )
        if (!tooClose) break
        slot++
      }
      const [x, z] = slotToCenter(slot)
      const ns: Namespace = { id, name, center: [x, z], radius: 6, hue, ingress }
      set(s => ({
        namespaces: [...s.namespaces, ns],
        nextNsSlot: slot + 1,
      }))

      // Seed one deployment with a few pods so the island isn't empty
      const depId = `${id}-dep0`
      const replicas = 2 + Math.floor(Math.random() * 3)
      const newDep: Deployment = { id: depId, namespaceId: id, name: `${name.toLowerCase()}-svc`, replicas }
      const newPods: Pod[] = Array.from({ length: replicas }, (_, i) => ({
        id: `${depId}-pod${i}`,
        deploymentId: depId,
        namespaceId: id,
        slot: i,
        health: i === 0 ? 'pending' : 'ready',
        createdAt: Date.now(),
      }))
      set(s => ({
        deployments: [...s.deployments, newDep],
        pods: [...s.pods, ...newPods],
      }))

      // Auto-bridge to 1-2 nearest existing namespaces
      const neighbors = get().namespaces.filter(n => n.id !== id)
      const byDist = neighbors
        .map(n => ({
          n,
          d: Math.hypot(n.center[0] - x, n.center[1] - z),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, Math.random() < 0.5 ? 1 : 2)

      const newBridges: Bridge[] = byDist.map(({ n }) => ({
        a: n.id,
        b: id,
        traffic: 0.2 + Math.random() * 0.5,
        errorRate: Math.random() < 0.15 ? 0.04 : 0.01,
      }))
      if (newBridges.length) {
        set(s => ({ bridges: [...s.bridges, ...newBridges] }))
      }

      get().pushEvent({ verb: 'ADDED', namespace: id, message: `namespace ${name} provisioned` })
    },

    removeNamespace(id) {
      // Mark as removing — Island plays exit animation, then calls back after delay
      set(s => ({ removingNs: new Set([...s.removingNs, id]) }))
      get().pushEvent({ verb: 'DELETED', namespace: id, message: `namespace ${id} decommissioned` })
      // After 1.5s (animation budget), purge from state
      setTimeout(() => {
        set(s => {
          const removingNs = new Set(s.removingNs)
          removingNs.delete(id)
          return {
            namespaces:  s.namespaces.filter(ns => ns.id !== id),
            deployments: s.deployments.filter(d => d.namespaceId !== id),
            pods:        s.pods.filter(p => p.namespaceId !== id),
            bridges:     s.bridges.filter(br => br.a !== id && br.b !== id),
            selectedNs:  s.selectedNs === id ? null : s.selectedNs,
            hoveredNs:   s.hoveredNs  === id ? null : s.hoveredNs,
            removingNs,
          }
        })
      }, 1500)
    },

    // ── Camera ────────────────────────────────────────────────────────────────
    setCam(patch) { set(s => ({ cam: { ...s.cam, ...patch } })) },
    setHoveredNs(id) { set({ hoveredNs: id }) },
    setSelectedNs(id) { set({ selectedNs: id }) },

    // ── Tweaks ────────────────────────────────────────────────────────────────
    setTweaks(patch) { set(s => ({ tweaks: { ...s.tweaks, ...patch } })) },
    toggleTweaks() { set(s => ({ showTweaks: !s.showTweaks })) },

    // ── Bridges ───────────────────────────────────────────────────────────────
    setBridgeTraffic(a, b, traffic, errorRate) {
      set(s => ({
        bridges: s.bridges.map(br =>
          (br.a === a && br.b === b) || (br.a === b && br.b === a)
            ? { ...br, traffic, errorRate }
            : br
        ),
      }))
    },
  }))
)

// Expose store on window for dev console access
if (typeof window !== 'undefined') {
  // @ts-expect-error dev helper
  window.__store = useStore
}
