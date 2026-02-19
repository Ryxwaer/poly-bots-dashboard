/**
 * GET /api/market-info?slug=ethereum-up-or-down-february-19-2am-et
 *
 * Resolves a market slug → token IDs + crypto symbol via Gamma + CLOB public APIs.
 * All responses are cached for 5 minutes (markets don't change mid-round).
 */

interface TokenInfo {
  tokenId: string
  outcome: string // "Yes" / "No" / "Up" / "Down"
}

interface MarketInfo {
  slug: string
  conditionId: string
  question: string
  tokens: TokenInfo[]
  cryptoSymbol: string | null // e.g. "ethusdt", "btcusdt"
  endDate: string | null
}

// In-memory cache: slug → { data, expiresAt }
const CACHE = new Map<string, { data: MarketInfo; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min

// Map known slug prefixes to Binance symbol
const CRYPTO_MAP: Record<string, string> = {
  'ethereum': 'ethusdt',
  'bitcoin': 'btcusdt',
  'solana': 'solusdt',
  'xrp': 'xrpusdt',
  'dogecoin': 'dogeusdt',
  'bnb': 'bnbusdt',
  'cardano': 'adausdt',
  'avalanche': 'avaxusdt',
  'polkadot': 'dotusdt',
  'polygon': 'maticusdt',
  'litecoin': 'ltcusdt',
  'chainlink': 'linkusdt',
  'sui': 'suiusdt',
}

function detectCryptoSymbol(slug: string): string | null {
  const lower = slug.toLowerCase()
  for (const [keyword, symbol] of Object.entries(CRYPTO_MAP)) {
    if (lower.startsWith(keyword)) return symbol
  }
  return null
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = query.slug as string

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'slug query parameter is required' })
  }

  // Check cache
  const cached = CACHE.get(slug)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  try {
    // 1. Fetch event from Gamma API by slug
    const gammaRes = await $fetch<any[]>(`https://gamma-api.polymarket.com/events`, {
      query: { slug },
    })

    if (!gammaRes || gammaRes.length === 0) {
      throw createError({ statusCode: 404, statusMessage: `No event found for slug: ${slug}` })
    }

    const gammaEvent = gammaRes[0]
    const markets = gammaEvent.markets
    if (!markets || markets.length === 0) {
      throw createError({ statusCode: 404, statusMessage: `No markets in event: ${slug}` })
    }

    const market = markets[0]
    const conditionId = market.conditionId

    if (!conditionId) {
      throw createError({ statusCode: 500, statusMessage: `No conditionId found for: ${slug}` })
    }

    // 2. Fetch token details from CLOB API
    const clobRes = await $fetch<any>(`https://clob.polymarket.com/markets/${conditionId}`)

    const tokens: TokenInfo[] = (clobRes.tokens || []).map((t: any) => ({
      tokenId: t.token_id,
      outcome: t.outcome,
    }))

    const result: MarketInfo = {
      slug,
      conditionId,
      question: market.question || gammaEvent.title || slug,
      tokens,
      cryptoSymbol: detectCryptoSymbol(slug),
      endDate: gammaEvent.endDate || market.endDate || null,
    }

    // Cache it
    CACHE.set(slug, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })

    return result
  } catch (err: any) {
    // If it's already a createError, re-throw
    if (err.statusCode) throw err

    console.error(`Failed to resolve market info for ${slug}:`, err)
    throw createError({ statusCode: 502, statusMessage: `Failed to resolve market info: ${err.message}` })
  }
})
