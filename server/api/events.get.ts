import { getEventsCollection } from '../utils/mongo'
import { processRoundEvents } from '../utils/pairing'

/**
 * GET /api/events?market={slug}&mode={production|simulation|all}
 *
 * Returns all events for a specific market round, with merge pairing annotations.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const market = query.market as string
  const mode = (query.mode as string) || 'all'

  if (!market) {
    throw createError({ statusCode: 400, message: 'market query parameter required' })
  }

  const col = await getEventsCollection()

  const filter: any = { 'data.market': market }
  if (mode !== 'all') {
    filter.mode = mode
  }

  const events = await col
    .find(filter)
    .sort({ ts: 1 })
    .toArray()

  // Process events through pairing algorithm
  const summary = processRoundEvents(events)

  return summary
})
