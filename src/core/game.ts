import { Chess } from 'chess.js'

export type MoveInput = { from: string; to: string; promotion?: string }

export type Outcome = {
  over: boolean
  result: '1-0' | '0-1' | '1/2-1/2' | null
  reason: string | null
}

export type AppliedMove = { history: string[]; fen: string; san: string }

/**
 * Reconstruye la partida desde el historial. Es la fuente de verdad:
 * la repetición triple y la regla de 50 jugadas no se pueden derivar
 * de un FEN suelto.
 */
function replay(history: string[]): Chess {
  const chess = new Chess()
  for (const san of history) chess.move(san)
  return chess
}

export function legalMoves(history: string[]): string[] {
  return replay(history).moves()
}

export function fenOf(history: string[]): string {
  return replay(history).fen()
}

export function turnOf(history: string[]): 'w' | 'b' {
  return replay(history).turn()
}

export function applyMove(history: string[], move: MoveInput): AppliedMove | null {
  const chess = replay(history)
  try {
    const applied = chess.move(move)
    return { history: [...history, applied.san], fen: chess.fen(), san: applied.san }
  } catch {
    // chess.js 1.x lanza excepción con jugadas ilegales. Acá se traduce
    // a null porque para el árbitro "ilegal" es un caso esperado, no un fallo.
    return null
  }
}

export function outcomeOf(history: string[]): Outcome {
  const chess = replay(history)
  if (!chess.isGameOver()) return { over: false, result: null, reason: null }

  if (chess.isCheckmate()) {
    // El turno es de quien recibió el mate, así que gana el otro.
    return { over: true, result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
  }
  if (chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' }
  if (chess.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'threefold' }
  if (chess.isInsufficientMaterial()) {
    return { over: true, result: '1/2-1/2', reason: 'insufficient_material' }
  }
  return { over: true, result: '1/2-1/2', reason: 'fifty_move' }
}
