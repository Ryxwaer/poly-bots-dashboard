<script setup lang="ts">
import type { MarketGroups, MarketRound } from '~/composables/useMarkets'

const props = defineProps<{
  markets: MarketGroups
  selectedMarket: string | null
  autoTrack: boolean
  modeFilter: string
}>()

const emit = defineEmits<{
  'select': [slug: string]
  'update:autoTrack': [value: boolean]
  'update:modeFilter': [value: string]
}>()

const expandedGroups = ref<Set<string>>(new Set())

// Filter markets by selected mode
const filteredMarkets = computed<MarketGroups>(() => {
  if (props.modeFilter === 'all') return props.markets

  const filtered: MarketGroups = {}
  for (const [prefix, rounds] of Object.entries(props.markets)) {
    const matching = rounds.filter(r => r.modes.includes(props.modeFilter))
    if (matching.length > 0) {
      filtered[prefix] = matching
    }
  }
  return filtered
})

// Auto-expand all groups
watch(() => props.markets, (m) => {
  const keys = Object.keys(m)
  if (keys.length > 0 && expandedGroups.value.size === 0) {
    keys.forEach(k => expandedGroups.value.add(k))
  }
}, { immediate: true })

function toggleGroup(prefix: string) {
  if (expandedGroups.value.has(prefix)) {
    expandedGroups.value.delete(prefix)
  } else {
    expandedGroups.value.add(prefix)
  }
}

function formatSlug(slug: string, prefix: string): string {
  const datePart = slug.replace(prefix + '-', '')
  const match = datePart.match(/^(\w+)-(\d+)-(.+)-et$/i)
  if (match) {
    const month = match[1].slice(0, 3)
    return `${month} ${match[2]}, ${match[3]}`
  }
  return datePart
}

function isLatestRound(rounds: MarketRound[], idx: number): boolean {
  return idx === 0
}

// Count totals for the footer
const totalRounds = computed(() => Object.values(filteredMarkets.value).flat().length)
const totalGroups = computed(() => Object.keys(filteredMarkets.value).length)
</script>

<template>
  <aside class="w-72 sm:w-60 shrink-0 h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-zinc-800">
      <h1 class="text-sm font-semibold text-zinc-300 tracking-wide uppercase">Gabagool</h1>
      <p class="text-xs text-zinc-500 mt-0.5">Hedging Dashboard</p>
    </div>

    <!-- Controls -->
    <div class="px-4 py-3 border-b border-zinc-800 space-y-3">
      <!-- Auto-track toggle -->
      <label class="flex items-center justify-between cursor-pointer group" @click.prevent="emit('update:autoTrack', !autoTrack)">
        <span class="text-xs text-zinc-400 group-hover:text-zinc-300 select-none">Auto-track latest</span>
        <span
          :class="[
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            autoTrack ? 'bg-teal-600' : 'bg-zinc-700'
          ]"
        >
          <span
            :class="[
              'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
              autoTrack ? 'translate-x-[18px]' : 'translate-x-[3px]'
            ]"
          />
        </span>
      </label>

      <!-- Mode filter -->
      <div class="flex items-center gap-1">
        <button
          v-for="m in ['all', 'production', 'simulation']"
          :key="m"
          :class="[
            'flex-1 py-1 text-[10px] rounded text-center transition-colors',
            modeFilter === m
              ? 'bg-zinc-700 text-zinc-200 font-medium'
              : 'text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800'
          ]"
          @click="emit('update:modeFilter', m)"
        >
          {{ m === 'production' ? 'prod' : m === 'simulation' ? 'sim' : 'all' }}
        </button>
      </div>
    </div>

    <!-- Market List -->
    <div class="flex-1 overflow-y-auto overscroll-contain">
      <div v-for="(rounds, prefix) in filteredMarkets" :key="prefix" class="border-b border-zinc-800/50">
        <!-- Group header -->
        <button
          class="w-full px-4 py-3 sm:py-2 flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          @click="toggleGroup(String(prefix))"
        >
          <svg
            :class="['w-3 h-3 shrink-0 transition-transform', expandedGroups.has(String(prefix)) ? 'rotate-90' : '']"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span class="truncate">{{ prefix }}</span>
          <span class="ml-auto shrink-0 text-zinc-600 tabular-nums">{{ rounds.length }}</span>
        </button>

        <!-- Rounds -->
        <div v-if="expandedGroups.has(String(prefix))">
          <button
            v-for="(round, idx) in rounds"
            :key="round.slug"
            :class="[
              'w-full pl-8 pr-4 py-2.5 sm:py-1.5 flex items-center gap-2 text-xs transition-colors',
              selectedMarket === round.slug
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800/30'
            ]"
            @click="emit('select', round.slug)"
          >
            <span class="tabular-nums truncate">{{ formatSlug(round.slug, String(prefix)) }}</span>
            <!-- Sim badge -->
            <span
              v-if="round.modes.includes('simulation') && !round.modes.includes('production')"
              class="shrink-0 text-[9px] px-1 rounded bg-violet-500/20 text-violet-400"
            >SIM</span>
            <span
              v-if="isLatestRound(rounds, idx)"
              class="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"
            />
            <span v-else class="ml-auto shrink-0 text-zinc-700 tabular-nums text-[10px]">
              {{ round.eventCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="totalGroups === 0" class="px-4 py-8 text-center">
        <p class="text-xs text-zinc-600">No markets found</p>
      </div>
    </div>

    <!-- Footer stats -->
    <div class="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
      {{ totalRounds }} rounds across {{ totalGroups }} markets
    </div>
  </aside>
</template>
