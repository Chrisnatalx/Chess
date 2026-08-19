'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
// Import solo de tipos: activa la extensión de JSX.IntrinsicElements que
// @react-three/fiber declara sobre 'react' (<mesh>, <group>, etc.). Ver
// la nota equivalente en Piece.tsx.
import type {} from '@react-three/fiber'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

export function squareToPosition(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97 // 0..7
  const rank = Number(square[1]) - 1 // 0..7
  return [file - 3.5, 3.5 - rank]
}

function useLabelTexture(text: string, color: string) {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128)
      ctx.font = 'bold 88px system-ui, sans-serif'
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 64, 68)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }, [text, color])
}

function Label({ text, position }: { text: string; position: [number, number, number] }) {
  const texture = useLabelTexture(text, '#e8e2d4')
  return (
    <sprite position={position} scale={[0.36, 0.36, 0.36]}>
      <spriteMaterial attach="material" map={texture} transparent depthWrite={false} />
    </sprite>
  )
}

type SquareProps = {
  square: string
  dark: boolean
  isSelected: boolean
  isLegalDestination: boolean
  onClick: (square: string) => void
}

function Square({ square, dark, isSelected, isLegalDestination, onClick }: SquareProps) {
  const [x, z] = squareToPosition(square)
  const color = dark ? '#5c3d28' : '#e3cda3'

  return (
    <group position={[x, 0, z]}>
      <mesh
        receiveShadow
        position={[0, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onClick(square)
        }}
      >
        <boxGeometry args={[1, 0.06, 1]} />
        <meshStandardMaterial color={color} roughness={0.75} metalness={0.02} />
      </mesh>
      {isSelected && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.94, 0.94]} />
          <meshBasicMaterial color="#5b8def" transparent opacity={0.55} />
        </mesh>
      )}
      {isLegalDestination && !isSelected && (
        <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.28, 24]} />
          <meshBasicMaterial color="#4caf50" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  )
}

type Props = {
  selected: string | null
  legalDestinations: string[]
  onSquareClick: (square: string) => void
}

/** Tablero: 64 casillas clickeables + marco + etiquetas de coordenadas. */
export function BoardMesh({ selected, legalDestinations, onSquareClick }: Props) {
  const squares = useMemo(() => {
    const list: { square: string; dark: boolean }[] = []
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const square = `${FILES[f]}${r + 1}`
        const dark = (f + r) % 2 === 0
        list.push({ square, dark })
      }
    }
    return list
  }, [])

  const legalSet = useMemo(() => new Set(legalDestinations), [legalDestinations])

  return (
    <group>
      {/* Marco de madera. Queda un escalón por debajo de las casillas
          (top en y=-0.03) para no compartir plano con ellas (top en
          y=+0.03) y evitar z-fighting. */}
      <mesh receiveShadow position={[0, -0.06, 0]}>
        <boxGeometry args={[9.2, 0.06, 9.2]} />
        <meshStandardMaterial color="#3b2a1d" roughness={0.6} metalness={0.05} />
      </mesh>

      {squares.map(({ square, dark }) => (
        <Square
          key={square}
          square={square}
          dark={dark}
          isSelected={selected === square}
          isLegalDestination={legalSet.has(square)}
          onClick={onSquareClick}
        />
      ))}

      {/* Etiquetas de archivo (a-h) frente a blancas */}
      {FILES.map((file, i) => (
        <Label key={`file-${file}`} text={file} position={[i - 3.5, 0.05, 4.55]} />
      ))}
      {/* Etiquetas de fila (1-8) del lado del enroque largo de blancas */}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((rank) => (
        <Label key={`rank-${rank}`} text={String(rank)} position={[-4.55, 0.05, 3.5 - (rank - 1)]} />
      ))}
    </group>
  )
}
