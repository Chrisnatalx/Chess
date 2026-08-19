'use client'

import { Chessboard } from 'react-chessboard'
import { decidirJugada } from './decidirJugada'
import type { BoardProps } from './boardContract'

export function Board2D({ fen, history, orientation, puedeMover, onMove }: BoardProps) {
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
          const jugada = decidirJugada(history, sourceSquare, targetSquare)
          if (!jugada) return false

          onMove(jugada.from, jugada.to, jugada.promotion)
          return true
        },
      }}
    />
  )
}
