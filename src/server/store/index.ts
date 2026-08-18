import { MemoryStore } from './memory'
import { RedisStore } from './redis'
import type { MatchStore } from './types'

let instancia: MatchStore | null = null

/**
 * Redis si hay credenciales, memoria si no.
 * En Vercel el almacén en memoria NO funciona: cada invocación puede
 * caer en otra instancia y la partida se pierde entre jugadas.
 */
export function getStore(): MatchStore {
  if (instancia) return instancia
  const hayRedis =
    !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  instancia = hayRedis ? new RedisStore() : new MemoryStore()
  return instancia
}
