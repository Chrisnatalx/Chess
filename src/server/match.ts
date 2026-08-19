import { applyMove, fenOf, turnOf, outcomeOf } from '@/core/game'
import { SCHEMA_VERSION } from '@/core/match-state'
import type { Color, MatchState } from '@/core/match-state'
import type { MatchStore } from './store/types'

export type Deps = {
  newId: () => string
  newToken: () => string
  now: () => number
}

export const defaultDeps: Deps = {
  newId: () => crypto.randomUUID(),
  newToken: () => crypto.randomUUID(),
  now: () => Date.now(),
}

export type CreateResult = { state: MatchState; token: string }
export type JoinResult = { state: MatchState; token: string; color: Color }

export type MoveError =
  | 'not_found' | 'not_your_turn' | 'stale_ply'
  | 'illegal_move' | 'not_active' | 'bad_token' | 'conflict'

export type MoveRequest = {
  token: string
  ply: number
  from: string
  to: string
  promotion?: string
}

export async function createMatch(store: MatchStore, deps: Deps): Promise<CreateResult> {
  const token = deps.newToken()
  const state: MatchState = {
    id: deps.newId(),
    schema: SCHEMA_VERSION,
    history: [],
    fen: fenOf([]),
    ply: 0,
    players: {
      w: { kind: 'human', token, label: 'Blancas', open: false },
      b: { kind: 'human', token: null, label: 'Negras', open: true },
    },
    status: 'waiting',
    result: null,
    reason: null,
    createdAt: deps.now(),
    version: 0,
  }
  await store.put(state)
  return { state, token }
}

export async function joinMatch(
  store: MatchStore,
  id: string,
  deps: Deps = defaultDeps,
): Promise<JoinResult | 'not_found' | 'full' | 'conflict'> {
  const state = await store.get(id)
  if (!state) return 'not_found'
  if (!state.players.b.open) return 'full'

  const token = deps.newToken()
  const siguiente: MatchState = {
    ...state,
    players: { ...state.players, b: { ...state.players.b, token, open: false } },
    status: 'active',
    version: state.version + 1,
  }
  const ok = await store.putIfVersion(siguiente, state.version)
  if (!ok) return 'conflict'
  return { state: siguiente, token, color: 'b' }
}

function colorDelToken(state: MatchState, token: string): Color | null {
  if (state.players.w.token === token) return 'w'
  if (state.players.b.token === token) return 'b'
  return null
}

export async function submitMove(
  store: MatchStore,
  id: string,
  req: MoveRequest,
): Promise<MatchState | MoveError> {
  const state = await store.get(id)
  if (!state) return 'not_found'
  if (state.status !== 'active') return 'not_active'

  const color = colorDelToken(state, req.token)
  if (color === null) return 'bad_token'

  // El ply se compara antes que el turno: si el cliente venía atrasado,
  // el error preciso es que está desactualizado, no que no le toca.
  if (req.ply !== state.ply) return 'stale_ply'
  if (turnOf(state.history) !== color) return 'not_your_turn'

  const aplicada = applyMove(state.history, {
    from: req.from, to: req.to, promotion: req.promotion,
  })
  if (aplicada === null) return 'illegal_move'

  const fin = outcomeOf(aplicada.history)
  const siguiente: MatchState = {
    ...state,
    history: aplicada.history,
    fen: aplicada.fen,
    ply: aplicada.history.length,
    status: fin.over ? 'finished' : 'active',
    result: fin.result,
    reason: fin.reason,
    version: state.version + 1,
  }
  const ok = await store.putIfVersion(siguiente, state.version)
  if (!ok) return 'conflict'
  return siguiente
}
