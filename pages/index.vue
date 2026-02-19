<script setup lang="ts">
import type { RoundSummary } from '~/server/utils/pairing'

const { markets, loading: marketsLoading, fetchMarkets } = useMarkets()
const { roundData, loading: roundLoading, fetchRound } = useRoundEvents()
const { lastEvent, connected, onEvent, connect } = useEventStream()

const selectedMarket = ref<string | null>(null)
const autoTrack = ref(true)
const modeFilter = ref('all')

// Fetch markets on mount
onMounted(async () => {
  await fetchMarkets()

  // Auto-select the most recent market
  const allRounds = Object.values(markets.value).flat()
  if (allRounds.length > 0) {
    selectedMarket.value = allRounds[0].slug
    await fetchRound(allRounds[0].slug, modeFilter.value)
  }

  // Connect to SSE stream
  connect()
})

// Handle market selection
async function onSelectMarket(slug: string) {
  selectedMarket.value = slug
  autoTrack.value = false
  await fetchRound(slug, modeFilter.value)
}

// Re-fetch when mode filter changes
watch(modeFilter, async () => {
  if (selectedMarket.value) {
    await fetchRound(selectedMarket.value, modeFilter.value)
  }
})

// Handle SSE events
onEvent(async (evt) => {
  const evtMarket = evt.data?.market

  // Refresh market list periodically when new events arrive
  if (evt.event === 'RoundStart' || evt.event === 'RoundEnd') {
    await fetchMarkets()
  }

  // Auto-track: switch to new market when RoundStart arrives
  if (autoTrack.value && evt.event === 'RoundStart' && evtMarket) {
    selectedMarket.value = evtMarket
    // Small delay to let the round populate
    setTimeout(async () => {
      await fetchRound(evtMarket, modeFilter.value)
    }, 1000)
    return
  }

  // If the event belongs to the currently viewed market, refresh
  if (evtMarket && evtMarket === selectedMarket.value) {
    await fetchRound(selectedMarket.value, modeFilter.value)
  }
})

// Refresh market list every 30s
const refreshInterval = ref<ReturnType<typeof setInterval> | null>(null)
onMounted(() => {
  refreshInterval.value = setInterval(fetchMarkets, 30000)
})
onUnmounted(() => {
  if (refreshInterval.value) clearInterval(refreshInterval.value)
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-zinc-950">
    <!-- Sidebar -->
    <Sidebar
      :markets="markets"
      :selected-market="selectedMarket"
      :auto-track="autoTrack"
      :mode-filter="modeFilter"
      @select="onSelectMarket"
      @update:auto-track="autoTrack = $event"
      @update:mode-filter="modeFilter = $event"
    />

    <!-- Main content -->
    <main class="flex-1 flex flex-col overflow-hidden">
      <!-- Connection indicator -->
      <div class="flex items-center gap-2 px-4 py-1.5 bg-zinc-900/50 border-b border-zinc-800/50 text-[10px]">
        <span
          :class="['w-1.5 h-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-red-400']"
        />
        <span class="text-zinc-500">
          {{ connected ? 'Live' : 'Disconnected' }}
        </span>
        <span v-if="autoTrack" class="text-teal-500 ml-2">auto-tracking</span>
      </div>

      <!-- Loading state -->
      <div v-if="roundLoading && !roundData" class="flex-1 flex items-center justify-center">
        <div class="text-zinc-500 text-sm">Loading events...</div>
      </div>

      <!-- No selection state -->
      <div v-else-if="!selectedMarket" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <p class="text-zinc-500 text-sm">Select a market from the sidebar</p>
          <p class="text-zinc-600 text-xs mt-1">or enable auto-track to follow the latest round</p>
        </div>
      </div>

      <!-- Round data loaded -->
      <template v-else-if="roundData">
        <!-- Round header -->
        <RoundHeader :round="roundData" />

        <!-- Chart + Table -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Chart area -->
          <div class="flex-shrink-0 h-[45%] min-h-[280px] p-4">
            <div class="w-full h-full bg-zinc-900 rounded border border-zinc-800 p-3">
              <ClientOnly>
                <OrderChart :round="roundData" />
              </ClientOnly>
            </div>
          </div>

          <!-- Table area -->
          <div class="flex-1 overflow-y-auto border-t border-zinc-800">
            <OrderTable :round="roundData" />
          </div>
        </div>
      </template>
    </main>
  </div>
</template>
