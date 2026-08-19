import { describe, it, expect } from 'vitest'
import { destinosLegales, resolveSquare } from './seleccion'

describe('destinosLegales', () => {
  it('un peón inicial puede avanzar una o dos casillas', () => {
    expect(destinosLegales([], 'e2').sort()).toEqual(['e3', 'e4'])
  })

  it('una pieza bloqueada no tiene destinos', () => {
    expect(destinosLegales([], 'a1')).toEqual([])
  })

  it('una casilla vacía no tiene destinos', () => {
    expect(destinosLegales([], 'e4')).toEqual([])
  })

  it('una casilla que no es notación de ajedrez no tiene destinos', () => {
    expect(destinosLegales([], 'z9')).toEqual([])
  })
})

describe('resolveSquare', () => {
  it('sin nada elegido y sin pieza en el camino, manda la casilla del plano', () => {
    expect(resolveSquare({ pieceSquare: null, square: 'e4' }, null, [])).toBe('e4')
  })

  it('sin nada elegido, tocar el cuerpo de una pieza elige esa pieza aunque el rayo siga hasta la casilla de atrás', () => {
    // La corona del rey en e1 tapa parte de e2 en perspectiva.
    expect(resolveSquare({ pieceSquare: 'e1', square: 'e2' }, null, [])).toBe('e1')
  })

  it('tocar la pieza ya elegida deselecciona, aunque la casilla de atrás sea un destino legal suyo', () => {
    // Este es el caso que rompía antes: el rey elegido en e1, el rayo
    // atraviesa la corona y cae en e2, que es destino legal del rey. Sin la
    // prioridad del paso 1 el clic jugaba Ke2 en vez de deseleccionar.
    expect(resolveSquare({ pieceSquare: 'e1', square: 'e2' }, 'e1', ['e2'])).toBe('e1')
  })

  it('con algo elegido, la casilla del plano gana si es destino legal de la selección', () => {
    expect(resolveSquare({ pieceSquare: null, square: 'e4' }, 'e2', ['e3', 'e4'])).toBe('e4')
  })

  it('la casilla del plano gana sobre una pieza rozada al pasar, si es destino legal', () => {
    expect(resolveSquare({ pieceSquare: 'c3', square: 'd4' }, 'd1', ['d4'])).toBe('d4')
  })

  it('con algo elegido, tocar una pieza sobre una casilla que no es destino legal actúa sobre esa pieza', () => {
    // Capturar tocando el cuerpo de la pieza rival: el rayo la atraviesa y
    // sigue hasta d6, que no es destino legal; manda d5, que sí lo es.
    expect(resolveSquare({ pieceSquare: 'd5', square: 'd6' }, 'e4', ['d5', 'e5'])).toBe('d5')
  })

  it('con algo elegido, tocar otra pieza propia mueve la selección a ella', () => {
    expect(resolveSquare({ pieceSquare: 'e1', square: 'e2' }, 'd1', ['d2', 'd3'])).toBe('e1')
  })
})
