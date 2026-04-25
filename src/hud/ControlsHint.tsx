
import { useEffect, useState } from 'react'

const CONTROLS = [
  { key: 'W A S D', label: 'PAN'      },
  { key: 'Q E',     label: 'ROTATE'   },
  { key: 'WHEEL',   label: 'ZOOM'     },
  { key: '1-5',     label: 'FOCUS'    },
  { key: 'SPC',     label: 'RESET'    },
  { key: 'T',       label: 'CINEMATIC'},
]

export function ControlsHint() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 6000)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?') setVisible(v => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey) }
  }, [])

  if (!visible) return null

  return (
    <div
      className="panel"
      style={{
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        padding: '8px 14px',
        pointerEvents: 'auto',
        opacity: visible ? 1 : 0,
        transition: 'opacity 480ms',
      }}
    >
      {CONTROLS.map(({ key, label }) => (
        <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: 'var(--cyan)',
            border: '1px solid rgba(0,255,209,.4)',
            padding: '2px 6px',
            letterSpacing: '0.08em',
          }}>
            {key}
          </span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            color: 'var(--ink-dim)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            {label}
          </span>
        </span>
      ))}
    </div>
  )
}
