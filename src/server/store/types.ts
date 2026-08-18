import type { MatchState } from '@/core/match-state'

export interface MatchStore {
  get(id: string): Promise<MatchState | null>
  put(state: MatchState): Promise<void>
  /**
   * Escribe solo si la versión almacenada sigue siendo `expectedVersion`.
   * Devuelve false si otro escritor se adelantó, sin tocar lo guardado.
   */
  putIfVersion(state: MatchState, expectedVersion: number): Promise<boolean>
}
