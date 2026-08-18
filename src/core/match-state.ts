export type Color = 'w' | 'b'
export type PlayerKind = 'human' | 'llm' | 'engine'

/** `token` es el secreto que identifica a un jugador humano. null = asiento libre. */
export type PlayerSlot = { kind: PlayerKind; token: string | null; label: string }

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
}

/** Vista pública: sin los tokens secretos de los jugadores. */
export type PublicPlayer = { kind: PlayerKind; label: string; taken: boolean }

export type PublicMatch = Omit<MatchState, 'players'> & {
  players: { w: PublicPlayer; b: PublicPlayer }
}

export function toPublic(state: MatchState): PublicMatch {
  const strip = (s: PlayerSlot) => ({ kind: s.kind, label: s.label, taken: s.token !== null })
  return { ...state, players: { w: strip(state.players.w), b: strip(state.players.b) } }
}
