import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'

describe('andamiaje', () => {
  it('chess.js está instalado y arranca en la posición inicial', () => {
    const chess = new Chess()
    expect(chess.turn()).toBe('w')
    expect(chess.moves()).toHaveLength(20)
  })

  it('move() lanza excepción con una jugada ilegal', () => {
    const chess = new Chess()
    expect(() => chess.move('e5')).toThrow(/Invalid move/)
  })
})
