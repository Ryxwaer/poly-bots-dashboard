/**
 * useLiveFeed — connects to Binance WS for live crypto price
 * and exposes reactive time-series data for the chart background overlay.
 *
 * Binance public API, no auth required.
 */

export interface PricePoint {
  x: number // timestamp ms
  y: number // price
}

export interface LiveFeedState {
  /** Whether the live feed overlay is enabled */
  enabled: Ref<boolean>
  /** Whether we're currently connected to the WS */
  connected: Ref<boolean>
  /** Crypto price over time (raw USD) */
  cryptoPrice: Ref<PricePoint[]>
  /** Latest crypto price for display */
  latestCryptoPrice: Ref<number | null>
  /** Crypto symbol (e.g. "ETHUSDT") */
  cryptoSymbol: Ref<string | null>
  /** Start the feed for a given market slug */
  start: (slug: string) => Promise<void>
  /** Stop all connections */
  stop: () => void
  /** Toggle enabled state */
  toggle: () => void
}

// Max data points to keep (avoid memory leak for long-running sessions)
const MAX_POINTS = 3600 // ~1h at 1/s

export function useLiveFeed(): LiveFeedState {
  const enabled = ref(false)
  const connected = ref(false)
  const cryptoPrice = ref<PricePoint[]>([])
  const latestCryptoPrice = ref<number | null>(null)
  const cryptoSymbol = ref<string | null>(null)

  let binanceWs: WebSocket | null = null
  let currentSlug: string | null = null

  function clearData() {
    cryptoPrice.value = []
    latestCryptoPrice.value = null
  }

  function pushPoint(arr: Ref<PricePoint[]>, point: PricePoint) {
    arr.value = [...arr.value.slice(-(MAX_POINTS - 1)), point]
  }

  // ── Binance WebSocket ──────────────────────────────────────────────
  function connectBinance(symbol: string) {
    closeBinance()
    cryptoSymbol.value = symbol.toUpperCase()

    const url = `wss://stream.binance.com:9443/ws/${symbol}@trade`
    binanceWs = new WebSocket(url)

    binanceWs.onopen = () => {
      console.log(`[LiveFeed] Binance WS connected: ${symbol}`)
      connected.value = true
    }

    binanceWs.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        const price = parseFloat(data.p)
        const ts = data.T || Date.now()
        if (!isNaN(price)) {
          pushPoint(cryptoPrice, { x: ts, y: price })
          latestCryptoPrice.value = price
        }
      } catch { /* ignore parse errors */ }
    }

    binanceWs.onerror = (err) => {
      console.error('[LiveFeed] Binance WS error:', err)
    }

    binanceWs.onclose = () => {
      console.log('[LiveFeed] Binance WS closed')
      connected.value = false
    }
  }

  function closeBinance() {
    if (binanceWs) {
      binanceWs.close()
      binanceWs = null
    }
    connected.value = false
  }

  // ── Public API ─────────────────────────────────────────────────────
  async function start(slug: string) {
    if (currentSlug === slug && connected.value) return
    stop()
    clearData()
    currentSlug = slug

    try {
      // Fetch crypto symbol from our server endpoint
      const info = await $fetch<any>('/api/market-info', { query: { slug } })

      if (!info) return

      // Connect to Binance WS if we know the crypto
      if (info.cryptoSymbol) {
        connectBinance(info.cryptoSymbol)
      }
    } catch (err) {
      console.error('[LiveFeed] Failed to start:', err)
    }
  }

  function stop() {
    closeBinance()
    currentSlug = null
  }

  function toggle() {
    enabled.value = !enabled.value
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stop()
  })

  return {
    enabled,
    connected,
    cryptoPrice,
    latestCryptoPrice,
    cryptoSymbol,
    start,
    stop,
    toggle,
  }
}
