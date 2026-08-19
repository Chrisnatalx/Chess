import type { Color } from '@/core/match-state'

/**
 * Contrato que cumplen las dos implementaciones de tablero. Ninguna sabe nada
 * del servidor: reciben la posición y avisan hacia arriba cuando el jugador
 * intenta una jugada.
 */
export type BoardProps = {
  fen: string
  /** Historial en SAN. Necesario para validar en el cliente antes de enviar. */
  history: string[]
  orientation: Color
  puedeMover: boolean
  onMove: (from: string, to: string, promotion?: string) => void
}
