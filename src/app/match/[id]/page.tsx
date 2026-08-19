'use client'

import { use, useState } from 'react'
import { Board } from '@/components/Board'
import { useMatch, turnoDe } from '@/client/useMatch'
import { apiJoin, loadAccessKey, loadCreds, saveAccessKey, saveCreds } from '@/client/api'
import type { Color } from '@/core/match-state'

// Traduce los códigos crudos que devuelve el servidor (o que sintetiza
// `pedir()` en @/client/api para una respuesta sin cuerpo JSON) a frases en
// español: sin esto, una UI en español termina filtrando identificadores en
// inglés al jugador ("Movimiento rechazado: not_found").
const MENSAJES_DE_ERROR: Record<string, string> = {
  http_500: 'Hubo un error en el servidor. Reintentando…',
  not_found: 'Esta partida ya no existe.',
  not_active: 'La partida ya terminó.',
  illegal_move: 'Esa jugada no es válida.',
  not_your_turn: 'No es tu turno.',
  bad_request: 'Hubo un problema con la solicitud.',
  bad_token: 'Tu sesión en esta partida ya no es válida.',
  stale_ply: 'El rival se adelantó, sincronizando…',
  conflict: 'El rival se adelantó, sincronizando…',
  full: 'Alguien más ocupó el asiento.',
}

function mensajeDeError(codigo: string): string {
  return MENSAJES_DE_ERROR[codigo] ?? 'Sin conexión. Reintentando…'
}

// `conflict` y `stale_ply` (ambos HTTP 409) significan "el rival se
// adelantó y ya movió", no que el jugador haya hecho algo mal: el hook
// vuelve a consultar el estado real apenas pasa esto. Lo mismo aplica a
// `not_found`/`not_active` (la partida expiró o terminó, no una jugada
// mala) y a cualquier código no reconocido (típicamente un problema de red,
// no un rechazo real). Mostrarlos con el mismo tono que un movimiento
// realmente ilegal (`illegal_move`, `not_your_turn`, `bad_token`,
// `bad_request`) culparía al jugador por algo que no causó.
const CODIGOS_NO_CULPABILIZANTES = new Set([
  'conflict', 'stale_ply', 'not_found', 'not_active', 'full',
])

function esRechazoDelJugador(codigo: string): boolean {
  return codigo in MENSAJES_DE_ERROR && !CODIGOS_NO_CULPABILIZANTES.has(codigo)
}

// `unirse()` distingue un asiento perdido (la ruta /join ya colapsa su
// propio 'conflict' interno a 'full': ver join/route.ts) de un fallo de red
// genuino: cualquier código no reconocido no puede ser una respuesta real
// del servidor, así que probablemente ni siquiera llegó — el mensaje no
// debe sugerir que el asiento se perdió cuando puede seguir libre.
function mensajeDeUnirse(codigo: string): string {
  if (codigo === 'full') return 'Alguien más ocupó el asiento. Quedás como espectador.'
  if (codigo in MENSAJES_DE_ERROR) return mensajeDeError(codigo)
  return 'No se pudo unir por un problema de conexión. Probá de nuevo.'
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { match, errorSincronizacion, errorJugada, mover, refrescar, esperaAbandonada } = useMatch(id)
  // Estado derivado de localStorage al montar (`loadCreds` es un sistema
  // externo a React, no algo que sincronizar con un efecto): salvo eso,
  // solo cambia cuando `unirse` lo asigna directamente tras unirse.
  // El guard de `window` evita tocar localStorage durante el prerenderizado
  // en el servidor, donde no existe (ver mismo comentario en page.tsx).
  const [color, setColor] = useState<Color | null>(() => (
    typeof window === 'undefined' ? null : loadCreds(id)?.color ?? null
  ))
  const [clave, setClave] = useState(() => (
    typeof window === 'undefined' ? '' : loadAccessKey()
  ))
  const [copiado, setCopiado] = useState(false)
  const [uniendose, setUniendose] = useState(false)
  const [errorUnirse, setErrorUnirse] = useState<string | null>(null)

  async function unirse() {
    setUniendose(true)
    setErrorUnirse(null)
    try {
      saveAccessKey(clave)
      const r = await apiJoin(id, clave)
      saveCreds(id, { token: r.token, color: r.color })
      setColor(r.color)
      await refrescar()
    } catch (e) {
      setErrorUnirse(e instanceof Error ? e.message : 'error')
      // Si perdimos la carrera (full) el servidor ya tiene el asiento
      // ocupado: se refresca para que `puedeUnirse` pase a false de
      // inmediato, en vez de esperar hasta 4s al próximo sondeo y dejar el
      // botón ofreciéndose sobre un asiento que ya no está disponible.
      void refrescar()
    } finally {
      setUniendose(false)
    }
  }

  if (!match && !errorSincronizacion) {
    return <main style={{ padding: 32, fontFamily: 'system-ui' }}>Cargando…</main>
  }

  if (errorSincronizacion === 'forbidden') {
    return (
      <main style={{ maxWidth: 420, margin: '4rem auto', fontFamily: 'system-ui' }}>
        <h1>Partida</h1>
        <p>Ingresá la clave de acceso para ver esta partida.</p>
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button onClick={() => { saveAccessKey(clave); void refrescar() }}>Entrar</button>
      </main>
    )
  }

  if (!match) {
    return (
      <main style={{ padding: 32, fontFamily: 'system-ui' }}>
        {errorSincronizacion === 'not_found'
          ? <p>No encontramos esa partida. Revisá el link.</p>
          : <p style={{ color: 'crimson' }}>{mensajeDeError(errorSincronizacion ?? '')}</p>}
      </main>
    )
  }

  const esEspectador = color === null
  // Se mira `open`, no `taken`: un asiento de bot no tiene token y con `taken`
  // se vería vacío, dejando que cualquiera con el link desplace al bot.
  const puedeUnirse = esEspectador && match.status === 'waiting' && match.players.b.open
  const esMiTurno = color !== null && turnoDe(match) === color && match.status === 'active'

  return (
    <main style={{ maxWidth: 560, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <Board
          fen={match.fen}
          history={match.history}
          orientation={color ?? 'w'}
          puedeMover={esMiTurno}
          onMove={(from, to, promotion) => { void mover(from, to, promotion) }}
        />
      </div>

      <section style={{ marginTop: 16 }}>
        {match.status === 'waiting' && (
          <>
            <p>Esperando al rival. Pasale este link:</p>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href)
                setCopiado(true)
              }}
            >
              {copiado ? 'Copiado' : 'Copiar link de invitación'}
            </button>
            {esperaAbandonada && (
              <p style={{ color: 'var(--muted-foreground)' }}>
                Dejamos de consultar porque pasaron más de 15 minutos sin
                novedades. Si seguís esperando al rival, recargá la página.
              </p>
            )}
          </>
        )}
        {puedeUnirse && (
          <button onClick={() => { void unirse() }} disabled={uniendose}>
            {uniendose ? 'Uniendo…' : 'Unirme como negras'}
          </button>
        )}
        {errorUnirse && (
          <p style={{ color: errorUnirse === 'full' ? 'var(--muted-foreground)' : 'crimson' }}>
            {mensajeDeUnirse(errorUnirse)}
          </p>
        )}
        {match.status === 'active' && (
          <p>{esMiTurno ? 'Te toca.' : 'Turno del rival…'}</p>
        )}
        {match.status === 'finished' && (
          <p>Partida terminada: {match.result} ({match.reason})</p>
        )}
        {esEspectador && !puedeUnirse && !errorUnirse && <p>Estás mirando como espectador.</p>}
        {/* Rechazo de jugada y aviso de sincronización son canales separados
            (ver useMatch): el segundo nunca pisa al primero, y el rechazo
            queda visible hasta el próximo intento en vez de desaparecer
            solo con el próximo sondeo exitoso. */}
        {errorJugada && (
          esRechazoDelJugador(errorJugada)
            ? <p style={{ color: 'crimson' }}>Movimiento rechazado: {mensajeDeError(errorJugada)}</p>
            : <p style={{ color: 'var(--muted-foreground)' }}>{mensajeDeError(errorJugada)}</p>
        )}
        {!errorJugada && errorSincronizacion && errorSincronizacion !== 'forbidden' && (
          <p style={{ color: 'var(--muted-foreground)' }}>{mensajeDeError(errorSincronizacion)}</p>
        )}
      </section>
    </main>
  )
}
