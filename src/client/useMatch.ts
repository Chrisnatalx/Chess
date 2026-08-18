'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicMatch } from '@/core/match-state'
import { apiGet, apiMove, loadAccessKey, loadCreds } from './api'

const INTERVALO_NORMAL = 4000
const INTERVALO_RELAJADO = 15_000
const UMBRAL_RELAJACION = 120_000

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
  const ultimoCambio = useRef<number>(Date.now())
  const plyPrevio = useRef<number>(-1)

  const refrescar = useCallback(async () => {
    try {
      const { match: m } = await apiGet(id, loadAccessKey())
      if (m.ply !== plyPrevio.current || m.status !== match?.status) {
        ultimoCambio.current = Date.now()
        plyPrevio.current = m.ply
      }
      setMatch(m)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
    }
  }, [id, match?.status])

  useEffect(() => { void refrescar() }, [id])

  useEffect(() => {
    if (!match) return
    const creds = loadCreds(id)
    const esMiTurno = creds ? turnoDe(match) === creds.color : false
    const ctx: PollContext = {
      status: match.status,
      esMiTurno,
      visible: typeof document === 'undefined' || document.visibilityState === 'visible',
    }
    if (!shouldPoll(ctx)) return

    const t = setTimeout(
      () => { void refrescar() },
      pollInterval(Date.now() - ultimoCambio.current),
    )
    return () => clearTimeout(t)
  }, [match, id, refrescar])

  // Al volver a la pestaña, refrescar de inmediato en vez de esperar el turno del reloj.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refrescar()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refrescar])

  const mover = useCallback(
    async (from: string, to: string, promotion?: string) => {
      const creds = loadCreds(id)
      if (!creds || !match) return false
      try {
        const { match: m } = await apiMove(id, loadAccessKey(), {
          token: creds.token, ply: match.ply, from, to, promotion,
        })
        ultimoCambio.current = Date.now()
        plyPrevio.current = m.ply
        setMatch(m)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'error')
        // Se refresca para que el tablero vuelva al estado real del servidor.
        void refrescar()
        return false
      }
    },
    [id, match, refrescar],
  )

  return { match, error, mover, refrescar }
}

/** El turno se deriva del ply: par = blancas, impar = negras. */
export function turnoDe(match: PublicMatch): 'w' | 'b' {
  return match.ply % 2 === 0 ? 'w' : 'b'
}
