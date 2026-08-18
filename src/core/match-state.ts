export type Color = 'w' | 'b'
export type PlayerKind = 'human' | 'llm' | 'engine'

/**
 * `token` es el secreto que identifica a un jugador humano. null = todavía
 * no se presentó nadie con ese secreto.
 * `open` es independiente de `token`: significa "este asiento espera a que
 * un humano lo reclame". Un bot (llm/engine) ocupa el asiento con
 * `open: false` sin tener token — si no fuera por este campo, un asiento
 * de bot con `token: null` se vería idéntico a uno vacío y cualquiera con
 * el link de invitación podría desplazarlo.
 */
export type PlayerSlot = { kind: PlayerKind; token: string | null; label: string; open: boolean }

export type MatchStatus = 'waiting' | 'active' | 'finished'

export type MatchState = {
  id: string
  /** Jugadas en SAN. Fuente de verdad de la partida. */
  history: string[]
  /** Desnormalizado desde `history` para comodidad del cliente. */
  fen: string
  /** Cantidad de medias jugadas aplicadas. Igual a history.length. */
  ply: number
  players: { w: PlayerSlot; b: PlayerSlot }
  status: MatchStatus
  result: '1-0' | '0-1' | '1/2-1/2' | null
  reason: string | null
  createdAt: number
  /** Para control de concurrencia optimista: ver `MatchStore.putIfVersion`. */
  version: number
}

/** Vista pública: sin los tokens secretos de los jugadores. */
export type PublicPlayer = { kind: PlayerKind; label: string; taken: boolean; open: boolean }

export type PublicMatch = Omit<MatchState, 'players'> & {
  players: { w: PublicPlayer; b: PublicPlayer }
}

export function toPublic(state: MatchState): PublicMatch {
  const strip = (s: PlayerSlot) => (
    { kind: s.kind, label: s.label, taken: s.token !== null, open: s.open }
  )
  return { ...state, players: { w: strip(state.players.w), b: strip(state.players.b) } }
}
