<script setup lang="ts">
import type { RoundSummary, AnnotatedBuy, AnnotatedMerge } from '~/server/utils/pairing'

const props = defineProps<{
  round: RoundSummary
}>()

// Build a unified chronological list of buys + merges
interface TimelineEntry {
  type: 'buy' | 'merge'
  ts: string
  buy?: AnnotatedBuy
  merge?: AnnotatedMerge
}

const timeline = computed((): TimelineEntry[] => {
  const r = props.round
  if (!r) return []

  const entries: TimelineEntry[] = []

  for (const b of r.buys) {
    entries.push({ type: 'buy', ts: b.ts, buy: b })
  }
  for (const m of r.merges) {
    entries.push({ type: 'merge', ts: m.ts, merge: m })
  }

  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  return entries
})

function formatTime(ts: string): string {
  const d = new Date(ts)
  return d.toISOString().replace('T', ' ').slice(11, 19)
}

function sideClass(side: string): string {
  return side === 'YES' ? 'text-teal-400' : 'text-amber-400'
}

function statusClass(buy: AnnotatedBuy): string {
  if (buy.merged) return 'text-emerald-400'
  if (buy.mergeGroupIds.length > 0) return 'text-amber-400'  // partially merged
  return 'text-red-400'
}

function statusLabel(buy: AnnotatedBuy): string {
  if (buy.merged) return `merged #${buy.mergeGroupIds.join(',')}`
  if (buy.mergeGroupIds.length > 0) return `partial #${buy.mergeGroupIds.join(',')}`
  return 'unmatched'
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs tabular-nums">
      <thead>
        <tr class="border-b border-zinc-800 text-zinc-500">
          <th class="text-left py-2 px-3 font-medium">Time</th>
          <th class="text-left py-2 px-3 font-medium">Event</th>
          <th class="text-left py-2 px-3 font-medium">Side</th>
          <th class="text-right py-2 px-3 font-medium">Price</th>
          <th class="text-right py-2 px-3 font-medium">Size</th>
          <th class="text-right py-2 px-3 font-medium">Pair Cost</th>
          <th class="text-right py-2 px-3 font-medium">Profit</th>
          <th class="text-left py-2 px-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(entry, idx) in timeline" :key="idx">
          <!-- Buy row -->
          <tr
            v-if="entry.type === 'buy' && entry.buy"
            :class="[
              'border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors',
              !entry.buy.merged && entry.buy.mergeGroupIds.length === 0 ? 'bg-red-400/5' : ''
            ]"
          >
            <td class="py-1.5 px-3 text-zinc-500">{{ formatTime(entry.buy.ts) }}</td>
            <td class="py-1.5 px-3 text-zinc-400">BUY</td>
            <td class="py-1.5 px-3 font-medium" :class="sideClass(entry.buy.side)">
              {{ entry.buy.side }}
            </td>
            <td class="py-1.5 px-3 text-right text-zinc-300">${{ entry.buy.price.toFixed(3) }}</td>
            <td class="py-1.5 px-3 text-right text-zinc-400">{{ entry.buy.size }}</td>
            <td class="py-1.5 px-3 text-right text-zinc-500">
              {{ entry.buy.pairCost !== null ? entry.buy.pairCost.toFixed(4) : '—' }}
            </td>
            <td class="py-1.5 px-3 text-right text-zinc-600">—</td>
            <td class="py-1.5 px-3">
              <span
                :class="[
                  'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
                  statusClass(entry.buy)
                ]"
              >
                <!-- Warning icon for unmatched -->
                <svg
                  v-if="!entry.buy.merged && entry.buy.mergeGroupIds.length === 0"
                  class="w-3 h-3"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                {{ statusLabel(entry.buy) }}
              </span>
            </td>
          </tr>

          <!-- Merge row -->
          <tr
            v-if="entry.type === 'merge' && entry.merge"
            class="border-b border-zinc-800/50 bg-emerald-400/5"
          >
            <td class="py-1.5 px-3 text-zinc-500">{{ formatTime(entry.merge.ts) }}</td>
            <td class="py-1.5 px-3 text-emerald-400 font-medium">MERGE</td>
            <td class="py-1.5 px-3 text-zinc-500">—</td>
            <td class="py-1.5 px-3 text-right text-zinc-400">{{ entry.merge.pairCost.toFixed(4) }}</td>
            <td class="py-1.5 px-3 text-right text-zinc-400">{{ entry.merge.pairs }}</td>
            <td class="py-1.5 px-3 text-right text-zinc-400">{{ entry.merge.pairCost.toFixed(4) }}</td>
            <td class="py-1.5 px-3 text-right text-emerald-400 font-medium">
              +${{ entry.merge.profit.toFixed(2) }}
            </td>
            <td class="py-1.5 px-3">
              <span class="text-[10px] text-zinc-500 truncate block max-w-[120px]" :title="entry.merge.txHash || ''">
                {{ entry.merge.txHash ? entry.merge.txHash.slice(0, 10) + '...' : 'simulated' }}
              </span>
            </td>
          </tr>
        </template>

        <!-- Empty state -->
        <tr v-if="timeline.length === 0">
          <td colspan="8" class="py-8 text-center text-zinc-600">
            No events in this round
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
