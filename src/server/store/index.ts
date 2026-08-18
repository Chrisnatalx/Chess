import { MemoryStore } from './memory'
import type { MatchStore } from './types'

let instancia: MatchStore | null = null

/**
 * Por ahora siempre en memoria. La Task 6 agrega Redis acá.
 */
export function getStore(): MatchStore {
  if (!instancia) instancia = new MemoryStore()
  return instancia
}
