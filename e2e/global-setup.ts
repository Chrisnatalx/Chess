import { CLAVE_E2E } from './support'

/**
 * Next.js en modo dev (Turbopack) compila cada ruta recién cuando la
 * primera petición la toca, y esa primera compilación puede tardar mucho
 * más que el timeout por defecto de una aserción de Playwright. El chequeo
 * de disponibilidad de `webServer` sólo calienta `/`; esto calienta el
 * resto de las rutas que los tests van a usar (API de crear/unirse/mover y
 * la página de partida) antes de que corra el primer test, para que las
 * aserciones midan el comportamiento real de la app y no un artefacto de
 * arranque en frío.
 */
export default async function globalSetup(): Promise<void> {
  const base = 'http://localhost:3000'
  const headers = { 'x-access-key': CLAVE_E2E, 'content-type': 'application/json' }

  await fetch(`${base}/`)

  const creado = await fetch(`${base}/api/match`, { method: 'POST', headers })
  const { match } = (await creado.json()) as { match: { id: string } }

  await fetch(`${base}/match/${match.id}`)
  await fetch(`${base}/api/match/${match.id}`, { headers })
  await fetch(`${base}/api/match/${match.id}/join`, { method: 'POST', headers })
  // Cuerpo intencionalmente inválido: sólo importa que la ruta compile,
  // no que la jugada tenga éxito.
  await fetch(`${base}/api/match/${match.id}/move`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token: '', ply: 0, from: 'e2', to: 'e4' }),
  })
}
