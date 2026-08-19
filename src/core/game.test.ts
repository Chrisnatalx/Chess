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

  it('permite el enroque corto (e1->g1) y lo registra como O-O', () => {
    const historial = ['Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7']
    const r = applyMove(historial, { from: 'e1', to: 'g1' })
    expect(r).not.toBeNull()
    expect(r!.san).toBe('O-O')
  })

  it('permite el enroque largo (e1->c1) y lo registra como O-O-O', () => {
    const historial = ['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd6']
    const r = applyMove(historial, { from: 'e1', to: 'c1' })
    expect(r).not.toBeNull()
    expect(r!.san).toBe('O-O-O')
  })

  it('permite la captura al paso (e5->d6) y la registra como exd6', () => {
    // Blancas avanzan e4-e5; negras responden d7-d5 a su lado, habilitando
    // la captura al paso sobre el peón que acaba de pasar por d6.
    const historial = ['e4', 'a6', 'e5', 'd5']
    const r = applyMove(historial, { from: 'e5', to: 'd6' })
    expect(r).not.toBeNull()
    expect(r!.san).toBe('exd6')
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

  it('detecta tablas por la regla de las cincuenta jugadas', () => {
    // Desarrolla y castiga ambos lados (última jugada de peón: 'd5'), y
    // después arrastra piezas mayores y menores de un lado a otro sin
    // capturar ni volver a mover un peón, evitando a propósito la
    // repetición triple (cada posición aparece a lo sumo dos veces) hasta
    // completar 100 medias jugadas sin avance: exactamente la condición de
    // la regla de las cincuenta jugadas, generado y verificado con chess.js
    // directamente (`isDrawByFiftyMoves()`) antes de fijarlo acá.
    const desarrollo = [
      'Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O', 'O-O',
      'd4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5',
    ]
    const arrastre = [
      'Be5', 'Rb8', 'Bd6', 'Rc8', 'Be5', 'Ra8', 'Bd6', 'Rb8', 'Be5', 'Rc8',
      'Bd6', 'Ra8', 'Bf4', 'Rb8', 'Bg5', 'Rc8', 'Bh6', 'Rb8', 'Bf4', 'Rc8',
      'Bg5', 'Rb8', 'Bh6', 'Rc8', 'Bf4', 'Qe8', 'Be5', 'Rd8', 'Bd6', 'Rd7',
      'Be5', 'Qd8', 'Bd6', 'Qc8', 'Be5', 'Qe8', 'Bd6', 'Qd8', 'Be5', 'Qc8',
      'Bd6', 'Qb8', 'Be5', 'Qa8', 'Bd6', 'Re8', 'Be5', 'Qb8', 'Bd6', 'Qc8',
      'Be5', 'Qd8', 'Bd6', 'Qb8', 'Be5', 'Qc8', 'Bd6', 'Qd8', 'Be5', 'Qa8',
      'Bd6', 'Rf8', 'Be5', 'Qb8', 'Bd6', 'Rfd8', 'Be5', 'Qc8', 'Bd6', 'Qa8',
      'Be5', 'Qb8', 'Bd6', 'Qc8', 'Be5', 'Qa8', 'Bd6', 'Rc8', 'Be5', 'Qb8',
      'Bd6', 'Kh8', 'Be5', 'Qa8', 'Bd6', 'Rcd8', 'Be5', 'Qb8', 'Bd6', 'Qc8',
      'Be5', 'Qa8', 'Bd6', 'Qb8', 'Be5', 'Qc8',
    ]
    const r = outcomeOf([...desarrollo, ...arrastre])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1/2-1/2')
    expect(r.reason).toBe('fifty_move')
  })
})
