// Dispatcher — applies server messages (snapshot / diff ops / events) to Zustand store.
import { useStore } from '@/state/store'
import type { ServerMsg, Op } from './WorldSocket'
import type { Namespace, Deployment, Pod, Bridge, EventLog, Service, ConfigMap, Secret, Job, CronJob, Node } from '@/data/seed'

export function dispatch(msg: ServerMsg) {
  const store = useStore.getState()

  switch (msg.kind) {
    case 'snapshot': {
      if (!msg.state) return
      const s = msg.state
      useStore.setState({
        namespaces:  s.namespaces  ?? [],
        deployments: s.deployments ?? [],
        pods:        s.pods        ?? [],
        bridges:     s.bridges     ?? [],
        services:    s.services    ?? [],
        configMaps:  s.configMaps  ?? [],
        secrets:     s.secrets     ?? [],
        jobs:        s.jobs        ?? [],
        cronJobs:    s.cronJobs    ?? [],
        nodes:       s.nodes       ?? [],
        ...(s.clusterName ? { clusterName: s.clusterName } : {}),
      })
      break
    }

    case 'diff': {
      if (!msg.ops?.length) return
      for (const op of msg.ops) applyOp(op)
      break
    }

    case 'event': {
      if (!msg.event) return
      store.pushEvent({
        verb:      msg.event.verb as EventLog['verb'],
        namespace: msg.event.namespace,
        message:   msg.event.message,
        target:    msg.event.target,
      })
      break
    }

    case 'ping':
      // no-op — connection keepalive
      break

    case 'error':
      console.error('[engine]', msg.code, msg.msg)
      break
  }
}

function applyOp(op: Op) {
  const s = useStore.getState()

  switch (op.op) {
    case 'add': {
      if (op.path === 'namespaces') {
        const ns = op.value as Namespace
        useStore.setState(cur => ({ namespaces: [...cur.namespaces, ns] }))
      } else if (op.path === 'deployments') {
        const dep = op.value as Deployment
        useStore.setState(cur => ({ deployments: [...cur.deployments, dep] }))
      } else if (op.path === 'pods') {
        const pod = op.value as Pod
        useStore.setState(cur => ({ pods: [...cur.pods, pod] }))
      } else if (op.path === 'bridges') {
        const br = op.value as Bridge
        useStore.setState(cur => ({ bridges: [...cur.bridges, br] }))
      } else if (op.path === 'services') {
        const svc = op.value as Service
        useStore.setState(cur => ({ services: [...cur.services.filter(s => s.id !== svc.id), svc] }))
      } else if (op.path === 'configMaps') {
        const cm = op.value as ConfigMap
        useStore.setState(cur => ({ configMaps: [...cur.configMaps.filter(c => c.id !== cm.id), cm] }))
      } else if (op.path === 'secrets') {
        const sec = op.value as Secret
        useStore.setState(cur => ({ secrets: [...cur.secrets.filter(s => s.id !== sec.id), sec] }))
      } else if (op.path === 'jobs') {
        const job = op.value as Job
        useStore.setState(cur => ({ jobs: [...cur.jobs.filter(j => j.id !== job.id), job] }))
      } else if (op.path === 'cronJobs') {
        const cj = op.value as CronJob
        useStore.setState(cur => ({ cronJobs: [...cur.cronJobs.filter(c => c.id !== cj.id), cj] }))
      } else if (op.path === 'nodes') {
        const node = op.value as Node
        useStore.setState(cur => ({ nodes: [...cur.nodes.filter(n => n.name !== node.name), node] }))
      }
      break
    }

    case 'remove': {
      const [collection, id] = op.path.split('/')
      if (!id) return
      if (collection === 'namespaces') {
        useStore.setState(cur => ({
          namespaces:  cur.namespaces.filter(n => n.id !== id),
          pods:        cur.pods.filter(p => p.namespaceId !== id),
          deployments: cur.deployments.filter(d => d.namespaceId !== id),
          bridges:     cur.bridges.filter(b => b.a !== id && b.b !== id),
          services:    cur.services.filter(s => s.namespace !== id),
          configMaps:  cur.configMaps.filter(c => c.namespace !== id),
          secrets:     cur.secrets.filter(s => s.namespace !== id),
          jobs:        cur.jobs.filter(j => j.namespace !== id),
          cronJobs:    cur.cronJobs.filter(c => c.namespace !== id),
          selectedNs:  cur.selectedNs === id ? null : cur.selectedNs,
          hoveredNs:   cur.hoveredNs  === id ? null : cur.hoveredNs,
        }))
      } else if (collection === 'pods') {
        useStore.setState(cur => ({ pods: cur.pods.filter(p => p.id !== id) }))
      } else if (collection === 'deployments') {
        useStore.setState(cur => ({ deployments: cur.deployments.filter(d => d.id !== id) }))
      } else if (collection === 'bridges') {
        const [a, b] = id.split(':')
        useStore.setState(cur => ({
          bridges: cur.bridges.filter(br => !(br.a === a && br.b === b) && !(br.a === b && br.b === a))
        }))
      } else if (collection === 'services') {
        useStore.setState(cur => ({ services: cur.services.filter(s => s.id !== id) }))
      } else if (collection === 'configMaps') {
        useStore.setState(cur => ({ configMaps: cur.configMaps.filter(c => c.id !== id) }))
      } else if (collection === 'secrets') {
        useStore.setState(cur => ({ secrets: cur.secrets.filter(s => s.id !== id) }))
      } else if (collection === 'jobs') {
        useStore.setState(cur => ({ jobs: cur.jobs.filter(j => j.id !== id) }))
      } else if (collection === 'cronJobs') {
        useStore.setState(cur => ({ cronJobs: cur.cronJobs.filter(c => c.id !== id) }))
      } else if (collection === 'nodes') {
        useStore.setState(cur => ({ nodes: cur.nodes.filter(n => n.name !== id) }))
      }
      break
    }

    case 'patch': {
      const [collection, id] = op.path.split('/')
      if (!id) return
      const patch = op.patch as Record<string, unknown>
      if (collection === 'namespaces') {
        useStore.setState(cur => ({
          namespaces: cur.namespaces.map(n => n.id === id ? { ...n, ...patch } : n)
        }))
      } else if (collection === 'pods') {
        useStore.setState(cur => ({
          pods: cur.pods.map(p => p.id === id ? { ...p, ...patch } : p)
        }))
      } else if (collection === 'deployments') {
        useStore.setState(cur => ({
          deployments: cur.deployments.map(d => d.id === id ? { ...d, ...patch } : d)
        }))
      } else if (collection === 'bridges') {
        const [a, b] = id.split(':')
        useStore.setState(cur => ({
          bridges: cur.bridges.map(br =>
            (br.a === a && br.b === b) || (br.a === b && br.b === a)
              ? { ...br, ...patch }
              : br
          )
        }))
      } else if (collection === 'services') {
        useStore.setState(cur => ({
          services: cur.services.map(s => s.id === id ? { ...s, ...patch } : s)
        }))
      } else if (collection === 'configMaps') {
        useStore.setState(cur => ({
          configMaps: cur.configMaps.map(c => c.id === id ? { ...c, ...patch } : c)
        }))
      } else if (collection === 'secrets') {
        useStore.setState(cur => ({
          secrets: cur.secrets.map(s => s.id === id ? { ...s, ...patch } : s)
        }))
      } else if (collection === 'jobs') {
        useStore.setState(cur => ({
          jobs: cur.jobs.map(j => j.id === id ? { ...j, ...patch } : j)
        }))
      } else if (collection === 'cronJobs') {
        useStore.setState(cur => ({
          cronJobs: cur.cronJobs.map(c => c.id === id ? { ...c, ...patch } : c)
        }))
      } else if (collection === 'nodes') {
        useStore.setState(cur => ({
          nodes: cur.nodes.map(n => n.name === id ? { ...n, ...patch } : n)
        }))
      }
      break
    }
  }
}
