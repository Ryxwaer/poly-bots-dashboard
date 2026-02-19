import { getEventsCollection } from '../utils/mongo'

/**
 * GET /api/markets
 *
 * Returns markets grouped by prefix (e.g., "ethereum-up-or-down").
 * Each group contains rounds sorted by timestamp descending.
 */
export default defineEventHandler(async () => {
  const col = await getEventsCollection()

  // Get all events that have a market field (Buy, Merge, RoundStart, RoundEnd)
  const pipeline = [
    {
      $match: {
        'data.market': { $exists: true, $ne: null },
        event: { $in: ['Buy', 'Merge', 'RoundStart', 'RoundEnd'] },
      },
    },
    {
      $group: {
        _id: '$data.market',
        latestTs: { $max: '$ts' },
        earliestTs: { $min: '$ts' },
        eventCount: { $sum: 1 },
        modes: { $addToSet: '$mode' },
      },
    },
    { $sort: { latestTs: -1 as const } },
  ]

  const rounds = await col.aggregate(pipeline).toArray()

  // Group by prefix — strip the date portion from the slug
  // e.g. "ethereum-up-or-down-february-19-2am-et" → "ethereum-up-or-down"
  const groups: Record<string, any[]> = {}

  for (const round of rounds) {
    const slug = round._id as string
    // Match prefix: everything before the month name
    const prefixMatch = slug.match(/^(.+?)-(january|february|march|april|may|june|july|august|september|october|november|december)-/i)
    const prefix = prefixMatch ? prefixMatch[1] : slug

    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push({
      slug,
      latestTs: round.latestTs,
      earliestTs: round.earliestTs,
      eventCount: round.eventCount,
      modes: round.modes,
    })
  }

  // Sort rounds within each group by latest timestamp descending
  for (const prefix in groups) {
    groups[prefix].sort((a: any, b: any) =>
      new Date(b.latestTs).getTime() - new Date(a.latestTs).getTime()
    )
  }

  return groups
})
