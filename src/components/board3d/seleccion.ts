import type { Square } from 'chess.js'
import { replay } from '@/core/game'

const PATRON_CASILLA = /^[a-h][1-8]$/

// Guardia de tipo en vez de `desde as Square`: `desde` llega como `string`
// genérico (viene de un click 3D, no de una casilla ya validada), y el
// contrato del equipo prohíbe los `as` para forzar al compilador. Esta
// función SÍ demuestra en runtime que el valor pertenece a la unión antes
// de que TypeScript lo trate como tal.
function esCasilla(valor: string): valor is Square {
  return PATRON_CASILLA.test(valor)
}

/**
 * Casillas a las que la pieza de `desde` puede moverse legalmente.
 * Se usa para resaltar destinos al seleccionar una pieza en el tablero 3D.
 */
export function destinosLegales(history: string[], desde: string): string[] {
  if (!esCasilla(desde)) return []
  // Misma reconstrucción que el resto de la base (`@/core/game`), no una
  // copia propia: dos loops idénticos divergiendo en el manejo de errores
  // es exactamente el tipo de duplicación que después rompe en silencio.
  const chess = replay(history)
  return chess.moves({ square: desde, verbose: true }).map((m) => m.to)
}
