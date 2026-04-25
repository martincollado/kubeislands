
import { useMemo } from 'react'
import { useStore } from '@/state/store'

export function NamespaceCard() {
  const selectedNs  = useStore(s => s.selectedNs)
  const namespaces  = useStore(s => s.namespaces)
  const pods        = useStore(s => s.pods)
  const deployments = useStore(s => s.deployments)
  const bridges     = useStore(s => s.bridges)
  const allServices  = useStore(s => s.services)
  const allConfigMaps = useStore(s => s.configMaps)
  const allSecrets   = useStore(s => s.secrets)
  const allJobs      = useStore(s => s.jobs)
  const allCronJobs  = useStore(s => s.cronJobs)
  const engineStatus = useStore(s => s.engineStatus)

  if (!selectedNs) return null

  const ns = namespaces.find(n => n.id === selectedNs)
  if (!ns) return null

  const nsPods    = pods.filter(p => p.namespaceId === selectedNs)
  const deps      = deployments.filter(d => d.namespaceId === selectedNs)
  const ready     = nsPods.filter(p => p.health === 'ready').length
  const pending   = nsPods.filter(p => p.health === 'pending').length
  const failed    = nsPods.filter(p => p.health === 'failed').length
  const connCount = bridges.filter(b => b.a === selectedNs || b.b === selectedNs).length

  // Use real K8s counts when engine is connected; fall back to 0 in dev/mock mode
  const liveData = engineStatus === 'connected'
  const svcCount  = liveData ? allServices.filter(s => s.namespace === selectedNs).length  : deps.length + 1
  const cmCount   = liveData ? allConfigMaps.filter(c => c.namespace === selectedNs).length : 1
  const secCount  = liveData ? allSecrets.filter(s => s.namespace === selectedNs).length    : 1
  const jobCount  = liveData ? allJobs.filter(j => j.namespace === selectedNs).length       : 0
  const cronCount = liveData ? allCronJobs.filter(c => c.namespace === selectedNs).length   : 0

  const totalReplicas = deps.reduce((s, d) => s + d.replicas, 0)

  return (
    <div
      className="panel"
      style={{
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        minWidth: 480,
        pointerEvents: 'auto',
        animation: 'nsCardIn 220ms cubic-bezier(.2,.6,.2,1)',
      }}
    >
      <style>{`
        @keyframes nsCardIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" style={{ background: ns.hue, boxShadow: `0 0 6px ${ns.hue}` }} />
          <span style={{ fontFamily: 'Orbitron, system-ui', fontSize: 13, letterSpacing: '0.2em', color: ns.hue }}>
            {ns.name}
          </span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--ink-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
          {ns.ingress ? '⬡ INGRESS' : '⬡ INTERNAL'} · {connCount} link{connCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Pod health bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--ink-dim)', marginBottom: 4, letterSpacing: '0.1em',
        }}>
          <span>PODS</span>
          <span>{ready} ready · {pending > 0 ? `${pending} pending · ` : ''}{failed > 0 ? `${failed} failed` : '0 failed'}</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          {nsPods.length > 0 && (
            <div style={{
              display: 'flex', height: '100%',
            }}>
              <div style={{ flex: ready,   background: 'var(--cyan)',  transition: 'flex 0.4s' }} />
              <div style={{ flex: pending, background: 'var(--amber)', transition: 'flex 0.4s' }} />
              <div style={{ flex: failed,  background: 'var(--red)',   transition: 'flex 0.4s' }} />
            </div>
          )}
        </div>
      </div>

      {/* Deployments list */}
      {deps.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
            color: 'var(--ink-dim)', letterSpacing: '0.1em', marginBottom: 4,
          }}>
            DEPLOYMENTS · {totalReplicas} replicas total
          </div>
          {deps.map(d => {
            const dPods    = nsPods.filter(p => p.deploymentId === d.id)
            const dReady   = dPods.filter(p => p.health === 'ready').length
            const dFailed  = dPods.filter(p => p.health === 'failed').length
            return (
              <div key={d.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <span style={{ color: 'var(--ink)' }}>{d.name}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--ink-dim)' }}>{d.replicas}×</span>
                  <span style={{ color: dFailed > 0 ? 'var(--red)' : dReady === d.replicas ? 'var(--cyan)' : 'var(--amber)' }}>
                    {dReady}/{d.replicas}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* K8s resource grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 6, marginBottom: 2,
      }}>
        {([
          { label: 'SERVICES',   value: svcCount,  color: 'var(--cyan)'  },
          { label: 'CONFIGMAPS', value: cmCount,   color: 'var(--ink)'   },
          { label: 'SECRETS',    value: secCount,  color: 'var(--amber)' },
          { label: 'JOBS',       value: jobCount,  color: 'var(--ink)'   },
          { label: 'CRONJOBS',   value: cronCount, color: 'var(--obs)'   },
        ] as const).map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            padding: '6px 4px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 18, fontFamily: 'Rajdhani, system-ui', fontWeight: 600,
              color, lineHeight: 1,
            }}>{value}</div>
            <div style={{
              fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--ink-faint)', letterSpacing: '0.08em',
              marginTop: 2, textTransform: 'uppercase',
            }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
