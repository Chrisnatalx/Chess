import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from './store/memory'
import { createMatch, joinMatch, submitMove } from './match'
import type { Deps, MoveError } from './match'
import type { MatchState } from '@/core/match-state'

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
  if (typeof unida === 'string') throw new Error('no se pudo unir')
  return { id: creada.state.id, blancas: creada.token, negras: unida.token }
}

/** Mate del loco: f3 e5 g4 Qh4#. Devuelve el resultado de la última jugada. */
async function jugarMateDelLoco(id: string, blancas: string, negras: string) {
  const jugadas: Array<[string, string, string]> = [
    [blancas, 'f2', 'f3'],
    [negras, 'e7', 'e5'],
    [blancas, 'g2', 'g4'],
    [negras, 'd8', 'h4'],
  ]
  let ply = 0
  let ultimo: MatchState | MoveError | undefined
  for (const [token, from, to] of jugadas) {
    ultimo = await submitMove(store, id, { token, ply, from, to })
    ply++
  }
  return ultimo
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
    if (typeof unida === 'string') return
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
    const ultimo = await jugarMateDelLoco(p.id, p.blancas, p.negras)
    expect(typeof ultimo).not.toBe('string')
    if (typeof ultimo === 'string' || !ultimo) return
    expect(ultimo.status).toBe('finished')
    expect(ultimo.result).toBe('0-1')
    expect(ultimo.reason).toBe('checkmate')
  })

  it('rechaza jugar en una partida terminada', async () => {
    const p = await partidaLista()
    await jugarMateDelLoco(p.id, p.blancas, p.negras)
    const despues = await submitMove(store, p.id, {
      token: p.blancas, ply: 4, from: 'a2', to: 'a3',
    })
    expect(despues).toBe('not_active')
  })

  it('rechaza un ply desactualizado incluso cuando también sería not_your_turn', async () => {
    // Las blancas juegan e4 (ply pasa a 1) y luego reenvían su propio clic
    // con ply: 0. El ply almacenado (1) no coincide Y tampoco es su turno:
    // ambos chequeos dispararían, pero el ply se evalúa primero.
    const p = await partidaLista()
    await submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'e2', to: 'e4' })
    const repetido = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'd2', to: 'd4',
    })
    expect(repetido).toBe('stale_ply')
  })

  it('exige promotion explícito y produce el SAN correcto (chess.js 1.x no asume reina)', async () => {
    const p = await partidaLista()
    const jugadas: Array<[string, string]> = [
      ['h2', 'h4'], ['g7', 'g5'], ['h4', 'g5'], ['h7', 'h6'], ['g5', 'h6'], ['a7', 'a5'],
      ['g2', 'g4'], ['a5', 'a4'], ['g4', 'g5'], ['a4', 'a3'], ['g5', 'g6'], ['a3', 'b2'],
      ['g6', 'g7'], ['b2', 'a1'],
    ]
    let ply = 0
    let ultimo: MatchState | MoveError | undefined
    for (const [from, to] of jugadas) {
      const token = ply % 2 === 0 ? p.blancas : p.negras
      const promotion = to === 'a1' ? 'q' : undefined
      ultimo = await submitMove(store, p.id, { token, ply, from, to, promotion })
      expect(typeof ultimo).not.toBe('string')
      ply++
    }
    if (typeof ultimo === 'string' || !ultimo) return
    expect(ultimo.history.at(-1)).toBe('bxa1=Q')

    const promo = await submitMove(store, p.id, {
      token: p.blancas, ply, from: 'g7', to: 'h8', promotion: 'q',
    })
    expect(typeof promo).not.toBe('string')
    if (typeof promo === 'string') return
    expect(promo.history.at(-1)).toBe('gxh8=Q')
  })

  it('termina en tablas por ahogado', async () => {
    const p = await partidaLista()
    const jugadas: Array<[string, string]> = [
      ['e2', 'e3'], ['a7', 'a5'], ['d1', 'h5'], ['a8', 'a6'], ['h5', 'a5'], ['h7', 'h5'],
      ['a5', 'c7'], ['a6', 'h6'], ['h2', 'h4'], ['f7', 'f6'], ['c7', 'd7'], ['e8', 'f7'],
      ['d7', 'b7'], ['d8', 'd3'], ['b7', 'b8'], ['d3', 'h7'], ['b8', 'c8'], ['f7', 'g6'],
      ['c8', 'e6'],
    ]
    let ultimo: MatchState | MoveError | undefined
    let ply = 0
    for (const [from, to] of jugadas) {
      const token = ply % 2 === 0 ? p.blancas : p.negras
      ultimo = await submitMove(store, p.id, { token, ply, from, to })
      expect(typeof ultimo).not.toBe('string')
      ply++
    }
    if (typeof ultimo === 'string' || !ultimo) return
    expect(ultimo.status).toBe('finished')
    expect(ultimo.result).toBe('1/2-1/2')
    expect(ultimo.reason).toBe('stalemate')
  })

  it('concurrencia: dos joinMatch simultáneos, solo uno gana', async () => {
    const creada = await createMatch(store, deps)
    const [a, b] = await Promise.all([
      joinMatch(store, creada.state.id),
      joinMatch(store, creada.state.id),
    ])
    const exitosos = [a, b].filter((r) => typeof r !== 'string')
    const conflictos = [a, b].filter((r) => r === 'conflict')
    expect(exitosos.length).toBe(1)
    expect(conflictos.length).toBe(1)

    const ganador = exitosos[0]
    if (typeof ganador === 'string') return
    const guardado = await store.get(creada.state.id)
    expect(guardado?.players.b.token).toBe(ganador.token)
  })

  it('concurrencia: dos submitMove simultáneos con el mismo ply, solo uno gana', async () => {
    const p = await partidaLista()
    const [a, b] = await Promise.all([
      submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'e2', to: 'e4' }),
      submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'd2', to: 'd4' }),
    ])
    const exitosos = [a, b].filter((r) => typeof r !== 'string')
    const conflictos = [a, b].filter((r) => r === 'conflict')
    expect(exitosos.length).toBe(1)
    expect(conflictos.length).toBe(1)

    const ganador = exitosos[0]
    if (typeof ganador === 'string') return
    const guardado = await store.get(p.id)
    expect(guardado?.history.length).toBe(1)
    expect(guardado?.history).toEqual(ganador.history)
  })
})
