'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { BackSide, type PerspectiveCamera as ThreePerspectiveCamera } from 'three'
// Import solo de tipos: activa la extensión de JSX.IntrinsicElements que
// @react-three/fiber declara sobre 'react' (<mesh>, <group>, etc.). Ver la
// nota equivalente en Piece.tsx / BoardMesh.tsx.
import type {} from '@react-three/fiber'
import { BoardMesh, squareToPosition } from './BoardMesh'
import { Piece } from './Piece'
import type { PieceKind } from './pieceGeometry'
import type { SquareHit } from './seleccion'
import type { Color } from '@/core/match-state'

export type ScenePiece = { square: string; type: PieceKind; color: Color }

type Props = {
  pieces: ScenePiece[]
  selected: string | null
  hovered: string | null
  legalDestinations: string[]
  orientation: Color
  onSquareClick: (hit: SquareHit) => void
  onSquareHover: (hit: SquareHit | null) => void
}

/**
 * Posición de cámara: elevación ~55° sobre el plano del tablero, a 15.15
 * unidades del centro (una casilla = 1 unidad).
 *
 * La altura no es estética. Con la cámara original — (0, 9.8, 11.6), unos
 * 40° — la silueta de la dama y la del rey se estiran sobre la casilla de
 * adelante hasta z=2.39 y z=2.43, y el centro de d2/e2 está en z=2.50: el
 * rayo de un clic apuntado al centro de esas casillas atravesaba primero la
 * pieza de atrás. Es la causa raíz de toda la ambigüedad "¿pieza o
 * casilla?"; medido con la geometría real (LatheGeometry + remates) y un
 * raycaster de three, no estimado.
 *
 * A 55° las mismas siluetas llegan sólo hasta z=2.77 (dama) y z=2.86 (rey):
 * ninguna pieza de la fila 1 tapa ya el centro de ninguna casilla de la fila
 * 2, con un margen de ~0.27 casillas en el peor caso. Sigue siendo una
 * vista claramente en perspectiva (90° sería cenital y aplanaría la escena).
 */
const CAM_WHITE: [number, number, number] = [0, 12.4, 8.7]
const CAM_BLACK: [number, number, number] = [0, 12.4, -8.7]
const DRAG_THRESHOLD_PX = 5

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
 * `OrbitControls` y el clic de R3F comparten el mismo botón del mouse:
 * sin este chequeo, un gesto de arrastre para orbitar la cámara que
 * empieza y termina sobre el tablero dispara un clic en el punto donde
 * se soltó — probado a mano: con e2 seleccionado, arrastrar la cámara
 * empezando y terminando sobre e4 jugaba e2-e4 solo, sin que el jugador
 * quisiera mover nada.
 *
 * Se escucha en el propio `<canvas>` del DOM, no con `onPointerDown` de
 * React Three Fiber sobre algún mesh: hace falta la distancia en
 * píxeles de pantalla entre `pointerdown` y `pointerup`
 * independientemente de qué objeto 3D (si alguno) haya debajo del
 * cursor en cada momento, y de si el cursor pasó por el vacío durante el
 * arrastre.
 */
function useWasDrag(): () => boolean {
  const draggedRef = useRef(false)
  const downRef = useRef<{ x: number; y: number } | null>(null)
  const { gl } = useThree()

  useEffect(() => {
    const el = gl.domElement
    const onPointerDown = (e: PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e: PointerEvent) => {
      const down = downRef.current
      draggedRef.current = down !== null && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD_PX
      downRef.current = null
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
    }
  }, [gl])

  return useCallback(() => draggedRef.current, [])
}

/**
 * Esfera enorme, invisible y vuelta del revés (`BackSide`) alrededor de toda
 * la escena. No se ve ni se puede clickear (no tiene `onClick`); su único
 * trabajo es ser SIEMPRE el último objeto que el rayo de un `pointermove`
 * atraviesa, esté el puntero sobre una pieza, sobre una casilla, sobre el
 * marco o sobre el fondo vacío.
 *
 * Eso la convierte en el punto donde se cierra la lectura del hover: para
 * cuando le toca a ella, la pieza y la casilla que el mismo movimiento tocó
 * ya quedaron anotadas, así que puede reportar el par completo — o `null` si
 * el puntero no está sobre ninguna casilla, que es exactamente cuando un
 * clic ahí tampoco haría nada.
 */
function HoverSink({ onSettle }: { onSettle: () => void }) {
  return (
    <mesh onPointerMove={onSettle}>
      <sphereGeometry args={[40, 16, 12]} />
      <meshBasicMaterial side={BackSide} transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

type ContentsProps = Omit<Props, 'orientation'>

/**
 * El punto crítico de esta tarea.
 *
 * Las piezas SÍ escuchan `onClick` y `onPointerMove`, pero nunca detienen la
 * propagación: sólo anotan cuál fue la pieza más cercana a cámara que el
 * rayo atravesó. Quien aporta la otra mitad del dato es siempre la casilla
 * de las 64 de `BoardMesh` que el mismo rayo también toca (BoardMesh está
 * por debajo de toda pieza en `y`, así que sus handlers corren después, con
 * la casilla real — no una calculada — sin que importe qué pieza haya en el
 * medio del camino visual). `Board3D` recibe las dos y decide con
 * `resolveSquare`; el mismo par alimenta el clic y el resalte de hover, así
 * que lo que se ilumina antes de hacer clic es literalmente sobre lo que el
 * clic va a actuar.
 *
 * Como ninguna pieza detiene la propagación y el marco de madera no tiene
 * ningún handler de clic, un clic fuera de las 64 casillas (sobre el marco,
 * o más allá) no dispara nada — ni `onSquareClick` ni ningún otro efecto —
 * sin necesidad de recortar ni descartar nada a mano.
 */
function SceneContents({ pieces, selected, hovered, legalDestinations, onSquareClick, onSquareHover }: ContentsProps) {
  const wasDrag = useWasDrag()
  const { gl } = useThree()
  const pieceHitRef = useRef<string | null>(null)
  const hoverPieceRef = useRef<string | null>(null)
  const hoverSquareRef = useRef<string | null>(null)

  const handleBoardSquareClick = useCallback(
    (square: string) => {
      const pieceSquare = pieceHitRef.current
      pieceHitRef.current = null
      if (wasDrag()) return
      onSquareClick({ pieceSquare, square })
    },
    [onSquareClick, wasDrag],
  )

  const settleHover = useCallback(() => {
    const square = hoverSquareRef.current
    const pieceSquare = hoverPieceRef.current
    hoverSquareRef.current = null
    hoverPieceRef.current = null
    onSquareHover(square === null ? null : { pieceSquare, square })
  }, [onSquareHover])

  // El puntero puede salir del canvas sin volver a pasar por ninguna casilla
  // (se va a otra parte de la página). Sin esto el resalte quedaría clavado
  // donde estaba.
  useEffect(() => {
    const el = gl.domElement
    const clear = () => onSquareHover(null)
    el.addEventListener('pointerleave', clear)
    return () => el.removeEventListener('pointerleave', clear)
  }, [gl, onSquareHover])

  const handleBoardSquareHover = useCallback((square: string) => {
    if (hoverSquareRef.current === null) hoverSquareRef.current = square
  }, [])

  return (
    <>
      <BoardMesh
        selected={selected}
        hovered={hovered}
        legalDestinations={legalDestinations}
        onSquareClick={handleBoardSquareClick}
        onSquareHover={handleBoardSquareHover}
      />

      {pieces.map((p) => {
        const [x, z] = squareToPosition(p.square)
        return (
          <group key={p.square} position={[x, 0.06, z]}>
            <Piece
              kind={p.type}
              color={p.color}
              selected={selected === p.square}
              onClick={() => {
                // Sin stopPropagation a propósito: la casilla de
                // BoardMesh, debajo, tiene que recibir el clic igual.
                // Sólo se anota la pieza más cercana (la primera en
                // llegar, por eso el chequeo de null: no la pisa una
                // pieza más lejana si por algún ángulo el rayo tocara
                // dos).
                if (pieceHitRef.current === null) pieceHitRef.current = p.square
              }}
              onPointerMove={() => {
                if (hoverPieceRef.current === null) hoverPieceRef.current = p.square
              }}
            />
          </group>
        )
      })}

      <HoverSink onSettle={settleHover} />
    </>
  )
}

export default function Scene({
  pieces,
  selected,
  hovered,
  legalDestinations,
  orientation,
  onSquareClick,
  onSquareHover,
}: Props) {
  return (
    // shadows="percentage" en vez del default (true -> PCFSoftShadowMap):
    // este three.js lo marca deprecado y cae solo a PCFShadowMap, pero
    // logueando la advertencia en cada re-render. Pedirlo directo deja
    // la consola limpia.
    <Canvas shadows="percentage" dpr={[1, 2]} style={{ width: '100%', height: '100%' }}>
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

      <SceneContents
        pieces={pieces}
        selected={selected}
        hovered={hovered}
        legalDestinations={legalDestinations}
        onSquareClick={onSquareClick}
        onSquareHover={onSquareHover}
      />
    </Canvas>
  )
}
