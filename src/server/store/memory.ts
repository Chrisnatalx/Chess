import type { MatchState } from '@/core/match-state'
import type { MatchStore } from './types'

/**
 * Almacén en memoria. Sirve para pruebas y desarrollo local.
 * En Vercel NO sirve: cada invocación puede caer en otra instancia.
 */
export class MemoryStore implements MatchStore {
  private partidas = new Map<string, string>()

  async get(id: string): Promise<MatchState | null> {
    const crudo = this.partidas.get(id)
    return crudo ? (JSON.parse(crudo) as MatchState) : null
  }

  async put(state: MatchState): Promise<void> {
    // Se serializa al guardar para imitar a Redis: quien lea recibe una
    // copia y no puede mutar el estado guardado por accidente.
    this.partidas.set(state.id, JSON.stringify(state))
  }
}
