import { describe, it, expect } from 'vitest'
import { legalMoves, applyMove, fenOf, turnOf, outcomeOf } from './game'

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('legalMoves', () => {
  it('hay 20 jugadas legales en la posición inicial', () => {
    expect(legalMoves([])).toHaveLength(20)
  })
})

describe('fenOf y turnOf', () => {
  it('la partida vacía es la posición inicial y juegan blancas', () => {
    expect(fenOf([])).toBe(INICIAL)
    expect(turnOf([])).toBe('w')
  })

  it('tras una jugada de blancas, juegan negras', () => {
    expect(turnOf(['e4'])).toBe('b')
  })
})

describe('applyMove', () => {
  it('aplica una jugada legal y devuelve el SAN', () => {
    const r = applyMove([], { from: 'e2', to: 'e4' })
    expect(r).not.toBeNull()
    expect(r!.san).toBe('e4')
    expect(r!.history).toEqual(['e4'])
  })

  it('no muta el historial que recibe', () => {
    const historial: string[] = []
    applyMove(historial, { from: 'e2', to: 'e4' })
    expect(historial).toEqual([])
  })

  it('devuelve null con una jugada ilegal en vez de lanzar', () => {
    expect(applyMove([], { from: 'e2', to: 'e5' })).toBeNull()
  })

  it('devuelve null si las casillas no existen', () => {
    expect(applyMove([], { from: 'z9', to: 'a1' })).toBeNull()
  })

  it('corona a dama cuando se indica', () => {
    // Blancas coronan en h8.
    const historial = ['h4', 'g5', 'hxg5', 'h6', 'gxh6', 'a5', 'g4', 'a4', 'g5', 'a3', 'g6', 'axb2', 'g7', 'bxa1=Q']
    const r = applyMove(historial, { from: 'g7', to: 'h8', promotion: 'q' })
    expect(r).not.toBeNull()
    expect(r!.san).toContain('=Q')
  })
})

describe('outcomeOf', () => {
  it('la partida inicial no terminó', () => {
    expect(outcomeOf([])).toEqual({ over: false, result: null, reason: null })
  })

  it('detecta el mate del loco (mate de negras)', () => {
    const r = outcomeOf(['f3', 'e5', 'g4', 'Qh4#'])
    expect(r.over).toBe(true)
    expect(r.result).toBe('0-1')
    expect(r.reason).toBe('checkmate')
  })

  it('detecta el mate del pastor (mate de blancas)', () => {
    const r = outcomeOf(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1-0')
    expect(r.reason).toBe('checkmate')
  })

  it('detecta ahogado', () => {
    const r = outcomeOf([
      'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'Qxc7', 'Rah6',
      'h4', 'f6', 'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7',
      'Qxc8', 'Kg6', 'Qe6',
    ])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1/2-1/2')
    expect(r.reason).toBe('stalemate')
  })

  it('detecta repetición triple', () => {
    const r = outcomeOf(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1/2-1/2')
    expect(r.reason).toBe('threefold')
  })
})
