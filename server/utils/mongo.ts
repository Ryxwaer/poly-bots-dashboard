import { MongoClient, type Db, type Collection, type Document } from 'mongodb'

let _client: MongoClient | null = null
let _db: Db | null = null

const DB_NAME = 'poly'
const DEFAULT_COLLECTION = 'gabagool_events'

export async function getMongoClient(): Promise<MongoClient> {
  if (_client) return _client

  const config = useRuntimeConfig()
  const uri = config.mongoUri
  if (!uri) {
    throw new Error('MONGO_URI not configured in runtimeConfig')
  }

  _client = new MongoClient(uri)
  await _client.connect()
  return _client
}

export async function getDb(): Promise<Db> {
  if (_db) return _db
  const client = await getMongoClient()
  _db = client.db(DB_NAME)
  return _db
}

export async function getEventsCollection(): Promise<Collection<Document>> {
  const db = await getDb()
  const config = useRuntimeConfig()
  const collectionName = config.mongoCollection || DEFAULT_COLLECTION
  return db.collection(collectionName)
}
