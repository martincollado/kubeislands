// RemoteStream — R3F component that replaces MockStream when VITE_ENGINE_URL is set.
// Opens a WebSocket to the Go engine and applies incoming messages to Zustand.
import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { WorldSocket } from './WorldSocket'
import { dispatch } from './Dispatcher'

const ENGINE_URL = import.meta.env.VITE_ENGINE_URL as string | undefined

// Convert ws:// prefix if user passes http://
function toWsUrl(url: string): string {
  return url.replace(/^http/, 'ws') + '/ws/world'
}

export function RemoteStream() {
  useEffect(() => {
    if (!ENGINE_URL) return

    const wsUrl = toWsUrl(ENGINE_URL)
    const socket = new WorldSocket(
      wsUrl,
      dispatch,
      (status) => {
        useStore.setState({ engineStatus: status })
      }
    )
    socket.connect()
    return () => socket.disconnect()
  }, [])

  return null
}
