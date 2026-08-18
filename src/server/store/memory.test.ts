import { describe, it, expect } from 'vitest'
import { MemoryStore } from './memory'
import type { MatchState } from '@/core/match-state'

function partida(id: string): MatchState {
  return {
    id,
    history: [],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    ply: 0,
    players: {
      w: { kind: 'human', token: 'tok-w', label: 'Blancas' },
      b: { kind: 'human', token: null, label: 'Negras' },
    },
    status: 'waiting',
    result: null,
    reason: null,
    createdAt: 1,
  }
}

describe('MemoryStore', () => {
  it('devuelve null para una partida que no existe', async () => {
    const store = new MemoryStore()
    expect(await store.get('nope')).toBeNull()
  })

  it('guarda y recupera', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    const leida = await store.get('a')
    expect(leida?.id).toBe('a')
  })

  it('devuelve una copia, no la referencia guardada', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    const leida = await store.get('a')
    leida!.history.push('e4')
    const otra = await store.get('a')
    expect(otra!.history).toEqual([])
  })

  it('sobrescribe al volver a guardar', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    await store.put({ ...partida('a'), ply: 3 })
    expect((await store.get('a'))!.ply).toBe(3)
  })
})
