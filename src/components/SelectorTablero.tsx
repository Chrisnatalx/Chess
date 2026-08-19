'use client'

import { guardarPreferencia, type ModoTablero } from '@/client/preferenciaTablero'

type SelectorTableroProps = {
  modo: ModoTablero
  /**
   * Si WebGL no está disponible el 3D no puede funcionar: el interruptor no
   * debe ofrecer una opción rota. Se recibe como prop (calculada una sola
   * vez en un efecto por quien monta este componente) en vez de llamar a
   * `soportaWebGL()` acá adentro, porque este componente sí se renderiza en
   * el servidor (es 'use client', pero eso no lo excluye del SSR) y esa
   * función depende de `document`.
   */
  webglDisponible: boolean
  onCambiar: (modo: ModoTablero) => void
}

/**
 * Interruptor 2D/3D. Vive junto al tablero, no al pie: es la clase de
 * control que se usa a cada rato, no una preferencia que se configura una
 * vez y se olvida.
 */
export function SelectorTablero({ modo, webglDisponible, onCambiar }: SelectorTableroProps) {
  if (!webglDisponible) return null

  function elegir(nuevo: ModoTablero) {
    if (nuevo === modo) return
    guardarPreferencia(nuevo)
    onCambiar(nuevo)
  }

  return (
    <div role="radiogroup" aria-label="Modo de tablero" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      <button
        type="button"
        role="radio"
        aria-checked={modo === '2d'}
        onClick={() => elegir('2d')}
        style={{ fontWeight: modo === '2d' ? 700 : 400 }}
      >
        2D
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={modo === '3d'}
        onClick={() => elegir('3d')}
        style={{ fontWeight: modo === '3d' ? 700 : 400 }}
      >
        3D
      </button>
    </div>
  )
}
