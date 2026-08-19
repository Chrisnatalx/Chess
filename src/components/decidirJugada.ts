import { applyMove } from '@/core/game'

/**
 * Decide qué jugada mandar al servidor, o null si el intento es ilegal.
 * Validación optimista compartida por los dos tableros: se rechaza acá lo que
 * el servidor rechazaría, para que la pieza vuelva a su casilla al instante.
 */
export function decidirJugada(
  history: string[],
  from: string,
  to: string,
): { from: string; to: string; promotion?: string } | null {
  if (applyMove(history, { from, to })) return { from, to }
  // Un peón que llega a la última fila necesita pieza de coronación: chess.js
  // no asume dama y sin el campo la jugada es ilegal. Se corona a dama sin
  // preguntar; elegir otra pieza es trabajo posterior.
  if (applyMove(history, { from, to, promotion: 'q' })) return { from, to, promotion: 'q' }
  return null
}
