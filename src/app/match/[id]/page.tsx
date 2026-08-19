'use client'

import { use, useState } from 'react'
import dynamic from 'next/dynamic'
import { Board2D } from '@/components/Board2D'
import { SelectorTablero } from '@/components/SelectorTablero'
import { useMatch, turnoDe } from '@/client/useMatch'
import { apiJoin, loadAccessKey, loadCreds, saveAccessKey, saveCreds } from '@/client/api'
import { cargarPreferencia, soportaWebGL, POR_DEFECTO, type ModoTablero } from '@/client/preferenciaTablero'
import { useValorDelNavegador } from '@/client/useValorDelNavegador'
import type { Color } from '@/core/match-state'

// Importación diferida y sin render en servidor: Three.js pesa, y quien
// juegue en 2D no debe descargarlo. `ssr: false` además evita que WebGL se
// toque durante el render del servidor, donde no existe.
const Board3D = dynamic(
  () => import('@/components/board3d/Board3D').then((m) => m.Board3D),
  { ssr: false, loading: () => <p>Cargando tablero 3D…</p> },
)

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

// Lado del cuadro que contiene el tablero, en ambos modos. Crece con el
// viewport (92vw) hasta un tope prolijo en pantallas grandes (900px), pero
// también se lo acota por alto (100dvh menos ~260px de cabecera y pie:
// selector de modo, link de invitación, indicador de turno y mensajes de
// estado) para que esos controles sigan visibles sin scroll en una laptop
// normal. `dvh` en vez de `vh` porque en el celular la barra del navegador
// entra y sale del viewport dinámico; `vh` fijo mediría un alto que a veces
// no está disponible de verdad.
//
// El 2D ya es cuadrado por su cuenta (react-chessboard mide el ancho de su
// contenedor y usa esa misma medida como alto), así que basta con fijarle
// este mismo valor de ancho. El 3D no tiene ese mecanismo — su contenedor es
// un `width:100%; height:100%` que, sin un alto propio en el padre, mide 0 —
// así que aquí se le da un alto explícito con el MISMO valor: el cuadro que
// ve el jugador es idéntico en tamaño en los dos modos, así que cambiar de
// uno a otro no reacomoda nada alrededor.
const LADO_TABLERO = 'min(92vw, 900px, calc(100dvh - 260px))'

// `soportaWebGL` crea un contexto WebGL para probar soporte y no lo libera.
// `useValorDelNavegador` (useSyncExternalStore por debajo) llama a su
// `leerValor` en cada render — este componente vuelve a renderizar seguido
// por el sondeo de `useMatch` — así que llamar a `soportaWebGL()` sin
// memoizar agotaría el límite de contextos WebGL concurrentes que impone el
// navegador. Se cachea a nivel de módulo: la prueba real corre una sola vez
// por carga de página, no una vez por cada snapshot pedido.
let soporteWebGLCacheado: boolean | undefined
function leerSoporteWebGL(): boolean {
  if (soporteWebGLCacheado === undefined) {
    soporteWebGLCacheado = soportaWebGL()
  }
  return soporteWebGLCacheado
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { match, errorSincronizacion, errorJugada, mover, refrescar, esperaAbandonada } = useMatch(id)
  // `loadCreds`/`loadAccessKey` leen localStorage, que no existe durante el
  // prerenderizado en el servidor. `useValorDelNavegador` (useSyncExternalStore
  // por debajo) arranca en el mismo valor en el servidor y en el primer
  // render del cliente — por construcción, no por casualidad — y recién
  // después de montar pasa al valor real de localStorage. Sin esto (como
  // antes, con un guard de `typeof window` dentro de un inicializador
  // perezoso de useState) el primer render del cliente difiere del HTML del
  // servidor y React reporta un mismatch de hidratación.
  const colorGuardado = useValorDelNavegador(() => loadCreds(id)?.color ?? null, null)
  // `colorAsignado` es la asignación explícita que hace `unirse()` al
  // ocupar un asiento: una vez que existe, gana sobre lo leído de
  // localStorage (que en ese momento todavía no se actualizó a lo que
  // `saveCreds` recién guardó).
  const [colorAsignado, setColorAsignado] = useState<Color | null>(null)
  const color = colorAsignado ?? colorGuardado

  const claveGuardada = useValorDelNavegador(loadAccessKey, '')
  const [claveEditada, setClaveEditada] = useState<string | null>(null)
  const clave = claveEditada ?? claveGuardada

  const [copiado, setCopiado] = useState(false)
  const [uniendose, setUniendose] = useState(false)
  const [errorUnirse, setErrorUnirse] = useState<string | null>(null)

  // Modo de tablero: `soportaWebGL` y la preferencia guardada son, otra vez,
  // lecturas del navegador. Ambas arrancan "sin resolver" (`null`) en el
  // servidor y en el primer render del cliente, y pasan a su valor real
  // recién después de montar — nunca con un `setState` dentro de un efecto.
  // (Antes ese cálculo vivía en una función anidada dentro de un `useEffect`
  // únicamente para esquivar `react-hooks/set-state-in-effect`: la regla no
  // dejaba de aplicar de verdad, porque las llamadas seguían siendo
  // síncronas en el mismo tick — era un punto ciego de la detección, no una
  // diferencia semántica.) Mientras `webglEstado` es `null` no se sabe
  // todavía si el 3D es viable, así que no se monta ningún tablero: Board3D
  // (con Three.js adentro) no se descarga hasta saber que corresponde.
  const webglEstado = useValorDelNavegador<boolean | null>(leerSoporteWebGL, null)
  const preferencia = useValorDelNavegador<ModoTablero | null>(cargarPreferencia, null)
  const modoPorDefecto: ModoTablero | null =
    webglEstado === null ? null : webglEstado ? (preferencia ?? POR_DEFECTO) : '2d'
  // Sin WebGL el 3D no puede funcionar: se cae a 2D y se avisa una vez, en
  // vez de ofrecer un interruptor con una opción rota.
  const avisoSinWebGL = webglEstado === false
  // El interruptor 2D/3D asigna acá; hasta que el usuario lo toque, se usa
  // el valor por defecto derivado arriba (preferencia guardada, o 2D si no
  // hay WebGL).
  const [modoElegido, setModoElegido] = useState<ModoTablero | null>(null)
  const modo = modoElegido ?? modoPorDefecto

  async function unirse() {
    setUniendose(true)
    setErrorUnirse(null)
    try {
      saveAccessKey(clave)
      const r = await apiJoin(id, clave)
      saveCreds(id, { token: r.token, color: r.color })
      setColorAsignado(r.color)
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
          onChange={(e) => setClaveEditada(e.target.value)}
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

  const propsTablero = {
    fen: match.fen,
    history: match.history,
    orientation: color ?? 'w',
    puedeMover: esMiTurno,
    onMove: (from: string, to: string, promotion?: string) => { void mover(from, to, promotion) },
  }

  return (
    <main style={{ maxWidth: 960, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <div style={{ width: LADO_TABLERO, margin: '0 auto' }}>
        {modo !== null && (
          <SelectorTablero modo={modo} webglDisponible={webglEstado === true} onCambiar={setModoElegido} />
        )}
        {avisoSinWebGL && (
          <p style={{ color: 'var(--muted-foreground)' }}>
            Tu navegador no soporta el tablero 3D: mostrando el tablero 2D.
          </p>
        )}
        {modo === null && <p>Cargando tablero…</p>}
        {modo === '3d' && (
          // Ver el comentario de `LADO_TABLERO`: sin este alto explícito,
          // Board3D hereda un `height: 100%` de un contenedor sin alto
          // propio y el canvas colapsa.
          <div style={{ width: '100%', height: LADO_TABLERO }}>
            <Board3D {...propsTablero} />
          </div>
        )}
        {modo === '2d' && <Board2D {...propsTablero} />}
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
