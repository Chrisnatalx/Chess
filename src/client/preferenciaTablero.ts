export type ModoTablero = '2d' | '3d'

const CLAVE = 'chess:tablero'
const POR_DEFECTO: ModoTablero = '3d'

export function cargarPreferencia(): ModoTablero {
  if (typeof localStorage === 'undefined') return POR_DEFECTO
  const v = localStorage.getItem(CLAVE)
  return v === '2d' || v === '3d' ? v : POR_DEFECTO
}

export function guardarPreferencia(m: ModoTablero): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CLAVE, m)
}

/**
 * Se comprueba antes de montar el 3D. Sin esto, un dispositivo sin WebGL
 * mostraría un lienzo en blanco en vez de un tablero.
 */
export function soportaWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
