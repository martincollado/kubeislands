
import { useEffect, useState } from 'react'
import { useStore } from '@/state/store'

// Uptime starts from first page load as a stand-in until the engine sends real cluster uptime.
const BOOT_TIME = Date.now()

function useUptime() {
  const [uptime, setUptime] = useState('')
  useEffect(() => {
    function tick() {
      const s = Math.floor((Date.now() - BOOT_TIME) / 1000)
      const d = Math.floor(s / 86400)
      const h = Math.floor((s % 86400) / 3600)
      const m = Math.floor((s % 3600) / 60)
      const ss = s % 60
      setUptime(`${d}d ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return uptime
}

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL as string | undefined

const STATUS_LABEL: Record<string, string> = {
  connecting:   '//CONNECTING',
  connected:    '//ENGINE LIVE',
  reconnecting: '//RECONNECTING',
  offline:      '//OFFLINE',
}
const STATUS_COLOR: Record<string, string> = {
  connecting:   'var(--amber)',
  connected:    'var(--cyan)',
  reconnecting: 'var(--amber)',
  offline:      'var(--red)',
}

export function StatusBar() {
  const pods         = useStore(s => s.pods)
  const namespaces   = useStore(s => s.namespaces)
  const nodes        = useStore(s => s.nodes)
  const clusterName  = useStore(s => s.clusterName)
  const engineStatus = useStore(s => s.engineStatus)
  const uptime = useUptime()

  const ready   = pods.filter(p => p.health === 'ready').length
  const pending = pods.filter(p => p.health === 'pending').length
  const failed  = pods.filter(p => p.health === 'failed').length

  const nodesReady = nodes.filter(n => n.ready).length
  const nodesTotal = nodes.length
  const nodesLabel = nodesTotal > 0 ? `${nodesReady} / ${nodesTotal} ready` : '— / — ready'

  const displayName = clusterName || 'kube-islands'

  const uplinkLabel = ENGINE_URL
    ? (STATUS_LABEL[engineStatus ?? 'connecting'] ?? '//CONNECTING')
    : '//UPLINK STABLE'
  const uplinkColor = ENGINE_URL
    ? (STATUS_COLOR[engineStatus ?? 'connecting'] ?? 'var(--amber)')
    : 'var(--cyan)'

  return (
    <div
      className="panel"
      style={{ top: 20, left: 20, minWidth: 320, pointerEvents: 'auto' }}
    >
      <div className="panel-header">
        <span className="dot" />
        CLUSTER TELEMETRY
        <span className="sub" style={{ color: uplinkColor }}>{uplinkLabel}</span>
      </div>

      {[
        ['CLUSTER',    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{displayName}</span>],
        ['NODES',      nodesLabel],
        ['NAMESPACES', `${namespaces.length} active`],
        ['PODS',       (
          <span>
            <span style={{ color: 'var(--ink)' }}>{ready} running</span>
            {pending > 0 && <span style={{ color: 'var(--amber)', marginLeft: 6 }}>• {pending} pending</span>}
            {failed  > 0 && <span style={{ color: 'var(--red)',   marginLeft: 6 }}>• {failed} failed</span>}
          </span>
        )],
        ['UPTIME', uptime],
      ].map(([label, value]) => (
        <div
          key={label as string}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: 'var(--ink-dim)',
            padding: '3px 0',
          }}
        >
          <span>{label as string}</span>
          <span style={{ color: 'var(--ink)' }}>{value as React.ReactNode}</span>
        </div>
      ))}
    </div>
  )
}

