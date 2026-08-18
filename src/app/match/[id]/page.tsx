'use client'

import { use, useState } from 'react'
import { Board } from '@/components/Board'
import { useMatch, turnoDe } from '@/client/useMatch'
import { apiJoin, loadAccessKey, loadCreds, saveAccessKey, saveCreds } from '@/client/api'
import type { Color } from '@/core/match-state'

// `conflict` y `stale_ply` (ambos HTTP 409) significan "el rival se
// adelantó y ya movió", no que el jugador haya hecho algo mal: el hook
// vuelve a consultar el estado real apenas pasa esto. Mostrarlo con el
// mismo tono que un movimiento realmente ilegal (`illegal_move`,
// `not_your_turn`) culparía al jugador por una carrera que no causó.
function esErrorDeSincronizacion(codigo: string): boolean {
  return codigo === 'conflict' || codigo === 'stale_ply'
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { match, error, mover, refrescar } = useMatch(id)
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

  async function unirse() {
    saveAccessKey(clave)
    const r = await apiJoin(id, clave)
    saveCreds(id, { token: r.token, color: r.color })
    setColor(r.color)
    await refrescar()
  }

  if (!match && !error) {
    return <main style={{ padding: 32, fontFamily: 'system-ui' }}>Cargando…</main>
  }

  if (error === 'forbidden') {
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
        {error === 'not_found'
          ? <p>No encontramos esa partida. Revisá el link.</p>
          : <p style={{ color: 'crimson' }}>Error: {error}</p>}
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
          </>
        )}
        {puedeUnirse && <button onClick={() => { void unirse() }}>Unirme como negras</button>}
        {match.status === 'active' && (
          <p>{esMiTurno ? 'Te toca.' : 'Turno del rival…'}</p>
        )}
        {match.status === 'finished' && (
          <p>Partida terminada: {match.result} ({match.reason})</p>
        )}
        {esEspectador && !puedeUnirse && <p>Estás mirando como espectador.</p>}
        {error && error !== 'forbidden' && (
          esErrorDeSincronizacion(error)
            ? <p style={{ color: '#666' }}>El rival se adelantó, sincronizando…</p>
            : <p style={{ color: 'crimson' }}>Movimiento rechazado: {error}</p>
        )}
      </section>
    </main>
  )
}
