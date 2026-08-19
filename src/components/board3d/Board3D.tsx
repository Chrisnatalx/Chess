'use client'

import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Chess } from 'chess.js'
import { decidirJugada } from '../decidirJugada'
import type { BoardProps } from '../boardContract'
import { destinosLegales, resolveSquare, type SquareHit } from './seleccion'
import type { ScenePiece } from './Scene'

// La escena usa @react-three/fiber (WebGL, `document`, etc.), así que no
// puede pre-renderizarse en el servidor.
const Scene = dynamic(() => import('./Scene'), { ssr: false })

/**
 * Tablero 3D: cumple el mismo `BoardProps` que Board2D. La geometría y el
 * raycasting viven en Scene/BoardMesh/Piece; acá vive la máquina de estados
 * de la selección (qué casilla eligió el jugador, qué casilla resolvería el
 * puntero ahora mismo) y la validación optimista de la jugada, compartida
 * con el tablero 2D vía `decidirJugada`.
 *
 * La ambigüedad "¿pieza o casilla?" se ataca en tres lugares a la vez:
 * - la cámara está lo bastante alta como para que ninguna pieza de la fila
 *   de atrás tape el centro de la casilla de adelante (ver `Scene.tsx`);
 * - `resolveSquare` decide desde la pieza elegida, no desde la tocada (ver
 *   `seleccion.ts`);
 * - el hover resalta, antes de hacer clic, exactamente la casilla sobre la
 *   que el clic va a actuar — misma función, mismo dato de entrada.
 */
export function Board3D({ fen, history, orientation, puedeMover, onMove }: BoardProps) {
  // La selección se guarda junto con la partida para la que es válida.
  // Se compara por VALOR (el SAN concatenado), no por identidad del array:
  // el sondeo de `useMatch` construye un `history` nuevo en cada respuesta
  // aunque el contenido sea idéntico, y con igualdad por referencia eso
  // borraba la selección en medio del turno sin ninguna razón de juego.
  // Si la partida sí avanzó (o se reinició), la clave cambia y la selección
  // vieja se lee como "nada elegido" en este render — sin useEffect: es un
  // valor derivable de las props actuales.
  const [selection, setSelection] = useState<{ forHistory: string; square: string } | null>(null)
  const [hoverHit, setHoverHit] = useState<SquareHit | null>(null)

  const historyKey = useMemo(() => history.join(' '), [history])
  const selected =
    puedeMover && selection !== null && selection.forHistory === historyKey ? selection.square : null

  const { pieces, turno } = useMemo(() => {
    const chess = new Chess(fen)
    const lista: ScenePiece[] = []
    for (const fila of chess.board()) {
      for (const casilla of fila) {
        if (casilla) lista.push({ square: casilla.square, type: casilla.type, color: casilla.color })
      }
    }
    return { pieces: lista, turno: chess.turn() }
  }, [fen])

  // Casillas donde hay una pieza de quien tiene el turno. Cualquiera de
  // ellas se puede elegir, tenga o no jugadas disponibles: elegir un rey
  // ahogado y ver que no se ilumina ningún destino es información honesta;
  // que el clic no haga nada parece que el tablero se colgó.
  const propias = useMemo(
    () => new Set(pieces.filter((p) => p.color === turno).map((p) => p.square)),
    [pieces, turno],
  )

  const legalDestinations = useMemo(
    () => (selected ? destinosLegales(history, selected) : []),
    [history, selected],
  )

  const hovered =
    puedeMover && hoverHit !== null ? resolveSquare(hoverHit, selected, legalDestinations) : null

  const handleSquareHover = useCallback((hit: SquareHit | null) => {
    // Se descarta el hit nuevo si describe lo mismo que el anterior: un
    // pointermove dispara decenas de veces por segundo y sin esto cada uno
    // provocaría un render.
    setHoverHit((prev) => {
      if (prev === null && hit === null) return prev
      if (prev !== null && hit !== null && prev.pieceSquare === hit.pieceSquare && prev.square === hit.square) {
        return prev
      }
      return hit
    })
  }, [])

  const handleSquareClick = useCallback(
    (hit: SquareHit) => {
      if (!puedeMover) return

      const square = resolveSquare(hit, selected, legalDestinations)

      if (selected !== null) {
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
      }

      // Ni deselección ni jugada: la casilla pasa a ser la nueva selección si
      // tiene una pieza de quien mueve, y si no, cancela lo que hubiera.
      setSelection(propias.has(square) ? { forHistory: historyKey, square } : null)
    },
    [puedeMover, selected, legalDestinations, history, historyKey, propias, onMove],
  )

  // El cursor de mano se decide acá, no en cada pieza: lo que importa es si
  // el clic va a hacer algo, y eso depende de la casilla resuelta (que puede
  // no ser la pieza que está debajo del puntero).
  const accionable =
    hovered !== null && (hovered === selected || legalDestinations.includes(hovered) || propias.has(hovered))

  return (
    <div style={{ width: '100%', height: '100%', cursor: accionable ? 'pointer' : 'default' }}>
      <Scene
        pieces={pieces}
        selected={selected}
        hovered={hovered}
        legalDestinations={legalDestinations}
        orientation={orientation}
        onSquareClick={handleSquareClick}
        onSquareHover={handleSquareHover}
      />
    </div>
  )
}
