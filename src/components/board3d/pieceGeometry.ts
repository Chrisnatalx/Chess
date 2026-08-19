import * as THREE from 'three'

/**
 * Generación procedural de piezas de ajedrez. Cero assets, cero licencias.
 *
 * Peón, torre, alfil, dama y rey son sólidos de revolución: se definen como
 * una curva de perfil (radio, altura) y se giran 360° con LatheGeometry.
 * Es barato y da un resultado convincente porque las piezas reales también
 * son torneadas.
 *
 * El caballo es la excepción — no es una figura de revolución, es la pieza
 * "difícil" que decide esta pregunta. Se construye con una base torneada
 * (igual que las demás) + una cabeza extruida a partir de una silueta 2D de
 * caballo (ExtrudeGeometry sobre un THREE.Shape), rotada 90° para que la
 * "cara" quede de perfil. Es un enfoque procedural estándar para low-poly
 * chess knights.
 */

const SEG = 24

function lathe(points: [number, number][], scale = 1): THREE.LatheGeometry {
  const vec = points.map(([r, y]) => new THREE.Vector2(r * scale, y * scale))
  return new THREE.LatheGeometry(vec, SEG)
}

// Perfiles (radio, altura) de abajo hacia arriba, en unidades donde 1 = una casilla.
const PAWN_PROFILE: [number, number][] = [
  [0, 0],
  [0.34, 0],
  [0.34, 0.04],
  [0.22, 0.08],
  [0.24, 0.16],
  [0.16, 0.22],
  [0.15, 0.32],
  [0.24, 0.36],
  [0.26, 0.4],
  [0.16, 0.46],
  [0.2, 0.5],
  [0, 0.52],
]

const ROOK_PROFILE: [number, number][] = [
  [0, 0],
  [0.36, 0],
  [0.36, 0.05],
  [0.24, 0.09],
  [0.26, 0.18],
  [0.19, 0.24],
  [0.19, 0.42],
  [0.3, 0.46],
  [0.3, 0.58],
  [0.24, 0.58],
  [0, 0.6],
]

const BISHOP_PROFILE: [number, number][] = [
  [0, 0],
  [0.34, 0],
  [0.34, 0.05],
  [0.22, 0.09],
  [0.24, 0.18],
  [0.15, 0.26],
  [0.13, 0.42],
  [0.22, 0.5],
  [0.25, 0.58],
  [0.14, 0.66],
  [0.2, 0.72],
  [0, 0.76],
]

const QUEEN_PROFILE: [number, number][] = [
  [0, 0],
  [0.38, 0],
  [0.38, 0.05],
  [0.25, 0.09],
  [0.27, 0.2],
  [0.16, 0.3],
  [0.14, 0.5],
  [0.24, 0.6],
  [0.3, 0.72],
  [0.34, 0.8],
  [0.2, 0.84],
  [0, 0.86],
]

const KING_PROFILE: [number, number][] = [
  [0, 0],
  [0.38, 0],
  [0.38, 0.05],
  [0.25, 0.09],
  [0.27, 0.2],
  [0.16, 0.32],
  [0.14, 0.56],
  [0.24, 0.66],
  [0.28, 0.76],
  [0.2, 0.82],
  [0.16, 0.86],
  [0, 0.88],
]

export function pawnGeometry() {
  return lathe(PAWN_PROFILE)
}
export function rookGeometry() {
  return lathe(ROOK_PROFILE)
}
export function bishopGeometry() {
  return lathe(BISHOP_PROFILE)
}
export function queenGeometry() {
  return lathe(QUEEN_PROFILE)
}
export function kingGeometry() {
  return lathe(KING_PROFILE)
}

// --- Caballo -----------------------------------------------------------
// Base torneada (igual criterio que las demás piezas) + cabeza extruida.

const KNIGHT_BASE_PROFILE: [number, number][] = [
  [0, 0],
  [0.34, 0],
  [0.34, 0.05],
  [0.22, 0.09],
  [0.24, 0.16],
  [0.18, 0.2],
  [0.18, 0.3],
]

export function knightBaseGeometry() {
  return lathe(KNIGHT_BASE_PROFILE)
}

/**
 * Silueta 2D de una cabeza de caballo estilizada (perfil clásico de las
 * piezas Staunton), extruida con poco espesor. Se ve reconocible desde el
 * ángulo de juego habitual y desde 3/4, que es lo que importa acá.
 */
export function knightHeadGeometry() {
  const shape = new THREE.Shape()

  // Coordenadas en el plano XY del perfil (se extruye en Z).
  // Arranca en la base trasera (cuello) y recorre el contorno del hocico,
  // la crin y vuelve.
  shape.moveTo(-0.16, 0.0) // base trasera del cuello
  shape.lineTo(-0.18, 0.16)
  shape.quadraticCurveTo(-0.2, 0.3, -0.1, 0.38) // nuca / inicio de la crin
  shape.quadraticCurveTo(0.02, 0.46, 0.16, 0.42) // crin arqueada
  shape.quadraticCurveTo(0.24, 0.4, 0.26, 0.34) // frente
  shape.quadraticCurveTo(0.34, 0.32, 0.4, 0.26) // hocico saliente (orejas cerca)
  shape.quadraticCurveTo(0.36, 0.22, 0.3, 0.21) // nariz
  shape.lineTo(0.24, 0.15) // boca
  shape.quadraticCurveTo(0.16, 0.12, 0.14, 0.04) // mandíbula
  shape.quadraticCurveTo(0.1, -0.02, 0, -0.02) // papada
  shape.lineTo(-0.16, 0.0)

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 12,
  })
  extrude.translate(0, 0, -0.08) // centrar en Z
  return extrude
}

/** Oreja simple: un cono achatado. */
export function knightEarGeometry() {
  return new THREE.ConeGeometry(0.035, 0.09, 8)
}

/** Cruz sobre la corona del rey — lo distingue de la dama a simple vista. */
export function kingCrossVerticalGeometry() {
  return new THREE.BoxGeometry(0.045, 0.16, 0.045)
}
export function kingCrossHorizontalGeometry() {
  return new THREE.BoxGeometry(0.15, 0.045, 0.045)
}

/** Puntita de la corona de la dama. */
export function queenCrownPointGeometry() {
  return new THREE.ConeGeometry(0.035, 0.09, 8)
}

/** Almena (merlón) para la parte superior de la torre. */
export function rookMerlonGeometry() {
  return new THREE.BoxGeometry(0.09, 0.07, 0.09)
}

export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

/** Altura aproximada (en casillas) de cada tipo, para escalar sombras/cámara si hiciera falta. */
export const PIECE_HEIGHT: Record<PieceKind, number> = {
  p: 0.52,
  n: 0.62,
  b: 0.76,
  r: 0.6,
  q: 0.86,
  k: 0.98,
}
