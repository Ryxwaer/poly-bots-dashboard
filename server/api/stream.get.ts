import { getEventsCollection } from '../utils/mongo'
import { ObjectId } from 'mongodb'

/**
 * GET /api/stream?lastId={objectId}
 *
 * Server-Sent Events endpoint. Polls MongoDB every 3s for new documents
 * and pushes them to the client.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  let lastId = query.lastId as string | undefined

  // Set SSE headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const col = await getEventsCollection()

  // If no lastId, get the latest doc ID as starting point
  if (!lastId) {
    const latest = await col.findOne({}, { sort: { _id: -1 }, projection: { _id: 1 } })
    if (latest) {
      lastId = String(latest._id)
    }
  }

  const res = event.node.res

  const sendSSE = (eventName: string, data: any) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Send initial connected event
  sendSSE('connected', { ts: new Date().toISOString() })

  // Poll loop
  const interval = setInterval(async () => {
    try {
      const filter: any = {}
      if (lastId) {
        try {
          filter._id = { $gt: new ObjectId(lastId) }
        } catch {
          // Invalid ObjectId, skip filter
        }
      }

      const newDocs = await col
        .find(filter)
        .sort({ _id: 1 })
        .limit(100)
        .toArray()

      if (newDocs.length > 0) {
        lastId = String(newDocs[newDocs.length - 1]._id)

        for (const doc of newDocs) {
          sendSSE('event', {
            _id: String(doc._id),
            event: doc.event,
            data: doc.data,
            ts: doc.ts,
            mode: doc.mode,
          })
        }
      }

      // Heartbeat
      sendSSE('heartbeat', { ts: new Date().toISOString() })
    } catch (err: any) {
      sendSSE('error', { message: err.message })
    }
  }, 3000)

  // Cleanup when client disconnects
  event.node.req.on('close', () => {
    clearInterval(interval)
  })

  // Keep the connection open by not returning
  // Use a never-resolving promise
  await new Promise(() => {})
})
