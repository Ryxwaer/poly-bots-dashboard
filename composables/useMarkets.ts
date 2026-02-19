export interface MarketRound {
  slug: string
  latestTs: string
  earliestTs: string
  eventCount: number
  modes: string[]
}

export type MarketGroups = Record<string, MarketRound[]>

export function useMarkets() {
  const markets = ref<MarketGroups>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchMarkets = async () => {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<MarketGroups>('/api/markets')
      markets.value = data
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch markets'
    } finally {
      loading.value = false
    }
  }

  return { markets, loading, error, fetchMarkets }
}
