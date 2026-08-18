import type { MatchState } from '@/core/match-state'

export interface MatchStore {
  get(id: string): Promise<MatchState | null>
  put(state: MatchState): Promise<void>
}
