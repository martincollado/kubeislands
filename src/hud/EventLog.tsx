
import { useRef } from 'react'
import { useStore } from '@/state/store'

const VERB_COLORS: Record<string, { bg: string; text: string }> = {
  ADDED:    { bg: 'rgba(0,255,209,0.15)',   text: 'var(--cyan)'     },
  MODIFIED: { bg: 'rgba(138,166,196,0.15)', text: 'var(--ink-dim)'  },
  DELETED:  { bg: 'rgba(82,112,142,0.18)',  text: 'var(--ink-faint)'},
  WARN:     { bg: 'rgba(255,184,0,0.18)',   text: 'var(--amber)'    },
  ERROR:    { bg: 'rgba(255,51,85,0.20)',   text: 'var(--red)'      },
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

export function EventLog() {
  // Stable selector: subscribe to the events array by reference.
  // Slice is done during render so no new array is created in the selector.
  const events = useStore(s => s.events)
  const visible = events.slice(0, 12)

  return (
    <div
      className="panel"
      style={{
        bottom: 20,
        left: 20,
        width: 420,
        maxHeight: 240,
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <div className="panel-header">
        <span className="dot" />
        EVENT STREAM
        <span className="sub">//LIVE · 200 CAP</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map(ev => {
          const c = VERB_COLORS[ev.verb] ?? VERB_COLORS.MODIFIED
          return (
            <div
              key={ev.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '54px 68px 72px 1fr',
                gap: 8,
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 0',
                borderBottom: '1px dashed var(--hair)',
              }}
            >
              <span style={{ color: 'var(--ink-faint)' }}>{formatTime(ev.t)}</span>
              <span style={{
                background: c.bg,
                color: c.text,
                padding: '0 5px',
                fontSize: 9,
                letterSpacing: '0.06em',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {ev.verb}
              </span>
              <span style={{ color: 'var(--obs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.namespace}
              </span>
              <span style={{ color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.message}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
