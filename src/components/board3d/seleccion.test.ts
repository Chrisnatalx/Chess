import { describe, it, expect } from 'vitest'
import { destinosLegales } from './seleccion'

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
