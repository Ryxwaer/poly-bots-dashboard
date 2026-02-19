<script setup lang="ts">
import { Scatter } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import type { RoundSummary, AnnotatedBuy, AnnotatedMerge } from '~/server/utils/pairing'

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, TimeScale, annotationPlugin)

const props = defineProps<{
  round: RoundSummary
}>()

const emit = defineEmits<{
  'select-group': [groupId: number | null]
}>()

// ── Selection state ────────────────────────────────────────────────
const selectedGroupId = ref<number | null>(null)

// Set of buy IDs belonging to the selected merge group
const selectedBuyIds = computed<Set<string>>(() => {
  const gid = selectedGroupId.value
  if (gid === null) return new Set()
  const ids = new Set<string>()
  for (const m of props.round.merges) {
    if (m.mergeGroupId === gid) {
      for (const id of m.consumedBuyIds) ids.add(id)
    }
  }
  return ids
})

// ── Color palette ──────────────────────────────────────────────────
const COLORS = {
  YES: '#2dd4bf',         // teal-400
  YES_DIM: '#2dd4bf30',
  NO: '#fbbf24',          // amber-400
  NO_DIM: '#fbbf2430',
  UNMERGED: '#f87171',    // red-400
  UNMERGED_DIM: '#f8717130',
  HIGHLIGHT: '#ffffff',   // white ring for selected
  MERGE_LINE_YES: '#2dd4bf88',
  MERGE_LINE_YES_HI: '#2dd4bfdd',
  MERGE_LINE_NO: '#fbbf2488',
  MERGE_LINE_NO_HI: '#fbbf24dd',
  GRID: '#27272a',        // zinc-800
  TEXT: '#a1a1aa',         // zinc-400
}

function toMs(ts: string): number {
  return new Date(ts).getTime()
}

// ── Helpers: resolve point colour based on selection ───────────────
function pointColor(buy: AnnotatedBuy, base: string, dim: string): string {
  if (selectedGroupId.value === null) return base // nothing selected
  return selectedBuyIds.value.has(buy._id) ? base : dim
}

function pointBorderColor(buy: AnnotatedBuy, base: string, dim: string): string {
  if (selectedGroupId.value === null) return base
  if (selectedBuyIds.value.has(buy._id)) return COLORS.HIGHLIGHT
  return dim
}

function pointRadius(buy: AnnotatedBuy, baseR: number): number {
  if (selectedGroupId.value === null) return baseR
  return selectedBuyIds.value.has(buy._id) ? baseR + 3 : baseR - 1
}

function pointBorderWidth(buy: AnnotatedBuy, baseW: number): number {
  if (selectedGroupId.value === null) return baseW
  return selectedBuyIds.value.has(buy._id) ? 2.5 : baseW
}

// ── Chart data ─────────────────────────────────────────────────────
const chartData = computed(() => {
  const r = props.round
  if (!r) return { datasets: [] }

  const yesBuys = r.buys.filter(b => b.side === 'YES')
  const noBuys = r.buys.filter(b => b.side === 'NO')

  const yesMerged = yesBuys.filter(b => b.merged)
  const yesUnmerged = yesBuys.filter(b => !b.merged)
  const noMerged = noBuys.filter(b => b.merged)
  const noUnmerged = noBuys.filter(b => !b.merged)

  const toPoint = (b: AnnotatedBuy) => ({
    x: toMs(b.ts),
    y: b.price,
    _buy: b,
  })

  // Scriptable options: Chart.js calls these per-point with context
  const scriptable = (baseFill: string, dimFill: string, baseBorder: string, dimBorder: string, baseR: number, baseBW: number) => ({
    backgroundColor: (ctx: any) => {
      const buy = ctx.raw?._buy
      return buy ? pointColor(buy, baseFill, dimFill) : baseFill
    },
    borderColor: (ctx: any) => {
      const buy = ctx.raw?._buy
      return buy ? pointBorderColor(buy, baseBorder, dimBorder) : baseBorder
    },
    pointRadius: (ctx: any) => {
      const buy = ctx.raw?._buy
      return buy ? pointRadius(buy, baseR) : baseR
    },
    borderWidth: (ctx: any) => {
      const buy = ctx.raw?._buy
      return buy ? pointBorderWidth(buy, baseBW) : baseBW
    },
  })

  return {
    datasets: [
      {
        label: 'YES (merged)',
        data: yesMerged.map(toPoint),
        ...scriptable(COLORS.YES, COLORS.YES_DIM, COLORS.YES, COLORS.YES_DIM, 6, 1),
        pointHoverRadius: 8,
        pointStyle: 'circle' as const,
        showLine: false,
      },
      {
        label: 'YES (unmerged)',
        data: yesUnmerged.map(toPoint),
        ...scriptable(COLORS.UNMERGED_DIM, COLORS.UNMERGED_DIM, COLORS.UNMERGED, COLORS.UNMERGED_DIM, 7, 2),
        pointHoverRadius: 9,
        pointStyle: 'circle' as const,
        showLine: false,
      },
      {
        label: 'NO (merged)',
        data: noMerged.map(toPoint),
        ...scriptable(COLORS.NO, COLORS.NO_DIM, COLORS.NO, COLORS.NO_DIM, 6, 1),
        pointHoverRadius: 8,
        pointStyle: 'rectRot' as const,
        showLine: false,
      },
      {
        label: 'NO (unmerged)',
        data: noUnmerged.map(toPoint),
        ...scriptable(COLORS.UNMERGED_DIM, COLORS.UNMERGED_DIM, COLORS.UNMERGED, COLORS.UNMERGED_DIM, 7, 2),
        pointHoverRadius: 9,
        pointStyle: 'rectRot' as const,
        showLine: false,
      },
    ],
  }
})

// ── Annotations ────────────────────────────────────────────────────
const annotations = computed(() => {
  const r = props.round
  if (!r) return {}

  const ann: Record<string, any> = {}
  const buyMap = new Map(r.buys.map(b => [b._id, b]))
  const gid = selectedGroupId.value

  for (const merge of r.merges) {
    const mergeX = toMs(merge.ts)
    const isSelected = gid !== null && merge.mergeGroupId === gid
    const isDimmed = gid !== null && !isSelected

    // Vertical merge marker
    ann[`merge-line-${merge.mergeGroupId}`] = {
      type: 'line',
      xMin: mergeX,
      xMax: mergeX,
      borderColor: isSelected ? '#a3e63588' : isDimmed ? '#71717a15' : '#71717a44',
      borderWidth: isSelected ? 2 : 1,
      borderDash: isSelected ? [] : [4, 4],
      label: {
        display: true,
        content: `M${merge.mergeGroupId} +$${merge.profit.toFixed(2)}`,
        position: 'start' as const,
        backgroundColor: isSelected ? '#1c1917' : '#18181b',
        color: isSelected ? '#a3e635' : isDimmed ? '#a3e63540' : '#a3e635',
        font: { size: isSelected ? 10 : 9, family: 'monospace', weight: isSelected ? 'bold' : 'normal' },
        padding: { top: 2, bottom: 2, left: 4, right: 4 },
      },
    }

    // Connection lines from consumed buys → merge timestamp
    for (const buyId of merge.consumedBuyIds) {
      const buy = buyMap.get(buyId)
      if (!buy) continue

      const buyX = toMs(buy.ts)
      const baseColor = buy.side === 'YES' ? COLORS.MERGE_LINE_YES : COLORS.MERGE_LINE_NO
      const hiColor = buy.side === 'YES' ? COLORS.MERGE_LINE_YES_HI : COLORS.MERGE_LINE_NO_HI
      const dimColor = buy.side === 'YES' ? '#2dd4bf18' : '#fbbf2418'

      ann[`merge-conn-${merge.mergeGroupId}-${buyId}`] = {
        type: 'line',
        xMin: buyX,
        xMax: mergeX,
        yMin: buy.price,
        yMax: buy.price,
        borderColor: isSelected ? hiColor : isDimmed ? dimColor : baseColor,
        borderWidth: isSelected ? 2.5 : isDimmed ? 0.5 : 1.5,
        borderDash: isSelected ? [] : [2, 2],
      }
    }
  }

  return ann
})

// ── Click handler ──────────────────────────────────────────────────
function onChartClick(_event: any, elements: any[], chart: any) {
  if (elements.length > 0) {
    // Clicked on a point — find its merge group
    const el = elements[0]
    const datasetIndex = el.datasetIndex
    const index = el.index
    const point = chart.data.datasets[datasetIndex].data[index]
    const buy = point?._buy as AnnotatedBuy | undefined

    if (buy && buy.mergeGroupIds.length > 0) {
      // Toggle: if already selected, deselect; else select first group
      const gid = buy.mergeGroupIds[0]
      selectedGroupId.value = selectedGroupId.value === gid ? null : gid
    } else {
      // Clicked unmerged point — clear selection
      selectedGroupId.value = null
    }
  } else {
    // Clicked empty space — deselect
    selectedGroupId.value = null
  }

  emit('select-group', selectedGroupId.value)

  // Force chart re-render by touching the reactive dep
  chart.update()
}

// Clear selection when round changes
watch(() => props.round.market, () => {
  selectedGroupId.value = null
})

// ── Chart options ──────────────────────────────────────────────────
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  interaction: {
    mode: 'nearest' as const,
    intersect: true,
  },
  onClick: onChartClick,
  scales: {
    x: {
      type: 'linear' as const,
      grid: { color: COLORS.GRID, drawTicks: false },
      border: { color: COLORS.GRID },
      ticks: {
        color: COLORS.TEXT,
        font: { size: 10, family: 'monospace' },
        callback: (value: number) => {
          const d = new Date(value)
          return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}`
        },
        maxTicksLimit: 10,
      },
    },
    y: {
      grid: { color: COLORS.GRID, drawTicks: false },
      border: { color: COLORS.GRID },
      ticks: {
        color: COLORS.TEXT,
        font: { size: 10, family: 'monospace' },
        callback: (value: number) => `$${value.toFixed(2)}`,
      },
      min: 0,
      max: 1,
    },
  },
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        color: COLORS.TEXT,
        font: { size: 10 },
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: '#18181b',
      titleColor: '#e4e4e7',
      bodyColor: '#a1a1aa',
      borderColor: '#3f3f46',
      borderWidth: 1,
      titleFont: { size: 11, family: 'monospace' },
      bodyFont: { size: 10, family: 'monospace' },
      padding: 8,
      callbacks: {
        title: (items: any[]) => {
          if (!items[0]) return ''
          const d = new Date(items[0].raw.x)
          return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
        },
        label: (item: any) => {
          const buy = item.raw._buy
          if (!buy) return ''
          const lines = [
            `${buy.side} ${buy.size} @ $${buy.price.toFixed(3)}`,
            `Reason: ${buy.reason}`,
          ]
          if (buy.pairCost !== null) lines.push(`Pair cost: ${buy.pairCost.toFixed(4)}`)
          lines.push(buy.merged ? `Merged (group ${buy.mergeGroupIds.join(',')})` : 'UNMERGED')
          return lines
        },
      },
    },
    annotation: {
      annotations: annotations.value,
    },
  },
}))

// ── Selected group info badge ──────────────────────────────────────
const selectedMerge = computed(() => {
  if (selectedGroupId.value === null) return null
  return props.round.merges.find(m => m.mergeGroupId === selectedGroupId.value) ?? null
})
</script>

<template>
  <div class="w-full h-full min-h-[300px] relative">
    <Scatter
      v-if="round && round.buys.length > 0"
      :data="(chartData as any)"
      :options="(chartOptions as any)"
      class="w-full h-full cursor-pointer"
    />
    <div v-else class="flex items-center justify-center h-full text-zinc-600 text-sm">
      No buy events in this round
    </div>

    <!-- Selection info badge -->
    <Transition name="fade">
      <div
        v-if="selectedMerge"
        class="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded bg-zinc-800/90 border border-zinc-700 text-xs tabular-nums backdrop-blur-sm"
      >
        <span class="text-zinc-400">
          Merge <span class="text-zinc-200 font-medium">#{{ selectedMerge.mergeGroupId }}</span>
        </span>
        <span class="text-zinc-500">|</span>
        <span class="text-zinc-400">
          {{ selectedMerge.pairs }} pairs
        </span>
        <span class="text-zinc-500">|</span>
        <span class="text-zinc-400">
          cost <span class="text-zinc-300">{{ selectedMerge.pairCost.toFixed(4) }}</span>
        </span>
        <span class="text-zinc-500">|</span>
        <span class="text-emerald-400 font-medium">
          +${{ selectedMerge.profit.toFixed(2) }}
        </span>
        <button
          class="text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
          title="Clear selection"
          @click="selectedGroupId = null"
        >
          ✕
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
