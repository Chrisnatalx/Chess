import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Se fuerza el almacén en memoria para estas pruebas, sin importar si hay
// credenciales de Upstash en el entorno que invoca el proceso. Sin este
// stub, cuando el shell exporta las credenciales reales, getStore() elige
// RedisStore y estas pruebas terminan golpeando la base de datos real en
// producción — lento (cientos de ms por prueba en vez de unos pocos) y a
// costa de la cuota gratuita del proyecto.
//
// vi.mock se eleva por encima de los imports, así que no puede cerrar
// sobre un import estático de MemoryStore declarado más abajo en el
// archivo. Se importa en su lugar dentro de la propia factory (import()
// perezoso): la factory se evalúa una sola vez, la primera vez que algo
// importa '@/server/store', así que `almacenCompartido` queda como una
// única instancia compartida por todo el archivo — justo lo que necesitan
// las pruebas que crean una partida en una llamada y la leen en otra.
vi.mock('@/server/store', async () => {
  const { MemoryStore } = await import('@/server/store/memory')
  const almacenCompartido = new MemoryStore()
  return { getStore: () => almacenCompartido }
})

import { POST as crear } from '@/app/api/match/route'
import { GET as leer } from '@/app/api/match/[id]/route'
import { POST as unirse } from '@/app/api/match/[id]/join/route'
import { POST as mover } from '@/app/api/match/[id]/move/route'

// El almacén es un stub en memoria compartido dentro de este archivo (ver
// el vi.mock arriba), así que las pruebas de este archivo lo comparten.
// Cada prueba crea su propia partida en vez de depender del orden de
// ejecución.

const CLAVE = 'k'
const original = process.env.ACCESS_KEY

beforeEach(() => { process.env.ACCESS_KEY = CLAVE })
afterEach(() => {
  if (original === undefined) delete process.env.ACCESS_KEY
  else process.env.ACCESS_KEY = original
})

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function pedidoSimple(
  url: string,
  opts: { conClave?: boolean; metodo?: string } = {},
): Request {
  const headers: Record<string, string> = {}
  if (opts.conClave ?? true) headers['x-access-key'] = CLAVE
  return new Request(url, { method: opts.metodo ?? 'POST', headers })
}

function pedidoConCuerpo(
  url: string,
  body: BodyInit | undefined,
  opts: { conClave?: boolean } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.conClave ?? true) headers['x-access-key'] = CLAVE
  return new Request(url, { method: 'POST', headers, body })
}

async function crearPartida(): Promise<{ id: string; token: string }> {
  const res = await crear(pedidoSimple('http://x/api/match'))
  const json = (await res.json()) as { match: { id: string }; token: string }
  return { id: json.match.id, token: json.token }
}

describe('rutas de partida', () => {
  it('la respuesta cruda de leer y de mover no contiene ningún token de jugador (assert en texto, no en la forma parseada)', async () => {
    const { id, token: tokenBlancas } = await crearPartida()
    const joinRes = await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    const joinJson = (await joinRes.json()) as { token: string }
    const tokenNegras = joinJson.token

    const leerRes = await leer(
      pedidoSimple(`http://x/api/match/${id}`, { metodo: 'GET' }),
      ctx(id),
    )
    const leerTexto = await leerRes.text()
    expect(leerTexto).not.toContain(tokenBlancas)
    expect(leerTexto).not.toContain(tokenNegras)

    const moverRes = await mover(
      pedidoConCuerpo(
        `http://x/api/match/${id}/move`,
        JSON.stringify({ token: tokenBlancas, ply: 0, from: 'e2', to: 'e4' }),
      ),
      ctx(id),
    )
    const moverTexto = await moverRes.text()
    expect(moverTexto).not.toContain(tokenBlancas)
    expect(moverTexto).not.toContain(tokenNegras)
  })

  it('devuelve 403 sin la cabecera de clave, en las cuatro rutas, antes que cualquier otra cosa', async () => {
    const { id } = await crearPartida()

    expect((await crear(pedidoSimple('http://x/api/match', { conClave: false }))).status).toBe(403)
    expect(
      (await leer(
        pedidoSimple(`http://x/api/match/${id}`, { conClave: false, metodo: 'GET' }),
        ctx(id),
      )).status,
    ).toBe(403)
    expect(
      (await unirse(pedidoSimple(`http://x/api/match/${id}/join`, { conClave: false }), ctx(id))).status,
    ).toBe(403)

    // Cuerpo deliberadamente inválido (ni siquiera JSON) y sin clave: debe
    // dar 403, no 400 ni 500 — el chequeo de acceso corre antes de leer el cuerpo.
    const res = await mover(
      pedidoConCuerpo(`http://x/api/match/${id}/move`, '{', { conClave: false }),
      ctx(id),
    )
    expect(res.status).toBe(403)
  })

  it('crear devuelve { match, token, color: "w" } y match.players no tiene la clave token en ningún color', async () => {
    const res = await crear(pedidoSimple('http://x/api/match'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      match: { players: { w: object; b: object } }
      token: string
      color: string
    }
    expect(json.color).toBe('w')
    expect(typeof json.token).toBe('string')
    expect(json.match.players.w).not.toHaveProperty('token')
    expect(json.match.players.b).not.toHaveProperty('token')
  })

  it('unirse ocupa las negras y devuelve color "b"; un segundo intento da 409', async () => {
    const { id } = await crearPartida()
    const res = await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { color: string }
    expect(json.color).toBe('b')

    const segundo = await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    expect(segundo.status).toBe(409)
  })

  it('una jugada legal aplica y devuelve la partida actualizada', async () => {
    const { id, token } = await crearPartida()
    await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    const res = await mover(
      pedidoConCuerpo(
        `http://x/api/match/${id}/move`,
        JSON.stringify({ token, ply: 0, from: 'e2', to: 'e4' }),
      ),
      ctx(id),
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { match: { history: string[] } }
    expect(json.match.history).toEqual(['e4'])
  })

  it('un ply desactualizado da 409', async () => {
    const { id, token } = await crearPartida()
    await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    const res = await mover(
      pedidoConCuerpo(
        `http://x/api/match/${id}/move`,
        JSON.stringify({ token, ply: 5, from: 'e2', to: 'e4' }),
      ),
      ctx(id),
    )
    expect(res.status).toBe(409)
  })

  it('un token desconocido da 403', async () => {
    const { id } = await crearPartida()
    await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    const res = await mover(
      pedidoConCuerpo(
        `http://x/api/match/${id}/move`,
        JSON.stringify({ token: 'no-existe', ply: 0, from: 'e2', to: 'e4' }),
      ),
      ctx(id),
    )
    expect(res.status).toBe(403)
  })

  it('una jugada ilegal da 422', async () => {
    const { id, token } = await crearPartida()
    await unirse(pedidoSimple(`http://x/api/match/${id}/join`), ctx(id))
    const res = await mover(
      pedidoConCuerpo(
        `http://x/api/match/${id}/move`,
        JSON.stringify({ token, ply: 0, from: 'e2', to: 'e5' }),
      ),
      ctx(id),
    )
    expect(res.status).toBe(422)
  })

  it('un cuerpo ausente y un cuerpo truthy-pero-inválido dan 400 (regresión del 500 de req.json() sin proteger)', async () => {
    const { id } = await crearPartida()

    const sinCuerpo = await mover(
      pedidoConCuerpo(`http://x/api/match/${id}/move`, undefined),
      ctx(id),
    )
    expect(sinCuerpo.status).toBe(400)

    const cuerpoTruncado = await mover(
      pedidoConCuerpo(`http://x/api/match/${id}/move`, '{'),
      ctx(id),
    )
    expect(cuerpoTruncado.status).toBe(400)

    const cuerpoArreglo = await mover(
      pedidoConCuerpo(`http://x/api/match/${id}/move`, JSON.stringify([])),
      ctx(id),
    )
    expect(cuerpoArreglo.status).toBe(400)

    const cuerpoNumero = await mover(
      pedidoConCuerpo(`http://x/api/match/${id}/move`, JSON.stringify(5)),
      ctx(id),
    )
    expect(cuerpoNumero.status).toBe(400)
  })

  it('un id inexistente (pero con forma de uuid) da 404 en leer, unirse y mover', async () => {
    const idFalso = '00000000-0000-4000-8000-000000000000'
    expect(
      (await leer(pedidoSimple(`http://x/api/match/${idFalso}`, { metodo: 'GET' }), ctx(idFalso))).status,
    ).toBe(404)
    expect(
      (await unirse(pedidoSimple(`http://x/api/match/${idFalso}/join`), ctx(idFalso))).status,
    ).toBe(404)
    const res = await mover(
      pedidoConCuerpo(
        `http://x/api/match/${idFalso}/move`,
        JSON.stringify({ token: 'x', ply: 0, from: 'e2', to: 'e4' }),
      ),
      ctx(idFalso),
    )
    expect(res.status).toBe(404)
  })

  it('un id que no tiene forma de uuid da 404 sin llegar al almacén', async () => {
    const idHostil = '../../etc/passwd'
    const res = await leer(
      pedidoSimple('http://x/api/match/hostil', { metodo: 'GET' }),
      ctx(idHostil),
    )
    expect(res.status).toBe(404)
  })

  it('cache-control: no-store en todas las respuestas, incluido el 403', async () => {
    const okRes = await crear(pedidoSimple('http://x/api/match'))
    expect(okRes.headers.get('cache-control')).toBe('no-store')

    const denegado = await crear(pedidoSimple('http://x/api/match', { conClave: false }))
    expect(denegado.headers.get('cache-control')).toBe('no-store')
  })
})
