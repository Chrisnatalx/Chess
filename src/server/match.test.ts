import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from './store/memory'
import { createMatch, joinMatch, submitMove } from './match'
import type { Deps } from './match'

let store: MemoryStore
let n: number

const deps: Deps = {
  newId: () => `id-${++n}`,
  newToken: () => `tok-${++n}`,
  now: () => 1000,
}

beforeEach(() => {
  store = new MemoryStore()
  n = 0
})

/** Crea una partida y suma el segundo jugador. Devuelve id y ambos tokens. */
async function partidaLista() {
  const creada = await createMatch(store, deps)
  const unida = await joinMatch(store, creada.state.id)
  if (unida === 'not_found' || unida === 'full') throw new Error('no se pudo unir')
  return { id: creada.state.id, blancas: creada.token, negras: unida.token }
}

describe('createMatch', () => {
  it('crea una partida esperando rival, con blancas ocupadas', async () => {
    const { state, token } = await createMatch(store, deps)
    expect(state.status).toBe('waiting')
    expect(state.ply).toBe(0)
    expect(state.history).toEqual([])
    expect(state.players.w.token).toBe(token)
    expect(state.players.b.token).toBeNull()
  })

  it('la guarda en el almacén', async () => {
    const { state } = await createMatch(store, deps)
    expect(await store.get(state.id)).not.toBeNull()
  })
})

describe('joinMatch', () => {
  it('ocupa las negras y activa la partida', async () => {
    const creada = await createMatch(store, deps)
    const unida = await joinMatch(store, creada.state.id)
    expect(unida).not.toBe('not_found')
    expect(unida).not.toBe('full')
    if (unida === 'not_found' || unida === 'full') return
    expect(unida.color).toBe('b')
    expect(unida.state.status).toBe('active')
  })

  it('rechaza a un tercero', async () => {
    const creada = await createMatch(store, deps)
    await joinMatch(store, creada.state.id)
    expect(await joinMatch(store, creada.state.id)).toBe('full')
  })

  it('devuelve not_found si la partida no existe', async () => {
    expect(await joinMatch(store, 'inexistente')).toBe('not_found')
  })
})

describe('submitMove', () => {
  it('aplica una jugada legal de las blancas', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'e2', to: 'e4',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.history).toEqual(['e4'])
    expect(r.ply).toBe(1)
    expect(r.fen).toContain(' b ')
  })

  it('rechaza si no es tu turno', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: p.negras, ply: 0, from: 'e7', to: 'e5',
    })
    expect(r).toBe('not_your_turn')
  })

  it('rechaza un ply desactualizado (doble clic)', async () => {
    const p = await partidaLista()
    await submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'e2', to: 'e4' })
    await submitMove(store, p.id, { token: p.negras, ply: 1, from: 'e7', to: 'e5' })
    const repetida = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'd2', to: 'd4',
    })
    expect(repetida).toBe('stale_ply')
  })

  it('rechaza una jugada ilegal', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'e2', to: 'e5',
    })
    expect(r).toBe('illegal_move')
  })

  it('rechaza un token desconocido', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: 'intruso', ply: 0, from: 'e2', to: 'e4',
    })
    expect(r).toBe('bad_token')
  })

  it('rechaza mover mientras la partida espera rival', async () => {
    const creada = await createMatch(store, deps)
    const r = await submitMove(store, creada.state.id, {
      token: creada.token, ply: 0, from: 'e2', to: 'e4',
    })
    expect(r).toBe('not_active')
  })

  it('devuelve not_found si la partida no existe', async () => {
    const r = await submitMove(store, 'inexistente', {
      token: 'x', ply: 0, from: 'e2', to: 'e4',
    })
    expect(r).toBe('not_found')
  })

  it('marca la partida terminada al dar mate', async () => {
    const p = await partidaLista()
    // Mate del loco: f3 e5 g4 Qh4#
    const jugadas: Array<[string, string, string]> = [
      [p.blancas, 'f2', 'f3'],
      [p.negras, 'e7', 'e5'],
      [p.blancas, 'g2', 'g4'],
      [p.negras, 'd8', 'h4'],
    ]
    let ply = 0
    let ultimo
    for (const [token, from, to] of jugadas) {
      ultimo = await submitMove(store, p.id, { token, ply, from, to })
      expect(typeof ultimo).not.toBe('string')
      ply++
    }
    if (typeof ultimo === 'string' || !ultimo) return
    expect(ultimo.status).toBe('finished')
    expect(ultimo.result).toBe('0-1')
    expect(ultimo.reason).toBe('checkmate')
  })

  it('rechaza jugar en una partida terminada', async () => {
    const p = await partidaLista()
    const jugadas: Array<[string, string, string]> = [
      [p.blancas, 'f2', 'f3'],
      [p.negras, 'e7', 'e5'],
      [p.blancas, 'g2', 'g4'],
      [p.negras, 'd8', 'h4'],
    ]
    let ply = 0
    for (const [token, from, to] of jugadas) {
      await submitMove(store, p.id, { token, ply, from, to })
      ply++
    }
    const despues = await submitMove(store, p.id, {
      token: p.blancas, ply: 4, from: 'a2', to: 'a3',
    })
    expect(despues).toBe('not_active')
  })
})
