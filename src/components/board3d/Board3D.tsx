'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Chess } from 'chess.js'
import { decidirJugada } from '../decidirJugada'
import type { BoardProps } from '../boardContract'
import { destinosLegales } from './seleccion'
import type { ScenePiece } from './Scene'

// La escena usa @react-three/fiber (WebGL, `document`, etc.), así que no
// puede pre-renderizarse en el servidor.
const Scene = dynamic(() => import('./Scene'), { ssr: false })

/**
 * Tablero 3D: cumple el mismo `BoardProps` que Board2D. La geometría y el
 * raycasting por capas viven en Scene/BoardMesh/Piece; acá vive la
 * máquina de estados de la selección (qué casilla eligió el jugador) y la
 * validación optimista de la jugada, compartida con el tablero 2D vía
 * `decidirJugada`.
 */
export function Board3D({ fen, history, orientation, puedeMover, onMove }: BoardProps) {
  const [rawSelected, setSelected] = useState<string | null>(null)

  // Si deja de poder mover (no es su turno, es espectador, terminó la
  // partida) cualquier selección pendiente queda obsoleta. Se deriva en
  // vez de sincronizarse con un efecto: es un valor calculable a partir
  // de las props actuales, no un estado que necesite sus propios efectos
  // secundarios.
  const selected = puedeMover ? rawSelected : null

  const pieces = useMemo<ScenePiece[]>(() => {
    const chess = new Chess(fen)
    const resultado: ScenePiece[] = []
    for (const fila of chess.board()) {
      for (const casilla of fila) {
        if (casilla) resultado.push({ square: casilla.square, type: casilla.type, color: casilla.color })
      }
    }
    return resultado
  }, [fen])

  const legalDestinations = useMemo(
    () => (selected ? destinosLegales(history, selected) : []),
    [history, selected],
  )

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!puedeMover) return

      if (selected === null) {
        // Nada elegido: sólo selecciona si la casilla tiene alguna jugada
        // legal (pieza propia, de quien tiene el turno, con movimientos).
        if (destinosLegales(history, square).length > 0) setSelected(square)
        return
      }

      if (square === selected) {
        setSelected(null)
        return
      }

      if (legalDestinations.includes(square)) {
        const jugada = decidirJugada(history, selected, square)
        setSelected(null)
        // decidirJugada ya reintentó con coronación a dama; null significa
        // realmente ilegal, y ahí no se llama a onMove.
        if (jugada) onMove(jugada.from, jugada.to, jugada.promotion)
        return
      }

      // Clic en otra casilla mientras había una selección: si tiene
      // jugadas propias, la selección salta ahí; si no, se cancela.
      setSelected(destinosLegales(history, square).length > 0 ? square : null)
    },
    [puedeMover, selected, history, legalDestinations, onMove],
  )

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Scene
        pieces={pieces}
        selected={selected}
        legalDestinations={legalDestinations}
        orientation={orientation}
        onSquareClick={handleSquareClick}
      />
    </div>
  )
}
