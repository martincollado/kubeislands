// WebSocket client — connects to the Go engine at VITE_ENGINE_URL/ws/world.
// Handles reconnect with exponential backoff (1→2→4→8→30s cap).

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface ServerMsg {
  kind: 'snapshot' | 'diff' | 'event' | 'ping' | 'error'
  t: number
  state?: import('@/state/store').WorldStateSnapshot
  ops?: Op[]
  event?: import('@/data/seed').EventLog
  code?: string
  msg?: string
}

export interface Op {
  op: 'add' | 'remove' | 'patch'
  path: string
  value?: unknown
  patch?: unknown
}

type MsgHandler = (msg: ServerMsg) => void
type StatusHandler = (s: ConnectionStatus) => void

const MAX_BACKOFF = 30_000

export class WorldSocket {
  private url: string
  private ws: WebSocket | null = null
  private backoff = 1000
  private stopped = false
  private onMsg: MsgHandler
  private onStatus: StatusHandler

  constructor(url: string, onMsg: MsgHandler, onStatus: StatusHandler) {
    this.url = url
    this.onMsg = onMsg
    this.onStatus = onStatus
  }

  connect() {
    if (this.stopped) return
    this.onStatus('connecting')
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 1000
      this.onStatus('connected')
    }

    ws.onmessage = (e) => {
      try {
        const msg: ServerMsg = JSON.parse(e.data)
        this.onMsg(msg)
      } catch {
        console.warn('[WorldSocket] bad message', e.data)
      }
    }

    ws.onerror = () => {
      // onclose fires after onerror
    }

    ws.onclose = () => {
      if (this.stopped) return
      this.onStatus('reconnecting')
      setTimeout(() => {
        this.connect()
      }, this.backoff)
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF)
    }
  }

  disconnect() {
    this.stopped = true
    this.ws?.close()
    this.ws = null
  }
}
