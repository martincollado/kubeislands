
import { useStore } from '@/state/store'
import { NAMESPACES, BRIDGES } from '@/data/seed'

const NS_BY_ID = Object.fromEntries(NAMESPACES.map(n => [n.id, n]))

// Scale factor to fit the ~60-unit world into the SVG viewBox
const SCALE = 0.55

function toSvg(worldX: number, worldZ: number) {
  return { x: worldX * SCALE, y: worldZ * SCALE }
}

export function Minimap() {
  const cam        = useStore(s => s.cam)
  const selectedNs = useStore(s => s.selectedNs)

  return (
    <div
      className="panel"
      style={{
        bottom: 20,
        right: 20,
        width: 220,
        height: 190,
        pointerEvents: 'auto',
      }}
    >
      <div className="panel-header">
        <span className="dot" />
        TACTICAL
        <span className="sub">//SECTOR A</span>
      </div>

      <svg
        viewBox="-40 -30 80 70"
        style={{ position: 'absolute', inset: 14, width: 'calc(100% - 28px)', height: 'calc(100% - 28px)' }}
      >
        {/* Bridges */}
        {BRIDGES.map(br => {
          const A = NS_BY_ID[br.a], B = NS_BY_ID[br.b]
          const a = toSvg(A.center[0], A.center[1])
          const b = toSvg(B.center[0], B.center[1])
          return (
            <line
              key={`${br.a}-${br.b}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--cyan)"
              strokeWidth={0.3}
              opacity={0.5}
              strokeDasharray="1 1"
            />
          )
        })}

        {/* Namespace hexagons */}
        {NAMESPACES.map(ns => {
          const c = toSvg(ns.center[0], ns.center[1])
          const r = ns.radius * 0.45 * SCALE
          const pts = Array.from({ length: 6 }, (_, i) => {
            const a = (i * Math.PI) / 3 + Math.PI / 6
            return `${c.x + r * Math.cos(a)},${c.y + r * Math.sin(a)}`
          }).join(' ')
          const isSelected = selectedNs === ns.id

          return (
            <g key={ns.id}>
              <polygon
                points={pts}
                fill={`${ns.hue}22`}
                stroke={ns.hue}
                strokeWidth={isSelected ? 0.6 : 0.3}
              />
              <text
                x={c.x}
                y={c.y + 0.5}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
                fontSize={1.8}
                fill="var(--ink-dim)"
              >
                {ns.id.slice(0, 3).toUpperCase()}
              </text>
            </g>
          )
        })}

        {/* Camera target dot */}
        <circle
          cx={cam.targetX * SCALE}
          cy={cam.targetZ * SCALE}
          r={0.9}
          fill="var(--cyan)"
        />
        <circle
          cx={cam.targetX * SCALE}
          cy={cam.targetZ * SCALE}
          r={cam.distance * 0.12}
          fill="none"
          stroke="var(--cyan)"
          strokeWidth={0.2}
          opacity={0.4}
        />
      </svg>
    </div>
  )
}
