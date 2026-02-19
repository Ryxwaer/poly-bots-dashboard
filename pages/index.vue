<script setup lang="ts">
import type { RoundSummary } from '~/server/utils/pairing'

const { markets, loading: marketsLoading, fetchMarkets } = useMarkets()
const { roundData, loading: roundLoading, fetchRound } = useRoundEvents()
const { lastEvent, connected, onEvent, connect } = useEventStream()
const liveFeed = useLiveFeed()

const selectedMarket = ref<string | null>(null)
const autoTrack = ref(true)
const modeFilter = ref('all')
const sidebarOpen = ref(false)

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
  sidebarOpen.value = false // Close sidebar on mobile after selection
  await fetchRound(slug, modeFilter.value)
}

// Re-fetch when mode filter changes
watch(modeFilter, async () => {
  if (selectedMarket.value) {
    await fetchRound(selectedMarket.value, modeFilter.value)
  }
})

// Start/stop live feed when market changes or toggle flips
watch([() => selectedMarket.value, () => liveFeed.enabled.value], ([slug, enabled]) => {
  if (slug && enabled) {
    liveFeed.start(slug)
  } else {
    liveFeed.stop()
  }
}, { immediate: true })

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
    <!-- Mobile sidebar backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-30 bg-black/60 md:hidden"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- Sidebar -->
    <div
      :class="[
        'fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:z-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      ]"
    >
      <Sidebar
        :markets="markets"
        :selected-market="selectedMarket"
        :auto-track="autoTrack"
        :mode-filter="modeFilter"
        @select="onSelectMarket"
        @update:auto-track="autoTrack = $event"
        @update:mode-filter="modeFilter = $event"
      />
    </div>

    <!-- Main content -->
    <main class="flex-1 flex flex-col overflow-hidden min-w-0">
      <!-- Connection indicator + hamburger -->
      <div class="flex items-center gap-2 px-3 md:px-4 py-1.5 bg-zinc-900/50 border-b border-zinc-800/50 text-[10px]">
        <!-- Hamburger button (mobile only) -->
        <button
          class="md:hidden p-1 -ml-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          @click="sidebarOpen = !sidebarOpen"
          aria-label="Toggle sidebar"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <span
          :class="['w-1.5 h-1.5 rounded-full shrink-0', connected ? 'bg-emerald-400' : 'bg-red-400']"
        />
        <span class="text-zinc-500">
          {{ connected ? 'Live' : 'Disconnected' }}
        </span>
        <span v-if="autoTrack" class="text-teal-500 ml-2">auto-tracking</span>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- Live feed toggle -->
        <button
          v-if="selectedMarket"
          :class="[
            'flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors',
            liveFeed.enabled.value
              ? 'bg-violet-500/20 text-violet-300'
              : 'text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800'
          ]"
          @click="liveFeed.toggle()"
          title="Toggle live price feed (Binance + Polymarket)"
        >
          <!-- Signal icon -->
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788" />
          </svg>
          <span class="hidden sm:inline">Feed</span>
          <span v-if="liveFeed.enabled.value && liveFeed.connected.value"
            class="w-1 h-1 rounded-full bg-violet-400 animate-pulse"
          />
        </button>

        <!-- Crypto price badge -->
        <span
          v-if="liveFeed.enabled.value && liveFeed.latestCryptoPrice.value !== null"
          class="text-zinc-400 tabular-nums"
        >
          {{ liveFeed.cryptoSymbol.value }} ${{ liveFeed.latestCryptoPrice.value.toFixed(2) }}
        </span>
      </div>

      <!-- Loading state -->
      <div v-if="roundLoading && !roundData" class="flex-1 flex items-center justify-center">
        <div class="text-zinc-500 text-sm">Loading events...</div>
      </div>

      <!-- No selection state -->
      <div v-else-if="!selectedMarket" class="flex-1 flex items-center justify-center px-4">
        <div class="text-center">
          <p class="text-zinc-500 text-sm">Select a market from the sidebar</p>
          <p class="text-zinc-600 text-xs mt-1">or enable auto-track to follow the latest round</p>
          <button
            class="mt-3 md:hidden text-xs text-teal-500 border border-teal-500/30 rounded px-3 py-1.5 hover:bg-teal-500/10 transition-colors"
            @click="sidebarOpen = true"
          >
            Open Markets
          </button>
        </div>
      </div>

      <!-- Round data loaded -->
      <template v-else-if="roundData">
        <!-- Round header -->
        <RoundHeader :round="roundData" />

        <!-- Chart + Table -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Chart area -->
          <div class="flex-shrink-0 h-[40%] sm:h-[45%] min-h-[220px] sm:min-h-[280px] p-2 sm:p-4">
            <div class="w-full h-full bg-zinc-900 rounded border border-zinc-800 p-2 sm:p-3">
              <ClientOnly>
                <OrderChart
                  :round="roundData"
                  :live-feed-enabled="liveFeed.enabled.value"
                  :yes-ask="liveFeed.yesAsk.value"
                  :no-ask="liveFeed.noAsk.value"
                  :yes-bid="liveFeed.yesBid.value"
                  :no-bid="liveFeed.noBid.value"
                  :crypto-price="liveFeed.cryptoPrice.value"
                  :crypto-symbol="liveFeed.cryptoSymbol.value"
                />
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
