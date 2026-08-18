import { describe, it, expect, vi } from 'vitest'
import { Redis } from '@upstash/redis'
import { RedisStore } from './redis'
import type { MatchState } from '@/core/match-state'

const hayCredenciales =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN

function partida(id: string): MatchState {
  return {
    id,
    history: ['e4', 'e5'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    ply: 2,
    players: {
      w: { kind: 'human', token: 'tw', label: 'Blancas', open: false },
      b: { kind: 'human', token: 'tb', label: 'Negras', open: false },
    },
    status: 'active',
    result: null,
    reason: null,
    createdAt: 1,
    version: 0,
  }
}

describe.skipIf(!hayCredenciales)('RedisStore (integración)', () => {
  it('guarda y recupera una partida completa', async () => {
    const store = new RedisStore()
    const id = `test-${Date.now()}`
    await store.put(partida(id))
    const leida = await store.get(id)
    expect(leida).toEqual(partida(id))
  })

  it('devuelve null para una partida inexistente', async () => {
    const store = new RedisStore()
    expect(await store.get(`no-existe-${Date.now()}`)).toBeNull()
  })

  it('putIfVersion escribe cuando la versión coincide', async () => {
    const store = new RedisStore()
    const id = `test-cas-ok-${Date.now()}`
    await store.put(partida(id))
    const ok = await store.putIfVersion({ ...partida(id), ply: 4, version: 1 }, 0)
    expect(ok).toBe(true)
    expect((await store.get(id))!.ply).toBe(4)
  })

  it('putIfVersion rechaza y no toca nada cuando la versión no coincide', async () => {
    const store = new RedisStore()
    const id = `test-cas-no-${Date.now()}`
    await store.put(partida(id))
    const ok = await store.putIfVersion({ ...partida(id), ply: 9, version: 5 }, 4)
    expect(ok).toBe(false)
    expect((await store.get(id))!.ply).toBe(2)
  })

  it('putIfVersion rechaza sobre una partida inexistente', async () => {
    const store = new RedisStore()
    const id = `test-cas-fantasma-${Date.now()}`
    expect(await store.putIfVersion({ ...partida(id), version: 1 }, 0)).toBe(false)
  })
})

// --- Pruebas de unidad con un cliente falso -------------------------------
//
// Las de arriba se saltean sin credenciales, así que son la única red de
// seguridad real para el script Lua: sin esto, la lógica de compare-and-swap
// (la parte más riesgosa de esta tarea, porque de ella depende que dos
// jugadas simultáneas con el mismo `ply` no se pisen) queda sin verificar en
// cualquier máquina que no tenga una base de Upstash a mano.

const TTL_SEGUNDOS = 60 * 60 * 24 * 7

function crearClienteFalso() {
  const get = vi.fn()
  const set = vi.fn()
  const evalMock = vi.fn()
  // El cliente real de @upstash/redis tiene decenas de métodos que esta
  // prueba no usa; se castea a propósito porque RedisStore solo llama a
  // get/set/eval.
  const cliente = { get, set, eval: evalMock } as unknown as Redis
  return { cliente, get, set, eval: evalMock }
}

describe('RedisStore (unidad, sin credenciales)', () => {
  it('put escribe la clave de estado y la de versión, ambas como texto', async () => {
    const { cliente, set } = crearClienteFalso()
    const store = new RedisStore(cliente)
    const estado = partida('unit-put')

    await store.put(estado)

    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenNthCalledWith(
      1,
      'match:unit-put',
      JSON.stringify(estado),
      { ex: TTL_SEGUNDOS },
    )
    expect(set).toHaveBeenNthCalledWith(
      2,
      'match:unit-put:v',
      String(estado.version),
      { ex: TTL_SEGUNDOS },
    )
  })

  it('putIfVersion llama a eval una sola vez, con las claves y los argumentos en orden', async () => {
    const { cliente, eval: evalMock } = crearClienteFalso()
    evalMock.mockResolvedValue(1)
    const store = new RedisStore(cliente)
    const estado = { ...partida('unit-cas'), ply: 4, version: 1 }

    const ok = await store.putIfVersion(estado, 0)

    expect(ok).toBe(true)
    expect(evalMock).toHaveBeenCalledTimes(1)
    const [script, keys, args] = evalMock.mock.calls[0] as [string, string[], string[]]
    expect(typeof script).toBe('string')
    expect(keys).toEqual(['match:unit-cas', 'match:unit-cas:v'])
    expect(args).toEqual([
      '0',
      JSON.stringify(estado),
      '1',
      String(TTL_SEGUNDOS),
    ])
    args.forEach((a) => expect(typeof a).toBe('string'))
  })

  it('putIfVersion devuelve true cuando el script devuelve 1', async () => {
    const { cliente, eval: evalMock } = crearClienteFalso()
    evalMock.mockResolvedValue(1)
    const store = new RedisStore(cliente)

    expect(await store.putIfVersion(partida('unit-ok'), 0)).toBe(true)
  })

  it('putIfVersion devuelve false cuando el script devuelve 0', async () => {
    const { cliente, eval: evalMock } = crearClienteFalso()
    evalMock.mockResolvedValue(0)
    const store = new RedisStore(cliente)

    expect(await store.putIfVersion(partida('unit-no'), 0)).toBe(false)
  })
})
