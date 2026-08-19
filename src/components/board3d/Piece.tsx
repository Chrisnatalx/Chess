'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
// Import solo de tipos: activa la extensión de JSX.IntrinsicElements que
// @react-three/fiber declara sobre 'react' (<mesh>, <group>, etc.). Sin
// este import, ningún otro archivo del programa la trae todavía porque
// nada importa @react-three/fiber en tiempo de valor (eso lo hace la
// Task 7 en Scene.tsx) y tsc no la resolvería.
import type {} from '@react-three/fiber'
import {
  pawnGeometry,
  rookGeometry,
  bishopGeometry,
  queenGeometry,
  kingGeometry,
  knightBaseGeometry,
  knightHeadGeometry,
  knightEarGeometry,
  kingCrossVerticalGeometry,
  kingCrossHorizontalGeometry,
  queenCrownPointGeometry,
  rookMerlonGeometry,
  PIECE_HEIGHT,
  type PieceKind,
} from './pieceGeometry'

const WHITE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#f2ead9',
  roughness: 0.35,
  metalness: 0.05,
})
const BLACK_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#2a2320',
  roughness: 0.4,
  metalness: 0.05,
})

type Props = {
  kind: PieceKind
  color: 'w' | 'b'
  selected?: boolean
  onClick?: (e: { stopPropagation: () => void }) => void
}

type MatProps = {
  color: THREE.Color
  roughness: number
  metalness: number
  emissive: string
  emissiveIntensity: number
}

/** Una pieza de ajedrez procedural. Torneada para todo salvo el caballo. */
export function Piece({ kind, color, selected, onClick }: Props) {
  const material = color === 'w' ? WHITE_MATERIAL : BLACK_MATERIAL

  const geometry = useMemo(() => {
    switch (kind) {
      case 'p':
        return pawnGeometry()
      case 'r':
        return rookGeometry()
      case 'b':
        return bishopGeometry()
      case 'q':
        return queenGeometry()
      case 'k':
        return kingGeometry()
      case 'n':
        return null // el caballo se arma con varias piezas, ver abajo
    }
  }, [kind])

  if (kind === 'n') {
    return (
      <KnightMesh
        color={color}
        material={material}
        selected={selected}
        onClick={onClick}
      />
    )
  }

  const matProps = {
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    emissive: selected ? '#5b8def' : '#000000',
    emissiveIntensity: selected ? 0.5 : 0,
  }

  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <mesh geometry={geometry ?? undefined} castShadow receiveShadow>
        <meshStandardMaterial {...matProps} />
      </mesh>

      {kind === 'k' && <KingTopper height={PIECE_HEIGHT.k} matProps={matProps} />}
      {kind === 'q' && <QueenTopper height={PIECE_HEIGHT.q} matProps={matProps} />}
      {kind === 'r' && <RookTopper matProps={matProps} />}
    </group>
  )
}

function KingTopper({
  height,
  matProps,
}: {
  height: number
  matProps: MatProps
}) {
  const vertical = useMemo(() => kingCrossVerticalGeometry(), [])
  const horizontal = useMemo(() => kingCrossHorizontalGeometry(), [])
  const y = height + 0.06
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={vertical} castShadow>
        <meshStandardMaterial {...matProps} />
      </mesh>
      <mesh geometry={horizontal} position={[0, 0.03, 0]} castShadow>
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>
  )
}

function QueenTopper({
  height,
  matProps,
}: {
  height: number
  matProps: MatProps
}) {
  const cone = useMemo(() => queenCrownPointGeometry(), [])
  const count = 6
  const radius = 0.13
  const y = height - 0.02
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        return (
          <mesh
            key={i}
            geometry={cone}
            position={[Math.cos(angle) * radius, 0.045, Math.sin(angle) * radius]}
            castShadow
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
        )
      })}
    </group>
  )
}

function RookTopper({ matProps }: { matProps: MatProps }) {
  const merlon = useMemo(() => rookMerlonGeometry(), [])
  const count = 5
  const radius = 0.23
  return (
    <group position={[0, 0.6, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        return (
          <mesh
            key={i}
            geometry={merlon}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            castShadow
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
        )
      })}
    </group>
  )
}

function KnightMesh({
  color,
  material,
  selected,
  onClick,
}: {
  color: 'w' | 'b'
  material: THREE.MeshStandardMaterial
  selected?: boolean
  onClick?: (e: { stopPropagation: () => void }) => void
}) {
  const base = useMemo(() => knightBaseGeometry(), [])
  const head = useMemo(() => knightHeadGeometry(), [])
  const ear = useMemo(() => knightEarGeometry(), [])
  // Los caballos negros miran hacia la izquierda (hacia el centro del
  // tablero desde el punto de vista de blancas) en un set real; acá
  // simplemente los orientamos todos mirando "hacia adelante" (+x) para
  // el peón contrario, que es lo habitual en sets 3D simples.
  const facing = color === 'w' ? 1 : -1

  const finalMaterial = selected
    ? new THREE.MeshStandardMaterial({
        color: material.color,
        roughness: material.roughness,
        metalness: material.metalness,
        emissive: '#5b8def',
        emissiveIntensity: 0.5,
      })
    : material

  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <mesh geometry={base} material={finalMaterial} castShadow receiveShadow />
      <group position={[0, 0.3, 0]} rotation={[0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
        <mesh
          geometry={head}
          material={finalMaterial}
          castShadow
          receiveShadow
          scale={[1, 1, 1]}
        />
        <mesh
          geometry={ear}
          material={finalMaterial}
          position={[0.16, 0.42, 0.03]}
          rotation={[0, 0, -0.3]}
          castShadow
        />
        <mesh
          geometry={ear}
          material={finalMaterial}
          position={[0.08, 0.44, -0.05]}
          rotation={[0, 0, -0.15]}
          castShadow
        />
      </group>
    </group>
  )
}
