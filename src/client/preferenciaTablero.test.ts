// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { cargarPreferencia, guardarPreferencia } from './preferenciaTablero'

beforeEach(() => localStorage.clear())

describe('preferenciaTablero', () => {
  it('sin nada guardado, el modo por defecto es 3d', () => {
    expect(cargarPreferencia()).toBe('3d')
  })

  it('guarda y recupera la elección', () => {
    guardarPreferencia('2d')
    expect(cargarPreferencia()).toBe('2d')
  })

  it('ignora un valor corrupto y vuelve al defecto', () => {
    localStorage.setItem('chess:tablero', 'plasma')
    expect(cargarPreferencia()).toBe('3d')
  })
})
