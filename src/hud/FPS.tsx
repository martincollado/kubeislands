
import { useEffect, useRef, useState } from 'react'

export function FPS() {
  const [fps, setFps] = useState(60)
  const [info, setInfo] = useState({ draws: 0, tris: 0, dpr: 1.8 })
  const frameCount = useRef(0)
  const lastTime   = useRef(performance.now())

  useEffect(() => {
    let raf: number
    function tick() {
      frameCount.current++
      const now = performance.now()
      const elapsed = now - lastTime.current
      if (elapsed >= 500) {
        setFps(Math.round(frameCount.current / (elapsed / 1000)))
        frameCount.current = 0
        lastTime.current = now

        // Try to get draw info from R3F renderer (exposed on window by Scene.tsx)
        const renderer = (window as unknown as Record<string, unknown>).__renderer as {
          info?: { render?: { calls?: number; triangles?: number } }
          getPixelRatio?: () => number
        } | undefined
        if (renderer?.info?.render) {
          setInfo({
            draws: renderer.info.render.calls ?? 0,
            tris: Math.round((renderer.info.render.triangles ?? 0) / 1000),
            dpr: renderer.getPixelRatio?.() ?? 1.8,
          })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const fpsColor = fps >= 55 ? 'var(--cyan)' : fps >= 30 ? 'var(--amber)' : 'var(--red)'

  return (
    <div
      className="panel"
      style={{
        top: 20,
        right: 20,
        minWidth: 130,
        textAlign: 'right',
        pointerEvents: 'auto',
      }}
    >
      <div className="panel-header" style={{ justifyContent: 'flex-end' }}>
        <span className="sub" style={{ margin: 0 }}>PERF</span>
        <span className="dot" />
      </div>

      <div style={{
        fontFamily: 'Orbitron, system-ui',
        fontWeight: 700,
        fontSize: 28,
        color: fpsColor,
        lineHeight: 1,
      }}>
        {fps}
        <small style={{ fontSize: 11, color: 'var(--ink-dim)', letterSpacing: '0.1em', marginLeft: 4 }}>
          FPS
        </small>
      </div>

      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        color: 'var(--ink-faint)',
        marginTop: 6,
        letterSpacing: '0.08em',
      }}>
        DRAW {info.draws} · TRI {info.tris}K · DPR {info.dpr.toFixed(1)}
      </div>
    </div>
  )
}
