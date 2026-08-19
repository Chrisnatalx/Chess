// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { PublicMatch, PublicPlayer } from '@/core/match-state'
import { shouldPoll, pollInterval, useMatch } from './useMatch'
import * as api from './api'

describe('shouldPoll', () => {
  it('consulta si la partida espera rival', () => {
    expect(shouldPoll({ status: 'waiting', esMiTurno: false, visible: true })).toBe(true)
  })

  it('consulta mientras es el turno del rival', () => {
    expect(shouldPoll({ status: 'active', esMiTurno: false, visible: true })).toBe(true)
  })

  it('no consulta si es mi turno: nada puede cambiar sin que yo mueva', () => {
    expect(shouldPoll({ status: 'active', esMiTurno: true, visible: true })).toBe(false)
  })

  it('no consulta si la partida terminó', () => {
    expect(shouldPoll({ status: 'finished', esMiTurno: false, visible: true })).toBe(false)
  })

  it('no consulta si la pestaña no está visible', () => {
    expect(shouldPoll({ status: 'active', esMiTurno: false, visible: false })).toBe(false)
  })
})

describe('pollInterval', () => {
  it('consulta cada 4 segundos al principio', () => {
    expect(pollInterval(0)).toBe(4000)
    expect(pollInterval(60_000)).toBe(4000)
  })

  it('se relaja a 15 segundos tras 2 minutos sin cambios', () => {
    expect(pollInterval(120_001)).toBe(15_000)
    expect(pollInterval(600_000)).toBe(15_000)
  })
})

// --- Pruebas de regresión de la ronda 1 de revisión de la tarea 7 ---------
//
// Estas pruebas ejercitan la parte con estado del hook (renderHook, con
// jsdom) en vez de las funciones puras de arriba. Mockean './api' entero
// para no depender de fetch/localStorage reales.

vi.mock('./api', () => ({
  apiGet: vi.fn(),
  apiMove: vi.fn(),
  loadAccessKey: vi.fn(() => 'clave'),
  loadCreds: vi.fn(),
}))

function jugador(taken: boolean): PublicPlayer {
  return { kind: 'human', label: 'j', taken, open: !taken }
}

function partida(
  ply: number,
  version: number,
  status: PublicMatch['status'] = 'active',
): PublicMatch {
  return {
    id: 'm1',
    schema: 1,
    history: [],
    fen: 'fen-de-prueba',
    ply,
    status,
    result: null,
    reason: null,
    createdAt: 0,
    version,
    players: { w: jugador(true), b: jugador(true) },
  }
}

beforeEach(() => {
  vi.mocked(api.loadCreds).mockReturnValue({ token: 'tok', color: 'w' })
})

afterEach(() => {
  // resetAllMocks (no clearAllMocks): también vacía cualquier entrada de
  // mockResolvedValueOnce/mockImplementationOnce que haya quedado sin
  // consumir. Importa porque, contra la implementación vieja, el CRÍTICO 1
  // deja sin consumir su segunda respuesta encolada (esa es justamente la
  // regresión que prueba) — sin este reset esa respuesta se filtraría a la
  // siguiente prueba y falsearía el CRÍTICO 2.
  vi.resetAllMocks()
  vi.useRealTimers()
})

describe('useMatch (regresión, con estado)', () => {
  it(
    'CRÍTICO 1: un poll fallido no detiene el ciclo para siempre — se reintenta después del intervalo',
    async () => {
      vi.useFakeTimers()
      const get = vi.mocked(api.apiGet)
      get
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ match: partida(0, 10) })

      renderHook(() => useMatch('m1'))

      // Primer intento: se dispara solo, al montar. Falla.
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))

      // Se avanza el reloj falso lo bastante para cubrir cualquier backoff
      // razonable tras un solo fallo (el intervalo normal es 4s; incluso
      // duplicado son 8s, muy por debajo del techo de ~60s).
      await vi.advanceTimersByTimeAsync(10_000)

      // Contra la implementación vieja esto se queda en 1 para siempre: el
      // efecto de consulta dependía de `match`, que nunca se actualiza tras
      // un fallo, así que nunca se reprograma ningún timeout.
      expect(get).toHaveBeenCalledTimes(2)
    },
  )

  it(
    'CRÍTICO 2: una respuesta de poll vieja en vuelo no pisa una jugada propia más nueva',
    async () => {
      const get = vi.mocked(api.apiGet)
      const move = vi.mocked(api.apiMove)

      const inicial = partida(0, 10)
      const trasJugada = partida(1, 11)
      const pollViejo = partida(0, 10) // misma versión que `inicial`: sigue siendo vieja frente a 11.

      let resolverSegundoGet: ((v: { match: PublicMatch }) => void) | undefined
      get
        .mockResolvedValueOnce({ match: inicial })
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolverSegundoGet = resolve }),
        )
      move.mockResolvedValueOnce({ match: trasJugada })

      const { result } = renderHook(() => useMatch('m1'))

      await waitFor(() => expect(result.current.match?.ply).toBe(0))

      // Un refresco manual queda "en vuelo" (no se espera a que resuelva):
      // simula el poll periódico que ya estaba en camino cuando se hizo la
      // jugada propia.
      let refrescoEnVuelo!: Promise<boolean>
      act(() => {
        refrescoEnVuelo = result.current.refrescar()
      })
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2))

      // La jugada propia se resuelve primero y avanza a ply 1.
      await act(async () => {
        await result.current.mover('e2', 'e4')
      })
      expect(result.current.match?.ply).toBe(1)

      // Ahora resuelve el poll viejo, con una versión anterior a la que ya
      // se aplicó.
      await act(async () => {
        resolverSegundoGet?.({ match: pollViejo })
        await refrescoEnVuelo
      })

      // Contra la implementación vieja, setMatch(m) era incondicional: el
      // poll viejo pisaba la jugada propia y el ply volvía a 0, además de
      // dejar la partida en un estado donde una segunda jugada del usuario
      // mandaría un ply desactualizado y el servidor respondería 409.
      expect(result.current.match?.ply).toBe(1)
    },
  )

  it(
    'IMPORTANTE 1: un /move fallido no debe frenar el sondeo para siempre, ' +
      'aunque el cliente siga creyendo que es su turno',
    async () => {
      vi.useFakeTimers()
      const get = vi.mocked(api.apiGet)
      const move = vi.mocked(api.apiMove)

      // Carga inicial: ply 0, turno de blancas — coincide con las
      // credenciales mockeadas (color 'w'), así que el cliente cree que es
      // su turno.
      get.mockResolvedValueOnce({ match: partida(0, 10) })

      const { result } = renderHook(() => useMatch('m1'))
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))

      // La jugada falla en el POST (bache de red), y el refresco inmediato
      // que dispara el catch de `mover` también falla: la misma ráfaga de
      // red se lleva puesta ambas peticiones.
      move.mockRejectedValueOnce(new Error('network'))
      get.mockRejectedValueOnce(new Error('network'))

      await act(async () => {
        await result.current.mover('e2', 'e4')
        // El catch de `mover` dispara `refrescar()` sin esperarlo: se le
        // da un par de vueltas al microtask queue para que también se
        // resuelva (con su propio rechazo, atrapado adentro).
        await Promise.resolve()
        await Promise.resolve()
      })

      const llamadasTrasElFallo = get.mock.calls.length

      // De acá en más el servidor respondería bien si se le preguntara de
      // nuevo — la jugada pudo haber llegado, o no, pero consultando se
      // sabría.
      get.mockResolvedValue({ match: partida(0, 10) })

      await vi.advanceTimersByTimeAsync(120_000)

      // Contra el código sin arreglar, el cliente sigue creyendo (con
      // datos locales nunca actualizados) que es su turno tras el fallo,
      // así que `shouldPoll` da `false` en todos los ticks siguientes y
      // `llamadasTrasElFallo` queda como techo para siempre.
      expect(get.mock.calls.length).toBeGreaterThan(llamadasTrasElFallo)
    },
  )

  it(
    'MENOR 6: deja de consultar una partida en waiting abandonada, y lo expone en esperaAbandonada',
    async () => {
      vi.useFakeTimers()
      const get = vi.mocked(api.apiGet)
      get.mockResolvedValue({ match: partida(0, 1, 'waiting') })

      const { result } = renderHook(() => useMatch('m1'))
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
      expect(result.current.esperaAbandonada).toBe(false)

      // Cruza el umbral de 15 minutos sin ningún cambio en la partida (sigue
      // 'waiting', mismo ply): una pestaña abandonada, no alguien mirando.
      await vi.advanceTimersByTimeAsync(16 * 60_000)
      expect(result.current.esperaAbandonada).toBe(true)

      const llamadasTrasElUmbral = get.mock.calls.length
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      // Ninguna llamada más: dejar de consultar es justamente el punto (le
      // ahorra cuota de Redis al dueño).
      expect(get.mock.calls.length).toBe(llamadasTrasElUmbral)
    },
  )
})
