// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cargarPreferencia, guardarPreferencia, soportaWebGL } from './preferenciaTablero'

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

describe('soportaWebGL', () => {
  it('da false cuando ningún contexto webgl está disponible', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    try {
      expect(soportaWebGL()).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('da false cuando document.createElement().getContext lanza', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('sin soporte')
    })
    try {
      expect(soportaWebGL()).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('da false cuando no hay document (entorno de servidor)', () => {
    const original = globalThis.document
    // @ts-expect-error: se simula la ausencia de `document` como en el servidor.
    delete globalThis.document
    try {
      expect(soportaWebGL()).toBe(false)
    } finally {
      globalThis.document = original
    }
  })
})
