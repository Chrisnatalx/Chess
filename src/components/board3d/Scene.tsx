'use client'

import { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three'
// Import solo de tipos: activa la extensión de JSX.IntrinsicElements que
// @react-three/fiber declara sobre 'react' (<mesh>, <group>, etc.). Ver la
// nota equivalente en Piece.tsx / BoardMesh.tsx.
import type {} from '@react-three/fiber'
import { BoardMesh, squareToPosition } from './BoardMesh'
import { Piece } from './Piece'
import type { PieceKind } from './pieceGeometry'
import type { Color } from '@/core/match-state'

export type ScenePiece = { square: string; type: PieceKind; color: Color }

type Props = {
  pieces: ScenePiece[]
  selected: string | null
  legalDestinations: string[]
  orientation: Color
  onSquareClick: (square: string) => void
}

const CAM_WHITE: [number, number, number] = [0, 9.8, 11.6]
const CAM_BLACK: [number, number, number] = [0, 9.8, -11.6]

/**
 * Convierte un punto del mundo (x, z) sobre el plano del tablero en la
 * casilla algebraica más cercana. Es la inversa de `squareToPosition`.
 * Se recorta a [0,7] por si el clic cae fuera del tablero (por ejemplo,
 * sobre el marco de madera).
 */
function squareFromPoint(x: number, z: number): string {
  const file = Math.max(0, Math.min(7, Math.round(x + 3.5)))
  const rank = Math.max(0, Math.min(7, Math.round(3.5 - z)))
  return `${String.fromCharCode(97 + file)}${rank + 1}`
}

/**
 * Cámara orbitable que arranca del lado de quien orienta el tablero:
 * blancas ven desde +z, negras desde -z. Igual criterio que Board2D, pero
 * en 3D la orientación es una posición de cámara en vez de un flip de
 * coordenadas.
 */
function CameraRig({ orientation }: { orientation: Color }) {
  const camRef = useRef<ThreePerspectiveCamera>(null)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const pos = orientation === 'w' ? CAM_WHITE : CAM_BLACK
    const aspect = size.width / size.height
    // En pantallas angostas (celular en vertical) un FOV vertical fijo
    // recorta los archivos a y h porque el FOV horizontal efectivo se
    // angosta con el aspect ratio. Alejamos la cámara (mismo ángulo, más
    // lejos) para que entre el tablero completo sin distorsionar la
    // perspectiva.
    const portraitFactor = aspect < 1 ? Math.min(1.35, 1 / aspect) : 1
    if (camRef.current) {
      camRef.current.position.set(pos[0] * portraitFactor, pos[1] * portraitFactor, pos[2] * portraitFactor)
      camRef.current.lookAt(0, 0, 0)
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }, [orientation, size])

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault fov={38} position={CAM_WHITE} near={0.1} far={50} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={[0, 0, 0]}
      />
    </>
  )
}

/**
 * El punto crítico de esta tarea.
 *
 * Es un plano invisible del tamaño del tablero, a la altura de las
 * casillas. Ninguna pieza escucha `onClick` (más abajo, `Piece` sólo
 * recibe `onPointerOver`/`onPointerOut` para el cursor): ningún clic
 * detiene la propagación antes de llegar acá, así que la casilla elegida
 * se calcula siempre por geometría del plano, ignorando por completo qué
 * pieza haya en el medio del camino visual — tanto para elegir destino
 * como para seleccionar una pieza en primer lugar.
 *
 * Se posiciona un poco por encima de las 64 casillas de BoardMesh
 * (y=0.03 en su cara superior) para ganarles la distancia al rayo, así
 * el clic no dispara dos veces (una acá y otra en la casilla de abajo).
 *
 * Por qué el plano decide también la selección inicial, y no sólo el
 * destino (que es lo único que pedía la primera versión de este
 * archivo): probado a mano con Playwright contra el ángulo de cámara
 * por defecto, seleccionar d2 o e2 apuntando al "suelo" de esa casilla
 * (el caso exacto que describe el brief) no seleccionaba nada. La razón:
 * con las piezas escuchando `onClick` en modo selección, el rayo
 * golpeaba primero la dama (d1) o el rey (e1) — las piezas más altas del
 * tablero, justo delante en la misma columna — y como esas piezas no
 * tienen jugadas legales en la posición inicial, `destinosLegales`
 * devolvía `[]` y no pasaba nada. Para torre/caballo/alfil (a2, b2, c2)
 * el bug no se notaba porque esas piezas son más bajas y no llegan a
 * cubrir el píxel del "suelo" de la fila 2 desde este ángulo. El límite
 * físico es real (una pieza sólida en el camino del rayo lo ocluye), así
 * que la única forma confiable de no depender de la altura de la pieza
 * que esté delante es no dejar que ninguna pieza intercepte el clic:
 * de ahí que el plano quede siempre montado, no sólo con una pieza ya
 * elegida.
 */
function ClickPlane({ onSquareClick }: { onSquareClick: (square: string) => void }) {
  return (
    <mesh
      position={[0, 0.04, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onClick={(e) => {
        e.stopPropagation()
        onSquareClick(squareFromPoint(e.point.x, e.point.z))
      }}
    >
      <planeGeometry args={[9.2, 9.2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  )
}

export default function Scene({ pieces, selected, legalDestinations, orientation, onSquareClick }: Props) {
  return (
    <Canvas shadows dpr={[1, 2]} style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#20232a']} />
      <fog attach="fog" args={['#20232a', 16, 34]} />

      <CameraRig orientation={orientation} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cfd8e3', '#2a2015', 0.4]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0015}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.35} />

      <BoardMesh selected={selected} legalDestinations={legalDestinations} onSquareClick={onSquareClick} />

      {pieces.map((p) => {
        const [x, z] = squareToPosition(p.square)
        return (
          <group key={p.square} position={[x, 0.06, z]}>
            {/* Sin onClick a propósito: ver el comentario de ClickPlane.
                La pieza sólo aporta el cursor de mano al pasar por
                encima; quién decide la casilla clicada es siempre el
                plano. */}
            <Piece kind={p.type} color={p.color} selected={selected === p.square} />
          </group>
        )
      })}

      <ClickPlane onSquareClick={onSquareClick} />
    </Canvas>
  )
}
