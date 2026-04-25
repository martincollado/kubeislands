
/**
 * Full-viewport HUD overlay.
 * pointer-events:none on the container; individual panels are pointer-events:auto.
 * All panels read from Zustand — no prop drilling.
 */

import { StatusBar } from './StatusBar'
import { NamespaceCard } from './NamespaceCard'
import { FPS } from './FPS'
import { EventLog } from './EventLog'
import { Minimap } from './Minimap'
import { ControlsHint } from './ControlsHint'
import { TweaksPanel } from './TweaksPanel'
import { useStore } from '@/state/store'

export function HUD() {
  const showTweaks = useStore(s => s.showTweaks)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* Top-left — cluster status */}
      <StatusBar />

      {/* Top-center — namespace card (appears on selection) */}
      <NamespaceCard />

      {/* Top-right — FPS + draw calls */}
      <FPS />

      {/* Bottom-left — event log */}
      <EventLog />

      {/* Bottom-right — minimap */}
      <Minimap />

      {/* Bottom-center — controls hint */}
      <ControlsHint />

      {/* Right-side tab to open tweaks */}
      <TweaksTab />

      {/* Tweaks panel — overlays right side */}
      {showTweaks && <TweaksPanel />}
    </div>
  )
}

function TweaksTab() {
  const toggle = useStore(s => s.toggleTweaks)
  return (
    <button
      onClick={toggle}
      style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translateY(-50%) rotate(90deg)',
        transformOrigin: 'right center',
        pointerEvents: 'auto',
        background: 'var(--panel-bg)',
        border: '1px solid var(--panel-bd)',
        color: 'var(--cyan)',
        fontFamily: 'Orbitron, system-ui, sans-serif',
        fontSize: '9px',
        letterSpacing: '0.14em',
        padding: '6px 10px',
        cursor: 'pointer',
        backdropFilter: 'var(--panel-blur)',
      }}
    >
      TWEAKS
    </button>
  )
}
