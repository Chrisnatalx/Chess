'use client'

import { Chessboard } from 'react-chessboard'
import { applyMove } from '@/core/game'
import type { Color } from '@/core/match-state'

type Props = {
  fen: string
  /** Historial en SAN. Necesario para validar en el cliente antes de enviar. */
  history: string[]
  orientation: Color
  puedeMover: boolean
  onMove: (from: string, to: string, promotion?: string) => void
}

export function Board({ fen, history, orientation, puedeMover, onMove }: Props) {
  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation === 'w' ? 'white' : 'black',
        allowDragging: puedeMover,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          // targetSquare es null cuando se suelta la pieza fuera del tablero.
          if (!targetSquare || !puedeMover) return false

          // Validación optimista: se rechaza acá lo que el servidor rechazaría,
          // así la pieza vuelve a su casilla al instante en vez de parpadear
          // cuando llega la corrección del servidor.
          if (applyMove(history, { from: sourceSquare, to: targetSquare })) {
            onMove(sourceSquare, targetSquare)
            return true
          }

          // Un peón que llega a la última fila necesita pieza de coronación.
          // Se corona a dama sin preguntar; elegir otra pieza es una mejora
          // posterior, no parte de este hito.
          if (applyMove(history, { from: sourceSquare, to: targetSquare, promotion: 'q' })) {
            onMove(sourceSquare, targetSquare, 'q')
            return true
          }

          return false
        },
      }}
    />
  )
}
