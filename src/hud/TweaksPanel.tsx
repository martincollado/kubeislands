
import { useStore, type Tweaks } from '@/state/store'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ink-dim)' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--cyan)' }}>
          {value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--cyan)' }}
      />
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ink-dim)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          background: value ? 'rgba(0,255,209,0.2)' : 'transparent',
          border: `1px solid ${value ? 'var(--cyan)' : 'var(--ink-faint)'}`,
          color: value ? 'var(--cyan)' : 'var(--ink-faint)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
          padding: '2px 8px',
          cursor: 'pointer',
          letterSpacing: '0.08em',
        }}
      >
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontFamily: 'Orbitron, system-ui',
        fontSize: 9,
        letterSpacing: '0.14em',
        color: 'var(--cyan)',
        textTransform: 'uppercase',
        marginBottom: 8,
        borderBottom: '1px solid var(--hair)',
        paddingBottom: 4,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const DEFAULTS: Tweaks = {
  bloomIntensity: 0.6, bloomThreshold: 0.9, bloomSmoothing: 0.3,
  chromaticAberration: 0.0008, vignetteDarkness: 0.5,
  fov: 50, dpr: 1.8,
  circuitAnim: true, beamFlicker: true, oceanOpacity: 1.0,
}

export function TweaksPanel() {
  const tweaks = useStore(s => s.tweaks)
  const set    = useStore(s => s.setTweaks)
  const close  = useStore(s => s.toggleTweaks)

  function upd(key: keyof Tweaks) {
    return (v: number | boolean) => set({ [key]: v } as Partial<Tweaks>)
  }

  return (
    <div
      className="panel"
      style={{
        top: 20,
        right: 20,
        width: 260,
        bottom: 20,
        overflowY: 'auto',
        pointerEvents: 'auto',
        zIndex: 20,
      }}
    >
      <div className="panel-header">
        <span className="dot" />
        TWEAKS
        <button
          onClick={close}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--ink-faint)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          ✕
        </button>
      </div>

      <Section title="Post-FX">
        <Slider label="bloom intensity"  value={tweaks.bloomIntensity}       min={0}    max={3}    step={0.05} onChange={upd('bloomIntensity') as (v: number) => void} />
        <Slider label="bloom threshold"  value={tweaks.bloomThreshold}       min={0}    max={1}    step={0.01} onChange={upd('bloomThreshold') as (v: number) => void} />
        <Slider label="bloom smoothing"  value={tweaks.bloomSmoothing}       min={0}    max={1}    step={0.01} onChange={upd('bloomSmoothing') as (v: number) => void} />
        <Slider label="chromatic aberr." value={tweaks.chromaticAberration}  min={0}    max={0.01} step={0.001} onChange={upd('chromaticAberration') as (v: number) => void} />
        <Slider label="vignette"         value={tweaks.vignetteDarkness}     min={0}    max={1}    step={0.05} onChange={upd('vignetteDarkness') as (v: number) => void} />
      </Section>

      <Section title="Camera">
        <Slider label="fov"  value={tweaks.fov} min={30} max={100} step={1}   onChange={upd('fov') as (v: number) => void} />
        <Slider label="DPR"  value={tweaks.dpr} min={0.5} max={2} step={0.1}  onChange={upd('dpr') as (v: number) => void} />
      </Section>

      <Section title="World">
        <Toggle label="circuit anim" value={tweaks.circuitAnim}  onChange={upd('circuitAnim') as (v: boolean) => void} />
        <Toggle label="beam flicker" value={tweaks.beamFlicker}  onChange={upd('beamFlicker') as (v: boolean) => void} />
        <Slider label="ocean opacity" value={tweaks.oceanOpacity} min={0} max={1} step={0.05} onChange={upd('oceanOpacity') as (v: number) => void} />
      </Section>

      <button
        onClick={() => set(DEFAULTS)}
        style={{
          width: '100%',
          marginTop: 8,
          background: 'rgba(0,255,209,0.08)',
          border: '1px solid var(--panel-bd)',
          color: 'var(--cyan)',
          fontFamily: 'Orbitron, system-ui',
          fontSize: 9,
          letterSpacing: '0.12em',
          padding: '8px',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        Reset to defaults
      </button>
    </div>
  )
}
