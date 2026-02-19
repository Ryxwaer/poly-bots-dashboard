/**
 * useLiveFeed — connects to Binance WS (crypto price) and Polymarket WS (bid/ask)
 * and exposes reactive time-series data for the chart overlay.
 *
 * Both APIs are fully public, no auth required.
 */

export interface PricePoint {
  x: number // timestamp ms
  y: number // price
}

export interface LiveFeedState {
  /** Whether the live feed overlay is enabled */
  enabled: Ref<boolean>
  /** Whether we're currently connected to at least one WS */
  connected: Ref<boolean>
  /** YES (Up) ask price over time */
  yesAsk: Ref<PricePoint[]>
  /** NO (Down) ask price over time */
  noAsk: Ref<PricePoint[]>
  /** YES (Up) bid price over time */
  yesBid: Ref<PricePoint[]>
  /** NO (Down) bid price over time */
  noBid: Ref<PricePoint[]>
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

// Max data points to keep per series (avoid memory leak for long-running sessions)
const MAX_POINTS = 3600 // ~1h at 1/s

export function useLiveFeed(): LiveFeedState {
  const enabled = ref(false)
  const connected = ref(false)
  const yesAsk = ref<PricePoint[]>([])
  const noAsk = ref<PricePoint[]>([])
  const yesBid = ref<PricePoint[]>([])
  const noBid = ref<PricePoint[]>([])
  const cryptoPrice = ref<PricePoint[]>([])
  const latestCryptoPrice = ref<number | null>(null)
  const cryptoSymbol = ref<string | null>(null)

  let binanceWs: WebSocket | null = null
  let polyWs: WebSocket | null = null
  let polyPingInterval: ReturnType<typeof setInterval> | null = null
  let currentSlug: string | null = null

  // Token ID → side mapping for Polymarket WS
  let tokenSideMap: Map<string, 'YES' | 'NO'> = new Map()

  function clearData() {
    yesAsk.value = []
    noAsk.value = []
    yesBid.value = []
    noBid.value = []
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
      updateConnected()
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
      updateConnected()
    }
  }

  function closeBinance() {
    if (binanceWs) {
      binanceWs.close()
      binanceWs = null
    }
  }

  // ── Polymarket WebSocket ───────────────────────────────────────────
  function connectPolymarket(tokenIds: string[]) {
    closePolymarket()

    const url = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
    polyWs = new WebSocket(url)

    polyWs.onopen = () => {
      console.log('[LiveFeed] Polymarket WS connected')
      // Subscribe to market data
      const msg = JSON.stringify({
        assets_ids: tokenIds,
        type: 'market',
      })
      polyWs?.send(msg)
      updateConnected()

      // Keep-alive pings every 5s
      polyPingInterval = setInterval(() => {
        if (polyWs?.readyState === WebSocket.OPEN) {
          polyWs.send('PING')
        }
      }, 5000)
    }

    polyWs.onmessage = (evt) => {
      if (evt.data === 'PONG') return

      try {
        const msgs: any[] = JSON.parse(evt.data)
        const now = Date.now()

        for (const msg of msgs) {
          if (msg.event_type === 'price_change' && msg.price_changes) {
            for (const pc of msg.price_changes) {
              processPolyPrice(pc.asset_id, pc.best_bid, pc.best_ask, now)
            }
          } else if (msg.event_type === 'best_bid_ask') {
            processPolyPrice(msg.asset_id, msg.best_bid, msg.best_ask, now)
          }
        }
      } catch { /* ignore parse errors */ }
    }

    polyWs.onerror = (err) => {
      console.error('[LiveFeed] Polymarket WS error:', err)
    }

    polyWs.onclose = () => {
      console.log('[LiveFeed] Polymarket WS closed')
      if (polyPingInterval) {
        clearInterval(polyPingInterval)
        polyPingInterval = null
      }
      updateConnected()
    }
  }

  function processPolyPrice(assetId: string, bid: string | number, ask: string | number, ts: number) {
    const side = tokenSideMap.get(assetId)
    if (!side) return

    const bidPrice = typeof bid === 'string' ? parseFloat(bid) : bid
    const askPrice = typeof ask === 'string' ? parseFloat(ask) : ask

    if (side === 'YES') {
      if (!isNaN(askPrice) && askPrice > 0) pushPoint(yesAsk, { x: ts, y: askPrice })
      if (!isNaN(bidPrice) && bidPrice > 0) pushPoint(yesBid, { x: ts, y: bidPrice })
    } else {
      if (!isNaN(askPrice) && askPrice > 0) pushPoint(noAsk, { x: ts, y: askPrice })
      if (!isNaN(bidPrice) && bidPrice > 0) pushPoint(noBid, { x: ts, y: bidPrice })
    }
  }

  function closePolymarket() {
    if (polyPingInterval) {
      clearInterval(polyPingInterval)
      polyPingInterval = null
    }
    if (polyWs) {
      polyWs.close()
      polyWs = null
    }
  }

  function updateConnected() {
    connected.value =
      (binanceWs?.readyState === WebSocket.OPEN) ||
      (polyWs?.readyState === WebSocket.OPEN) ||
      false
  }

  // ── Public API ─────────────────────────────────────────────────────
  async function start(slug: string) {
    if (currentSlug === slug && connected.value) return
    stop()
    clearData()
    currentSlug = slug

    try {
      // Fetch token IDs + crypto symbol from our server endpoint
      const info = await $fetch<any>('/api/market-info', { query: { slug } })

      if (!info) return

      // Build token → side mapping
      tokenSideMap = new Map()
      for (const token of info.tokens || []) {
        const outcome = (token.outcome || '').toUpperCase()
        if (outcome.includes('UP') || outcome === 'YES' || outcome === '1') {
          tokenSideMap.set(token.tokenId, 'YES')
        } else if (outcome.includes('DOWN') || outcome === 'NO' || outcome === '0') {
          tokenSideMap.set(token.tokenId, 'NO')
        }
      }

      // Connect to Polymarket WS if we have tokens
      const tokenIds = [...tokenSideMap.keys()]
      if (tokenIds.length > 0) {
        connectPolymarket(tokenIds)
      }

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
    closePolymarket()
    currentSlug = null
    tokenSideMap = new Map()
    connected.value = false
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
    yesAsk,
    noAsk,
    yesBid,
    noBid,
    cryptoPrice,
    latestCryptoPrice,
    cryptoSymbol,
    start,
    stop,
    toggle,
  }
}
