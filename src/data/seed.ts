/**
 * Seed data — all K8s entities for the v1.0 world.
 * Hex codes live here as the explicit exception to the "no literals" rule.
 */
import { color } from '@/theme'

export type Health = 'ready' | 'pending' | 'failed'

export interface Namespace {
  id: string
  name: string
  center: [number, number]  // (x, z) — y is always 0
  radius: 6 | 8
  hue: string               // from DESIGN_SYSTEM §1
  ingress: boolean
}

export interface Deployment {
  id: string
  namespaceId: string
  name: string
  replicas: number
}

export interface Pod {
  id: string
  deploymentId: string
  namespaceId: string
  slot: number
  health: Health
  createdAt: number
}

export interface Bridge {
  a: string
  b: string
  traffic: number     // 0..1
  errorRate: number   // 0..1
}

export interface EventLog {
  id: string
  t: number
  verb: 'ADDED' | 'MODIFIED' | 'DELETED' | 'WARN' | 'ERROR'
  namespace: string
  target?: string
  message: string
}

export interface Service {
  id: string
  name: string
  namespace: string
  kind: string
  clusterIP: string
  type: string
  ports: string[]
}

export interface ConfigMap {
  id: string
  name: string
  namespace: string
  kind: string
  dataKeys: string[]
}

export interface Secret {
  id: string
  name: string
  namespace: string
  kind: string
  type: string
}

export interface Job {
  id: string
  name: string
  namespace: string
  kind: string
  status: string
  completions: number
}

export interface CronJob {
  id: string
  name: string
  namespace: string
  kind: string
  schedule: string
  lastRun: number
}

export interface Node {
  name: string
  ready: boolean
  roles: string[]
}

// ─── Namespaces ───────────────────────────────────────────────────────────────
// Centers aligned to hex-ring layout (RING_GAP=22) slots 0-4
// so dynamic namespaces at slots 5+ never overlap.
export const NAMESPACES: Namespace[] = [
  { id: 'core',         name: 'CORE',          center: [0, 0],          radius: 8, hue: color.cyan,   ingress: true  },
  { id: 'web',          name: 'WEB',           center: [19.1, 11.0],    radius: 8, hue: color.cyan2,  ingress: true  },
  { id: 'data',         name: 'DATA',          center: [0, 22],         radius: 6, hue: color.amber,  ingress: false },
  { id: 'payments',     name: 'PAYMENTS',      center: [-19.1, 11.0],   radius: 8, hue: color.red,    ingress: false },
  { id: 'observability',name: 'OBSERVABILITY', center: [-19.1, -11.0],  radius: 6, hue: color.obs,    ingress: false },
]

// ─── Bridges (connectivity per WORLD_DESIGN seed table) ──────────────────────
export const BRIDGES: Bridge[] = [
  { a: 'core', b: 'web',          traffic: 0.72, errorRate: 0.01 },
  { a: 'core', b: 'data',         traffic: 0.45, errorRate: 0.02 },
  { a: 'core', b: 'payments',     traffic: 0.60, errorRate: 0.03 },
  { a: 'web',  b: 'payments',     traffic: 0.38, errorRate: 0.01 },
  { a: 'core', b: 'observability',traffic: 0.25, errorRate: 0.00 },
]

// ─── Deployments ─────────────────────────────────────────────────────────────
export const DEPLOYMENTS: Deployment[] = [
  { id: 'core-dep0',         namespaceId: 'core',          name: 'api-gateway',    replicas: 4 },
  { id: 'web-dep0',          namespaceId: 'web',           name: 'frontend',       replicas: 5 },
  { id: 'web-dep1',          namespaceId: 'web',           name: 'cdn-proxy',      replicas: 3 },
  { id: 'data-dep0',         namespaceId: 'data',          name: 'postgres',       replicas: 3 },
  { id: 'payments-dep0',     namespaceId: 'payments',      name: 'payment-svc',    replicas: 4 },
  { id: 'payments-dep1',     namespaceId: 'payments',      name: 'fraud-detect',   replicas: 3 },
  { id: 'observability-dep0',namespaceId: 'observability', name: 'prometheus',     replicas: 2 },
]

// ─── Pods (85% ready / 10% pending / 5% failed) ──────────────────────────────
// Deterministic seed — same result every boot so tests are stable.
function seedHealth(depIdx: number, podIdx: number): Health {
  const val = ((depIdx * 7 + podIdx * 13) % 100)
  if (val < 85) return 'ready'
  if (val < 95) return 'pending'
  return 'failed'
}

export const PODS: Pod[] = DEPLOYMENTS.flatMap((dep, di) =>
  Array.from({ length: dep.replicas }, (_, pi) => ({
    id:           `${dep.id}-pod${pi}`,
    deploymentId: dep.id,
    namespaceId:  dep.namespaceId,
    slot:         pi,
    health:       seedHealth(di, pi),
    createdAt:    Date.now() - (di * 3600 + pi * 300) * 1000,
  }))
)

// ─── Seed events ─────────────────────────────────────────────────────────────
export const SEED_EVENTS: EventLog[] = [
  { id: 'e0', t: Date.now() - 60000,  verb: 'ADDED',    namespace: 'core',    message: 'pod api-gateway-pod3 scheduled' },
  { id: 'e1', t: Date.now() - 45000,  verb: 'MODIFIED', namespace: 'web',     message: 'deployment frontend scaled 4 → 5' },
  { id: 'e2', t: Date.now() - 32000,  verb: 'WARN',     namespace: 'payments',message: 'pod fraud-detect-pod1 restart count 3' },
  { id: 'e3', t: Date.now() - 18000,  verb: 'ADDED',    namespace: 'data',    message: 'configmap postgres-config-v2 applied' },
  { id: 'e4', t: Date.now() - 9000,   verb: 'ERROR',    namespace: 'payments',message: 'pod fraud-detect-pod2 CrashLoopBackOff' },
  { id: 'e5', t: Date.now() - 4000,   verb: 'MODIFIED', namespace: 'core',    message: 'hpa api-gateway adjusted replicas' },
]
