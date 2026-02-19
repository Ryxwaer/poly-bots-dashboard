<script setup lang="ts">
import type { RoundSummary } from '~/server/utils/pairing'

const props = defineProps<{
  round: RoundSummary
}>()

const pnlClass = computed(() => {
  if (!props.round.roundEnd) return 'text-zinc-400'
  const pnl = props.round.totalProfit + (props.round.roundEnd?.pnl || 0)
  return pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
})

const totalPnl = computed(() => {
  const mergePnl = props.round.totalProfit
  const settlePnl = props.round.roundEnd?.pnl || 0
  return mergePnl + settlePnl
})

const outcomeLabel = computed(() => {
  if (!props.round.roundEnd) return 'active'
  const o = props.round.roundEnd.outcome
  const labels: Record<string, string> = {
    profit_locked: 'PROFIT LOCKED',
    partial: 'PARTIAL',
    unhedged: 'UNHEDGED',
    empty: 'EMPTY',
    merged_out: 'MERGED OUT',
  }
  return labels[o] || o
})

const outcomeClass = computed(() => {
  if (!props.round.roundEnd) return 'text-teal-400 bg-teal-400/10'
  const o = props.round.roundEnd.outcome
  if (o === 'profit_locked' || o === 'merged_out') return 'text-emerald-400 bg-emerald-400/10'
  if (o === 'partial') return 'text-amber-400 bg-amber-400/10'
  if (o === 'unhedged') return 'text-red-400 bg-red-400/10'
  return 'text-zinc-400 bg-zinc-400/10'
})
</script>

<template>
  <div class="px-3 md:px-4 py-2.5 md:py-3 bg-zinc-900 border-b border-zinc-800">
    <!-- Top row: market name + badges -->
    <div class="flex items-start sm:items-center gap-3 sm:gap-4">
      <div class="flex-1 min-w-0">
        <h2 class="text-xs sm:text-sm font-medium text-zinc-200 truncate">{{ round.market }}</h2>
        <div class="flex items-center gap-2 mt-0.5">
          <span :class="['text-[10px] px-1.5 py-0.5 rounded font-medium', outcomeClass]">
            {{ outcomeLabel }}
          </span>
          <span v-if="round.mode === 'simulation'" class="text-[10px] px-1.5 py-0.5 rounded bg-violet-400/10 text-violet-400 font-medium">
            SIM
          </span>
        </div>
      </div>

      <!-- Desktop stats (hidden on mobile) -->
      <div class="hidden sm:flex items-center gap-4 text-xs tabular-nums shrink-0">
        <div class="text-center">
          <div class="text-zinc-500">PnL</div>
          <div :class="pnlClass" class="font-medium">${{ totalPnl.toFixed(2) }}</div>
        </div>
        <div class="text-center">
          <div class="text-zinc-500">Merge PnL</div>
          <div class="text-emerald-400 font-medium">${{ round.totalProfit.toFixed(2) }}</div>
        </div>
        <div class="text-center">
          <div class="text-zinc-500">Buys</div>
          <div class="text-zinc-300">{{ round.totalBuys }}</div>
        </div>
        <div class="text-center">
          <div class="text-zinc-500">Merges</div>
          <div class="text-zinc-300">{{ round.totalMerges }}</div>
        </div>
        <div class="text-center" v-if="round.unmergedYes > 0 || round.unmergedNo > 0">
          <div class="text-zinc-500">Unmerged</div>
          <div class="text-red-400 font-medium">
            {{ round.unmergedYes > 0 ? `Y:${round.unmergedYes}` : '' }}
            {{ round.unmergedNo > 0 ? `N:${round.unmergedNo}` : '' }}
          </div>
        </div>
        <div class="text-center" v-if="round.errors.length > 0">
          <div class="text-zinc-500">Errors</div>
          <div class="text-red-400">{{ round.errors.length }}</div>
        </div>
      </div>
    </div>

    <!-- Mobile stats grid (hidden on desktop) -->
    <div class="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-2 sm:hidden text-[11px] tabular-nums">
      <div>
        <span class="text-zinc-500">PnL </span>
        <span :class="pnlClass" class="font-medium">${{ totalPnl.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-zinc-500">Merge </span>
        <span class="text-emerald-400 font-medium">${{ round.totalProfit.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-zinc-500">Buys </span>
        <span class="text-zinc-300">{{ round.totalBuys }}</span>
        <span class="text-zinc-500 mx-1">M </span>
        <span class="text-zinc-300">{{ round.totalMerges }}</span>
      </div>
      <div v-if="round.unmergedYes > 0 || round.unmergedNo > 0" class="col-span-2">
        <span class="text-zinc-500">Unmerged </span>
        <span class="text-red-400 font-medium">
          {{ round.unmergedYes > 0 ? `Y:${round.unmergedYes}` : '' }}
          {{ round.unmergedNo > 0 ? `N:${round.unmergedNo}` : '' }}
        </span>
      </div>
      <div v-if="round.errors.length > 0">
        <span class="text-zinc-500">Errors </span>
        <span class="text-red-400">{{ round.errors.length }}</span>
      </div>
    </div>
  </div>
</template>
