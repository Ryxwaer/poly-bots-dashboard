export interface StreamEvent {
  _id: string
  event: string
  data: any
  ts: string
  mode: string
}

export function useEventStream() {
  const lastEvent = ref<StreamEvent | null>(null)
  const connected = ref(false)
  let eventSource: EventSource | null = null

  const callbacks: Array<(evt: StreamEvent) => void> = []

  const onEvent = (cb: (evt: StreamEvent) => void) => {
    callbacks.push(cb)
  }

  const connect = () => {
    if (eventSource) return

    eventSource = new EventSource('/api/stream')

    eventSource.addEventListener('connected', () => {
      connected.value = true
    })

    eventSource.addEventListener('event', (e: MessageEvent) => {
      try {
        const parsed: StreamEvent = JSON.parse(e.data)
        lastEvent.value = parsed
        for (const cb of callbacks) cb(parsed)
      } catch { /* ignore parse errors */ }
    })

    eventSource.addEventListener('heartbeat', () => {
      connected.value = true
    })

    eventSource.addEventListener('error', () => {
      connected.value = false
      // Auto-reconnect after 5s
      setTimeout(() => {
        disconnect()
        connect()
      }, 5000)
    })
  }

  const disconnect = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    connected.value = false
  }

  onUnmounted(() => {
    disconnect()
  })

  return { lastEvent, connected, onEvent, connect, disconnect }
}
