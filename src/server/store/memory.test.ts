import { describe, it, expect } from 'vitest'
import { MemoryStore } from './memory'
import type { MatchState } from '@/core/match-state'

function partida(id: string): MatchState {
  return {
    id,
    schema: 1,
    history: [],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    ply: 0,
    players: {
      w: { kind: 'human', token: 'tok-w', label: 'Blancas', open: false },
      b: { kind: 'human', token: null, label: 'Negras', open: true },
    },
    status: 'waiting',
    result: null,
    reason: null,
    createdAt: 1,
    version: 0,
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

  it('putIfVersion escribe cuando la versión esperada coincide', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    const ok = await store.putIfVersion({ ...partida('a'), ply: 3, version: 1 }, 0)
    expect(ok).toBe(true)
    expect((await store.get('a'))!.ply).toBe(3)
  })

  it('putIfVersion devuelve false y no toca lo guardado si la versión no coincide', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    const ok = await store.putIfVersion({ ...partida('a'), ply: 3, version: 1 }, 5)
    expect(ok).toBe(false)
    const guardada = await store.get('a')
    expect(guardada!.ply).toBe(0)
    expect(guardada!.version).toBe(0)
  })

  it('get() devuelve null (no un estado corrupto) para un registro sin el campo schema esperado', async () => {
    // Simula lo que hay hoy guardado en producción, escrito antes de que
    // existiera este campo, o cualquier registro futuro de un esquema
    // incompatible: sin este chequeo, un campo nuevo del próximo hito
    // llegaría `undefined` a aritmética/comparaciones que esperan otra cosa
    // en vez de degradar a "no encontramos esa partida", que ya está bien
    // resuelto en la UI.
    const store = new MemoryStore()
    const sinSchema = Object.fromEntries(
      Object.entries(partida('vieja')).filter(([clave]) => clave !== 'schema'),
    ) as unknown as MatchState
    await store.put(sinSchema)
    expect(await store.get('vieja')).toBeNull()
  })
})
