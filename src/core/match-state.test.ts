import { describe, it, expect } from 'vitest'
import { toPublic } from './match-state'
import type { MatchState } from './match-state'

function estadoConTokens(): MatchState {
  return {
    id: 'partida-1',
    history: [],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    ply: 0,
    players: {
      w: { kind: 'human', token: 'secreto-blancas', label: 'Blancas', open: false },
      b: { kind: 'human', token: 'secreto-negras', label: 'Negras', open: false },
    },
    status: 'active',
    result: null,
    reason: null,
    createdAt: 1000,
    version: 0,
  }
}

describe('toPublic', () => {
  it('no incluye la propiedad token en ninguno de los dos colores', () => {
    const estado = estadoConTokens()
    const resultado = toPublic(estado)
    expect('token' in resultado.players.w).toBe(false)
    expect('token' in resultado.players.b).toBe(false)
  })

  it('no filtra los secretos en el JSON serializado', () => {
    const estado = estadoConTokens()
    const serializado = JSON.stringify(toPublic(estado))
    expect(serializado).not.toContain('secreto-blancas')
    expect(serializado).not.toContain('secreto-negras')
  })

  it('taken es true con token y false cuando el asiento está libre', () => {
    const estado = estadoConTokens()
    estado.players.b.token = null
    const resultado = toPublic(estado)
    expect(resultado.players.w.taken).toBe(true)
    expect(resultado.players.b.taken).toBe(false)
  })

  it('expone open para que el cliente sepa si el asiento espera un humano', () => {
    const estado = estadoConTokens()
    estado.players.b.open = true
    const resultado = toPublic(estado)
    expect(resultado.players.w.open).toBe(false)
    expect(resultado.players.b.open).toBe(true)
  })
})
