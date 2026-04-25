import { Scene } from '@/world/Scene'
import { HUD } from '@/hud/HUD'

export function App() {
  return (
    <main style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <Scene />
      <HUD />
    </main>
  )
}
