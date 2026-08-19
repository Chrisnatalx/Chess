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

/**
 * Lo que un puntero sobre el tablero toca a la vez: la casilla real de las
 * 64 de `BoardMesh` que el rayo atravesó, y — si el mismo rayo pasó antes
 * por una pieza — la casilla de esa pieza. Las dos pueden diferir porque en
 * perspectiva una pieza tapa parte de la casilla de atrás.
 */
export type SquareHit = { pieceSquare: string | null; square: string }

/**
 * Sobre qué casilla actúa un clic (o qué casilla resalta el hover) cuando el
 * rayo trae dos candidatas.
 *
 * La regla se decide desde la pieza **elegida**, nunca desde la tocada. En
 * este orden:
 *
 *   1. Si el rayo tocó la pieza que ya está elegida → esa (deseleccionar).
 *   2. Si hay algo elegido y la casilla del plano es un destino legal de esa
 *      selección → esa casilla (mover ahí).
 *   3. Si el rayo tocó alguna pieza → la casilla de esa pieza (elegirla, o
 *      mover la selección a ella).
 *   4. Si no → la casilla del plano.
 *
 * El paso 1 tiene que ir antes que el 2: si no, deseleccionar al rey tocando
 * su corona termina jugando Ke2, porque el rayo que atraviesa la corona cae
 * en e2 y e2 es destino legal del propio rey.
 *
 * Por qué esto y no "¿la pieza tocada tiene alguna jugada legal?" (la regla
 * anterior, que fallaba en las dos direcciones): que una pieza cualquiera
 * tenga movimientos disponibles no dice nada sobre lo que el jugador quiso
 * tocar. "¿La casilla del plano es destino de lo que tengo elegido?" sí
 * describe lo que el jugador está haciendo.
 */
export function resolveSquare(
  { pieceSquare, square }: SquareHit,
  selected: string | null,
  legalDestinations: readonly string[],
): string {
  if (pieceSquare !== null && pieceSquare === selected) return pieceSquare
  if (selected !== null && legalDestinations.includes(square)) return square
  if (pieceSquare !== null) return pieceSquare
  return square
}
