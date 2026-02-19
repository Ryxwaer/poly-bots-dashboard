/**
 * Merge-pairing algorithm.
 *
 * Processes a chronological list of events for a single round and annotates
 * each Buy with its merge-group membership. Buys remaining in the queues
 * after all Merges are processed are flagged as "unmerged".
 */

export interface AnnotatedBuy {
  _id: string
  ts: string
  mode: string
  side: string          // "YES" | "NO"
  price: number
  size: number          // original size from the event
  consumedSize: number  // how much of this buy was consumed by merges
  reason: string
  pairCost: number | null
  costAfter: number
  upQty: number
  upAvg: number
  dnQty: number
  dnAvg: number
  merged: boolean
  mergeGroupIds: number[]  // which merge groups consumed this buy
}

export interface AnnotatedMerge {
  _id: string
  ts: string
  mode: string
  mergeGroupId: number
  pairs: number
  pairCost: number
  profit: number
  txHash: string | null
  upQtyAfter: number
  dnQtyAfter: number
  costAfter: number
  /** IDs of Buy events consumed by this merge */
  consumedBuyIds: string[]
}

export interface RoundSummary {
  market: string
  mode: string
  roundStart: string | null
  roundEnd: any | null
  buys: AnnotatedBuy[]
  merges: AnnotatedMerge[]
  errors: any[]
  totalBuys: number
  totalMerges: number
  totalProfit: number
  unmergedYes: number
  unmergedNo: number
}

interface QueueEntry {
  buyId: string
  remaining: number  // shares remaining to be consumed
  buyRef: AnnotatedBuy
}

export function processRoundEvents(events: any[]): RoundSummary {
  const yesQueue: QueueEntry[] = []
  const noQueue: QueueEntry[] = []
  const buys: AnnotatedBuy[] = []
  const merges: AnnotatedMerge[] = []
  const errors: any[] = []
  let roundStart: string | null = null
  let roundEnd: any | null = null
  let market = ''
  let mode = ''
  let mergeGroupCounter = 0

  for (const evt of events) {
    const data = evt.data || {}
    if (!market && data.market) market = data.market
    if (!mode && evt.mode) mode = evt.mode

    switch (evt.event) {
      case 'RoundStart': {
        roundStart = evt.ts
        break
      }

      case 'Buy': {
        const buy: AnnotatedBuy = {
          _id: String(evt._id),
          ts: evt.ts,
          mode: evt.mode,
          side: data.side,
          price: data.price,
          size: data.size,
          consumedSize: 0,
          reason: data.reason || '',
          pairCost: data.pair_cost ?? null,
          costAfter: data.cost_after,
          upQty: data.up_qty,
          upAvg: data.up_avg,
          dnQty: data.dn_qty,
          dnAvg: data.dn_avg,
          merged: false,
          mergeGroupIds: [],
        }
        buys.push(buy)

        const queue = data.side === 'YES' ? yesQueue : noQueue
        queue.push({
          buyId: buy._id,
          remaining: data.size,
          buyRef: buy,
        })
        break
      }

      case 'Merge': {
        mergeGroupCounter++
        const groupId = mergeGroupCounter
        const pairsToConsume = data.pairs
        const consumedBuyIds: string[] = []

        // Consume from YES queue (FIFO)
        let remainingYes = pairsToConsume
        while (remainingYes > 0.001 && yesQueue.length > 0) {
          const front = yesQueue[0]
          const take = Math.min(front.remaining, remainingYes)
          front.remaining -= take
          front.buyRef.consumedSize += take
          front.buyRef.mergeGroupIds.push(groupId)
          remainingYes -= take
          if (!consumedBuyIds.includes(front.buyId)) {
            consumedBuyIds.push(front.buyId)
          }
          if (front.remaining < 0.001) {
            front.buyRef.merged = true
            yesQueue.shift()
          }
        }

        // Consume from NO queue (FIFO)
        let remainingNo = pairsToConsume
        while (remainingNo > 0.001 && noQueue.length > 0) {
          const front = noQueue[0]
          const take = Math.min(front.remaining, remainingNo)
          front.remaining -= take
          front.buyRef.consumedSize += take
          front.buyRef.mergeGroupIds.push(groupId)
          remainingNo -= take
          if (!consumedBuyIds.includes(front.buyId)) {
            consumedBuyIds.push(front.buyId)
          }
          if (front.remaining < 0.001) {
            front.buyRef.merged = true
            noQueue.shift()
          }
        }

        const merge: AnnotatedMerge = {
          _id: String(evt._id),
          ts: evt.ts,
          mode: evt.mode,
          mergeGroupId: groupId,
          pairs: data.pairs,
          pairCost: data.pair_cost,
          profit: data.profit,
          txHash: data.tx_hash ?? null,
          upQtyAfter: data.up_qty_after,
          dnQtyAfter: data.dn_qty_after,
          costAfter: data.cost_after,
          consumedBuyIds,
        }
        merges.push(merge)
        break
      }

      case 'RoundEnd': {
        roundEnd = {
          ts: evt.ts,
          hedgedQty: data.hedged_qty,
          upQty: data.up_qty,
          upAvg: data.up_avg,
          dnQty: data.dn_qty,
          dnAvg: data.dn_avg,
          pairCost: data.pair_cost,
          totalCost: data.total_cost,
          pnl: data.pnl,
          buys: data.buys,
          merges: data.merges,
          outcome: data.outcome,
        }
        break
      }

      case 'Error': {
        errors.push({
          _id: String(evt._id),
          ts: evt.ts,
          message: data.message,
          context: data.context,
        })
        break
      }
    }
  }

  // Mark partially consumed buys that still have remaining shares
  for (const entry of [...yesQueue, ...noQueue]) {
    if (entry.remaining > 0.001) {
      // This buy has unmerged shares — don't mark as fully merged
      entry.buyRef.merged = false
    }
  }

  const totalProfit = merges.reduce((sum, m) => sum + m.profit, 0)
  const unmergedYes = yesQueue.reduce((sum, e) => sum + e.remaining, 0)
  const unmergedNo = noQueue.reduce((sum, e) => sum + e.remaining, 0)

  return {
    market,
    mode,
    roundStart,
    roundEnd,
    buys,
    merges,
    errors,
    totalBuys: buys.length,
    totalMerges: merges.length,
    totalProfit,
    unmergedYes,
    unmergedNo,
  }
}
