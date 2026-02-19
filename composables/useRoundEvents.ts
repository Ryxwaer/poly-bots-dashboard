import type { RoundSummary } from '../server/utils/pairing'

export function useRoundEvents() {
  const roundData = ref<RoundSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchRound = async (market: string, mode: string = 'all') => {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<RoundSummary>('/api/events', {
        query: { market, mode },
      })
      roundData.value = data
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch round events'
    } finally {
      loading.value = false
    }
  }

  return { roundData, loading, error, fetchRound }
}
