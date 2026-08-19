import { describe, it, expect } from 'vitest'
import { decidirJugada } from './decidirJugada'

describe('decidirJugada', () => {
  it('acepta una jugada legal sin coronación', () => {
    expect(decidirJugada([], 'e2', 'e4')).toEqual({ from: 'e2', to: 'e4' })
  })

  it('rechaza una jugada ilegal', () => {
    expect(decidirJugada([], 'e2', 'e5')).toBeNull()
  })

  it('rechaza casillas inexistentes', () => {
    expect(decidirJugada([], 'z9', 'a1')).toBeNull()
  })

  it('corona a dama cuando la jugada lo exige', () => {
    // chess.js 1.4.0 NO asume dama: sin `promotion` esta jugada es ilegal.
    const historial = ['h4', 'g5', 'hxg5', 'h6', 'gxh6', 'a5', 'g4', 'a4', 'g5',
                       'a3', 'g6', 'axb2', 'g7', 'bxa1=Q']
    expect(decidirJugada(historial, 'g7', 'h8')).toEqual({
      from: 'g7', to: 'h8', promotion: 'q',
    })
  })
})
