'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicMatch } from '@/core/match-state'
import { apiGet, apiMove, loadAccessKey, loadCreds } from './api'

const INTERVALO_NORMAL = 4000
const INTERVALO_RELAJADO = 15_000
const UMBRAL_RELAJACION = 120_000
/** Tope del backoff cuando el servidor encadena fallos: no se espera más de esto. */
const TECHO_BACKOFF = 60_000

export type PollContext = {
  status: PublicMatch['status']
  esMiTurno: boolean
  visible: boolean
}

/**
 * Solo se consulta cuando el estado puede cambiar sin intervención propia:
 * esperando rival, o esperando su jugada, y con la pestaña a la vista.
 */
export function shouldPoll(ctx: PollContext): boolean {
  if (!ctx.visible) return false
  if (ctx.status === 'finished') return false
  if (ctx.status === 'waiting') return true
  return !ctx.esMiTurno
}

/** Se relaja tras dos minutos sin cambios para no gotear peticiones. */
export function pollInterval(msDesdeUltimoCambio: number): number {
  return msDesdeUltimoCambio > UMBRAL_RELAJACION ? INTERVALO_RELAJADO : INTERVALO_NORMAL
}

export function useMatch(id: string) {
  const [match, setMatch] = useState<PublicMatch | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Espejo de `match` en un ref: así refrescar/mover/tick leen el estado más
  // reciente sin necesitar `match` en su lista de dependencias, lo que evita
  // que su identidad cambie en cada jugada (la causa de la sobre-escritura
  // de la ronda 1 de revisión: un poll viejo podía pisar una jugada propia
  // más nueva porque no había ninguna comparación de versión).
  const matchRef = useRef<PublicMatch | null>(null)
  // null hasta el primer cambio real: evita llamar Date.now() durante el
  // render (regla react-hooks/purity) y sigue significando "sin cambios
  // todavía" para pollInterval.
  const ultimoCambio = useRef<number | null>(null)
  const plyPrevio = useRef<number>(-1)
  const fallosConsecutivos = useRef<number>(0)

  // Aplica una partida recibida del servidor, pero solo si no es más vieja
  // que la que ya tenemos: una respuesta de red puede llegar desordenada
  // respecto de otra más reciente (la confirmación de una jugada propia que
  // ya se renderizó, o de otro poll que ya volvió). `version` crece
  // monótonamente en el servidor, así que alcanza para decidir.
  // Se guarda en un ref creado una sola vez (perezoso): su cuerpo solo lee y
  // escribe refs y el setter estable de useState, así que ninguna otra
  // función necesita listarla como dependencia — siempre es la misma.
  const aplicarRef = useRef((m: PublicMatch) => {
    const anterior = matchRef.current
    if (anterior && m.version < anterior.version) return // respuesta vieja: se descarta
    if (m.ply !== plyPrevio.current || m.status !== anterior?.status) {
      ultimoCambio.current = Date.now()
      plyPrevio.current = m.ply
    }
    matchRef.current = m
    // Guarda funcional: aunque algo se cuele entre leer matchRef y llamar a
    // setMatch, React aplica los updaters encolados en orden, así que esta
    // comparación contra `prev` es la que de verdad importa.
    setMatch((prev) => (prev && m.version < prev.version ? prev : m))
  })

  const refrescar = useCallback(async () => {
    try {
      const { match: m } = await apiGet(id, loadAccessKey())
      aplicarRef.current(m)
      setError(null)
      fallosConsecutivos.current = 0
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
      fallosConsecutivos.current += 1
      return false
    }
  }, [id])

  // Ciclo único de consulta periódica: un solo efecto por `id`, con un
  // `tick` que se reprograma a sí mismo. A diferencia de la versión previa
  // (que dependía de `[match, id, refrescar]` para decidir si programar un
  // timeout), este no depende del estado: por eso un fallo también se
  // reprograma en vez de dejar el ciclo detenido para siempre.
  useEffect(() => {
    let cancelado = false
    let enVuelo = false
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelado || enVuelo) return
      enVuelo = true
      const actual = matchRef.current
      const creds = loadCreds(id)
      const esMiTurno = actual !== null && creds !== null && turnoDe(actual) === creds.color
      const ctx: PollContext = {
        status: actual?.status ?? 'waiting',
        esMiTurno,
        visible: typeof document === 'undefined' || document.visibilityState === 'visible',
      }
      // Sin partida todavía (primer montaje, o el intento anterior falló), o
      // con fallos pendientes de confirmar (un poll o un /move recientes no
      // llegaron a buen puerto): se consulta igual, sin esperar a que
      // shouldPoll lo autorice. Si no, un cliente que cree —con datos
      // locales nunca actualizados— que es su turno se queda sin consultar
      // para siempre: `shouldPoll` da `false` con `esMiTurno: true` sin
      // importar cuánto haya fallado la sincronización.
      const necesitaConsultar =
        actual === null || fallosConsecutivos.current > 0 || shouldPoll(ctx)

      try {
        if (necesitaConsultar) await refrescar()
      } finally {
        enVuelo = false
        // Reprogramar SIEMPRE acá, tanto si hubo éxito como si no: es lo
        // que impide que un solo fallo detenga el ciclo para siempre.
        // `fallosConsecutivos` ya quedó al día a esta altura: `refrescar()`
        // lo resetea a 0 en éxito y lo incrementa en fallo, y es la misma
        // referencia que usa el catch de `mover`.
        if (!cancelado) {
          const base = pollInterval(
            ultimoCambio.current === null ? 0 : Date.now() - ultimoCambio.current,
          )
          const espera = fallosConsecutivos.current > 0
            ? Math.min(base * 2 ** fallosConsecutivos.current, TECHO_BACKOFF)
            : base
          temporizador = setTimeout(() => { void tick() }, espera)
        }
      }
    }

    // Al volver a la pestaña, no esperar al próximo tick programado: se
    // cancela el que estaba pendiente y se consulta de inmediato. `enVuelo`
    // evita que esto dispare una segunda consulta en paralelo si ya hay una
    // en curso.
    const alCambiarVisibilidad = () => {
      if (document.visibilityState !== 'visible') return
      if (temporizador) clearTimeout(temporizador)
      void tick()
    }

    void tick()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', alCambiarVisibilidad)
    }

    return () => {
      cancelado = true
      if (temporizador) clearTimeout(temporizador)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      }
    }
  }, [id, refrescar])

  const mover = useCallback(
    async (from: string, to: string, promotion?: string) => {
      const creds = loadCreds(id)
      const actual = matchRef.current
      if (!creds || !actual) return false
      try {
        const { match: m } = await apiMove(id, loadAccessKey(), {
          token: creds.token, ply: actual.ply, from, to, promotion,
        })
        aplicarRef.current(m)
        fallosConsecutivos.current = 0
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'error')
        // Se incrementa el contador acá mismo, de forma síncrona, y no solo
        // a través del refrescar() de abajo: eso fuerza a que los próximos
        // ticks consulten sin importar `shouldPoll`, incluso si ese
        // refrescar tarda en resolver o también falla. Se refresca además
        // para que el tablero vuelva al estado real del servidor en cuanto
        // la red lo permita.
        fallosConsecutivos.current += 1
        void refrescar()
        return false
      }
    },
    [id, refrescar],
  )

  return { match, error, mover, refrescar }
}

/** El turno se deriva del ply: par = blancas, impar = negras. */
export function turnoDe(match: PublicMatch): 'w' | 'b' {
  return match.ply % 2 === 0 ? 'w' : 'b'
}
