'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Chess } from 'chess.js'
import { decidirJugada } from '../decidirJugada'
import type { BoardProps } from '../boardContract'
import { destinosLegales } from './seleccion'
import type { ScenePiece, SquareHit } from './Scene'

// La escena usa @react-three/fiber (WebGL, `document`, etc.), así que no
// puede pre-renderizarse en el servidor.
const Scene = dynamic(() => import('./Scene'), { ssr: false })

/**
 * Qué casilla usar de un clic que puede traer dos candidatas: la pieza
 * que el rayo atravesó más cerca de cámara (si alguna) y la casilla real
 * de `BoardMesh` que el mismo rayo también tocó (ver `SquareHit` en
 * `Scene.tsx`).
 *
 * Preferir siempre la pieza reintroduciría el bug original (una pieza
 * alta delante tapa la de atrás). Preferir siempre la casilla
 * reintroduce dos bugs distintos, medidos a mano con Playwright:
 * - clic en la mitad de arriba de una pieza ya seleccionada
 *   parafrasea a la casilla de la fila siguiente (más lejos de cámara)
 *   en vez de a la propia, así que "deseleccionar tocando la pieza
 *   elegida" termina jugando una jugada;
 * - lo mismo al seleccionar: tocar la corona del rey selecciona el peón
 *   de adelante en vez del rey.
 *
 * La regla que evita ambos sin resucitar el original: la pieza gana
 * sólo cuando
 *   (a) no hay nada elegido todavía y esa pieza tiene alguna jugada
 *       legal, o
 *   (b) la pieza tocada es la que ya está elegida (deseleccionar).
 * En cualquier otro caso gana la casilla. El caso d2/e2 original sigue
 * arreglado porque la dama y el rey no tienen ninguna jugada legal en la
 * posición inicial: (a) no se cumple, y el clic cae en la casilla real.
 */
function resolveSquare({ pieceSquare, square }: SquareHit, selected: string | null, history: string[]): string {
  if (pieceSquare !== null) {
    const piecePreferida =
      (selected === null && destinosLegales(history, pieceSquare).length > 0) || pieceSquare === selected
    if (piecePreferida) return pieceSquare
  }
  return square
}

/**
 * Tablero 3D: cumple el mismo `BoardProps` que Board2D. La geometría y el
 * raycasting por capas viven en Scene/BoardMesh/Piece; acá vive la
 * máquina de estados de la selección (qué casilla eligió el jugador) y la
 * validación optimista de la jugada, compartida con el tablero 2D vía
 * `decidirJugada`.
 */
export function Board3D({ fen, history, orientation, puedeMover, onMove }: BoardProps) {
  // La selección se guarda junto con el `history` para el que es válida.
  // Si `history` cambia (se jugó una jugada, se reinició la partida, se
  // entró a una revancha en el mismo componente montado) y la selección
  // quedó de un `history` anterior, se lee como "nada elegido" en este
  // render — sin useEffect: es un valor derivable de las props actuales,
  // no un estado que necesite sincronizarse con un efecto secundario.
  const [selection, setSelection] = useState<{ forHistory: string[]; square: string } | null>(null)
  const selected = puedeMover && selection !== null && selection.forHistory === history ? selection.square : null

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
    (hit: SquareHit) => {
      if (!puedeMover) return

      const square = resolveSquare(hit, selected, history)

      if (selected === null) {
        // Nada elegido: sólo selecciona si la casilla tiene alguna jugada
        // legal (pieza propia, de quien tiene el turno, con movimientos).
        if (destinosLegales(history, square).length > 0) setSelection({ forHistory: history, square })
        return
      }

      if (square === selected) {
        setSelection(null)
        return
      }

      if (legalDestinations.includes(square)) {
        const jugada = decidirJugada(history, selected, square)
        setSelection(null)
        // decidirJugada ya reintentó con coronación a dama; null significa
        // realmente ilegal, y ahí no se llama a onMove.
        if (jugada) onMove(jugada.from, jugada.to, jugada.promotion)
        return
      }

      // Clic en otra casilla mientras había una selección: si tiene
      // jugadas propias, la selección salta ahí; si no, se cancela.
      setSelection(destinosLegales(history, square).length > 0 ? { forHistory: history, square } : null)
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
