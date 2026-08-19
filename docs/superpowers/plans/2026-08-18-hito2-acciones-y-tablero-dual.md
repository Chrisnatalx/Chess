# Hito 2 — Acciones de partida y tablero dual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un jugador pueda rendirse o acordar tablas, y que el tablero se vea en 3D por defecto con el 2D disponible a un click y como repliegue automático.

**Architecture:** Las acciones de partida son mutaciones más del árbitro y viajan por un endpoint nuevo que reutiliza las mismas guardas de `ply` y de versión que ya protegen los movimientos. El tablero se parte en dos implementaciones detrás de un mismo contrato de props; la página elige cuál montar y el 3D se carga de forma diferida para que quien juegue en 2D no descargue Three.js.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript estricto, chess.js 1.4.0, react-chessboard 5.12.1, three 0.185 + @react-three/fiber 9 + @react-three/drei 10, @upstash/redis 1.38.2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-hito2-acciones-y-tablero-dual-design.md`

## Global Constraints

- Node 22.12.0 (`.nvmrc`). El `node` por defecto de la máquina es v18.20.5 y es demasiado viejo: prefijá cada comando con `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"`.
- TypeScript `strict`, sin `any` implícito.
- `npm run lint` debe salir 0. Nunca silenciar una regla con `eslint-disable`: reestructurar.
- El historial en SAN es la fuente de verdad de una partida. El `fen` es una conveniencia derivada y nunca decide reglas.
- Toda ruta bajo `/api/` valida la clave de acceso antes que nada, vía `withAccess`.
- Toda mutación de partida lleva el `ply` esperado y persiste con `putIfVersion`, devolviendo `conflict` si otro escritor se adelantó.
- Ninguna respuesta expone un `MatchState` crudo: todo sale por `toPublic`.
- Ningún test llama a un servicio externo real, salvo los de integración de Redis, que se saltean solos sin credenciales. Vitest NO carga `.env.local`: para correrlos hay que exportar con `set -a; . ./.env.local; set +a`.
- Las cinco pruebas end-to-end existentes deben seguir pasando, corriendo contra el tablero 2D.

---

### Task 1: Esquema v2 y el campo de oferta de tablas

**Files:**
- Modify: `src/core/match-state.ts`
- Modify: `src/server/match.ts` (`createMatch`, `submitMove`)
- Test: `src/server/store/memory.test.ts`, `src/core/match-state.test.ts`

**Interfaces:**
- Consumes: `SCHEMA_VERSION`, `MatchState`, `Color` de `@/core/match-state`.
- Produces: `MatchState.drawOffer: Color | null`; `SCHEMA_VERSION = 2`; `PublicMatch` expone `drawOffer`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/core/match-state.test.ts`, agregar dentro del `describe('toPublic')` existente:

```typescript
  it('expone drawOffer en la vista pública', () => {
    const estado = { ...partidaBase(), drawOffer: 'w' as const }
    expect(toPublic(estado).drawOffer).toBe('w')
  })
```

Si el helper de fixture no se llama `partidaBase`, usá el que ya exista en el archivo y agregale `drawOffer: null`.

En `src/server/store/memory.test.ts`, agregar:

```typescript
  it('rechaza una partida guardada con un esquema viejo', async () => {
    const store = new MemoryStore()
    const vieja = { ...partida('v1'), schema: 1 }
    await store.put(vieja)
    expect(await store.get('v1')).toBeNull()
  })
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/core/match-state.test.ts src/server/store/memory.test.ts`
Expected: FAIL — `drawOffer` no existe en el tipo, y `schema: 1` todavía se acepta porque `SCHEMA_VERSION` vale 1.

- [ ] **Step 3: Agregar el campo y subir la versión de esquema**

En `src/core/match-state.ts`:

```typescript
export const SCHEMA_VERSION = 2
```

y dentro de `MatchState`, junto a los demás campos:

```typescript
  /**
   * Color que tiene una oferta de tablas pendiente, o null si no hay ninguna.
   * Cualquier jugada aplicada la borra: si el rival mueve en vez de responder,
   * la oferta queda rechazada implícitamente (convención estándar del ajedrez).
   */
  drawOffer: Color | null
```

`PublicMatch` lo hereda solo, porque se define como `Omit<MatchState, 'players'>`.

- [ ] **Step 4: Inicializarlo y borrarlo donde corresponde**

En `src/server/match.ts`, dentro del objeto que arma `createMatch`, agregar `drawOffer: null`.

En `submitMove`, dentro del objeto `siguiente`, agregar:

```typescript
    // Cualquier jugada aplicada borra la oferta: si el rival movió en vez de
    // responder, queda rechazada implícitamente.
    drawOffer: null,
```

- [ ] **Step 5: Correr las pruebas**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test`
Expected: PASS. Van a fallar los fixtures de test que construyen un `MatchState` a mano sin `drawOffer` — agregales `drawOffer: null`. Es el compilador señalando exactamente los lugares que hay que tocar; no lo silencies con `as`.

- [ ] **Step 6: Correr también los de integración de Redis**

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"; set -a; . ./.env.local; set +a
npm test
```
Expected: PASS, sin tests salteados.

- [ ] **Step 7: Verificar tipos y build**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint`
Expected: ambos exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/core/match-state.ts src/server/match.ts src/core/match-state.test.ts src/server/store/memory.test.ts
git commit -m "feat(core): campo de oferta de tablas y esquema v2"
```

---

### Task 2: El árbitro resuelve las acciones

**Files:**
- Modify: `src/server/match.ts`
- Test: `src/server/match.test.ts`

**Interfaces:**
- Consumes: `MatchState`, `Color` de `@/core/match-state`; `MatchStore` de `@/server/store/types`; `MemoryStore` en los tests.
- Produces:
  - `type ActionKind = 'resign' | 'offer_draw' | 'accept_draw' | 'decline_draw'`
  - `type ActionError = 'not_found' | 'not_active' | 'bad_token' | 'stale_ply' | 'conflict' | 'already_offered' | 'no_offer'`
  - `type ActionRequest = { token: string; ply: number; action: ActionKind }`
  - `submitAction(store: MatchStore, id: string, req: ActionRequest): Promise<MatchState | ActionError>`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/server/match.test.ts` un bloque nuevo. Reutilizá el helper `partidaLista()` que ya existe en el archivo (crea una partida y suma el segundo jugador, devolviendo `{ id, blancas, negras }`).

```typescript
describe('submitAction', () => {
  it('rendirse termina la partida y gana el rival', async () => {
    const p = await partidaLista()
    const r = await submitAction(store, p.id, {
      token: p.blancas, ply: 0, action: 'resign',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.status).toBe('finished')
    expect(r.result).toBe('0-1')
    expect(r.reason).toBe('resignation')
  })

  it('se puede rendir aunque no sea tu turno', async () => {
    const p = await partidaLista()
    await submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'e2', to: 'e4' })
    // Ahora le toca a negras; blancas se rinde igual.
    const r = await submitAction(store, p.id, {
      token: p.blancas, ply: 1, action: 'resign',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.result).toBe('0-1')
  })

  it('ofrecer tablas registra la oferta sin terminar la partida', async () => {
    const p = await partidaLista()
    const r = await submitAction(store, p.id, {
      token: p.blancas, ply: 0, action: 'offer_draw',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.drawOffer).toBe('w')
    expect(r.status).toBe('active')
  })

  it('rechaza una segunda oferta del mismo color', async () => {
    const p = await partidaLista()
    await submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'offer_draw' })
    const r = await submitAction(store, p.id, {
      token: p.blancas, ply: 0, action: 'offer_draw',
    })
    expect(r).toBe('already_offered')
  })

  it('nadie puede aceptar su propia oferta', async () => {
    const p = await partidaLista()
    await submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'offer_draw' })
    const r = await submitAction(store, p.id, {
      token: p.blancas, ply: 0, action: 'accept_draw',
    })
    expect(r).toBe('no_offer')
  })

  it('el rival acepta y la partida termina en tablas por acuerdo', async () => {
    const p = await partidaLista()
    await submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'offer_draw' })
    const r = await submitAction(store, p.id, {
      token: p.negras, ply: 0, action: 'accept_draw',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.status).toBe('finished')
    expect(r.result).toBe('1/2-1/2')
    expect(r.reason).toBe('agreement')
  })

  it('el rival rechaza y la partida sigue sin oferta', async () => {
    const p = await partidaLista()
    await submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'offer_draw' })
    const r = await submitAction(store, p.id, {
      token: p.negras, ply: 0, action: 'decline_draw',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.drawOffer).toBeNull()
    expect(r.status).toBe('active')
  })

  it('aceptar sin que haya oferta devuelve no_offer', async () => {
    const p = await partidaLista()
    const r = await submitAction(store, p.id, {
      token: p.negras, ply: 0, action: 'accept_draw',
    })
    expect(r).toBe('no_offer')
  })

  it('una jugada aplicada borra la oferta pendiente', async () => {
    const p = await partidaLista()
    await submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'offer_draw' })
    const r = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'e2', to: 'e4',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.drawOffer).toBeNull()
  })

  it('rechaza un ply desactualizado', async () => {
    const p = await partidaLista()
    await submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'e2', to: 'e4' })
    const r = await submitAction(store, p.id, {
      token: p.negras, ply: 0, action: 'offer_draw',
    })
    expect(r).toBe('stale_ply')
  })

  it('rechaza un token desconocido', async () => {
    const p = await partidaLista()
    const r = await submitAction(store, p.id, {
      token: 'intruso', ply: 0, action: 'resign',
    })
    expect(r).toBe('bad_token')
  })

  it('rechaza actuar sobre una partida que espera rival', async () => {
    const creada = await createMatch(store, deps)
    const r = await submitAction(store, creada.state.id, {
      token: creada.token, ply: 0, action: 'resign',
    })
    expect(r).toBe('not_active')
  })

  it('rechaza actuar sobre una partida terminada', async () => {
    const p = await partidaLista()
    await submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'resign' })
    const r = await submitAction(store, p.id, {
      token: p.negras, ply: 0, action: 'offer_draw',
    })
    expect(r).toBe('not_active')
  })

  it('devuelve not_found si la partida no existe', async () => {
    const r = await submitAction(store, 'inexistente', {
      token: 'x', ply: 0, action: 'resign',
    })
    expect(r).toBe('not_found')
  })

  it('concurrencia: dos acciones simultáneas con el mismo ply, solo una gana', async () => {
    const p = await partidaLista()
    const [a, b] = await Promise.all([
      submitAction(store, p.id, { token: p.blancas, ply: 0, action: 'resign' }),
      submitAction(store, p.id, { token: p.negras, ply: 0, action: 'resign' }),
    ])
    const exitos = [a, b].filter((r) => typeof r !== 'string')
    const conflictos = [a, b].filter((r) => r === 'conflict')
    expect(exitos).toHaveLength(1)
    expect(conflictos).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/server/match.test.ts`
Expected: FAIL — `submitAction` no está definida.

- [ ] **Step 3: Implementar**

Agregar a `src/server/match.ts`:

```typescript
export type ActionKind = 'resign' | 'offer_draw' | 'accept_draw' | 'decline_draw'

export type ActionError =
  | 'not_found' | 'not_active' | 'bad_token'
  | 'stale_ply' | 'conflict' | 'already_offered' | 'no_offer'

export type ActionRequest = {
  token: string
  ply: number
  action: ActionKind
}

export async function submitAction(
  store: MatchStore,
  id: string,
  req: ActionRequest,
): Promise<MatchState | ActionError> {
  const state = await store.get(id)
  if (!state) return 'not_found'
  if (state.status !== 'active') return 'not_active'

  const color = colorDelToken(state, req.token)
  if (color === null) return 'bad_token'

  // Mismo orden que en submitMove: el ply antes que cualquier regla de la
  // acción, para que un cliente atrasado reciba el error preciso. Acá además
  // es lo que impide aceptar una oferta que ya caducó por una jugada.
  if (req.ply !== state.ply) return 'stale_ply'

  const rival: Color = color === 'w' ? 'b' : 'w'
  let parcial: Partial<MatchState>

  switch (req.action) {
    case 'resign':
      // Rendirse no depende del turno: podés hacerlo cuando le toca al rival.
      parcial = {
        status: 'finished',
        result: color === 'w' ? '0-1' : '1-0',
        reason: 'resignation',
        drawOffer: null,
      }
      break

    case 'offer_draw':
      if (state.drawOffer === color) return 'already_offered'
      parcial = { drawOffer: color }
      break

    case 'accept_draw':
      // Se exige que la oferta sea del color CONTRARIO, no que simplemente
      // exista: nadie puede aceptar la suya propia.
      if (state.drawOffer !== rival) return 'no_offer'
      parcial = {
        status: 'finished',
        result: '1/2-1/2',
        reason: 'agreement',
        drawOffer: null,
      }
      break

    case 'decline_draw':
      if (state.drawOffer !== rival) return 'no_offer'
      parcial = { drawOffer: null }
      break
  }

  const siguiente: MatchState = { ...state, ...parcial, version: state.version + 1 }
  const ok = await store.putIfVersion(siguiente, state.version)
  if (!ok) return 'conflict'
  return siguiente
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/server/match.test.ts`
Expected: PASS, 15 pruebas nuevas.

- [ ] **Step 5: Verificar que el test de concurrencia es portante**

Cambiá temporalmente `putIfVersion` por `put` en `submitAction`, corré solo ese test y confirmá que **falla** (dos éxitos, cero conflictos). Después revertí y confirmá que vuelve a pasar. Reportá lo que viste.

- [ ] **Step 6: Suite completa, tipos y lint**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint`
Expected: todo limpio.

- [ ] **Step 7: Commit**

```bash
git add src/server/match.ts src/server/match.test.ts
git commit -m "feat(match): rendición y tablas por acuerdo en el árbitro"
```

---

### Task 3: El endpoint de acciones

**Files:**
- Create: `src/app/api/match/[id]/action/route.ts`
- Test: `src/app/api/match/routes.test.ts`

**Interfaces:**
- Consumes: `submitAction`, `ActionError`, `ActionKind` de `@/server/match`; `withAccess`, `isValidMatchId` de `@/server/auth`; `getStore` de `@/server/store`; `toPublic` de `@/core/match-state`.
- Produces: `POST /api/match/:id/action`, respuesta `{ match }`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `src/app/api/match/routes.test.ts`. Seguí el patrón que ya usa el archivo: importar el handler y llamarlo con un `Request` y `{ params: Promise.resolve({ id }) }`.

```typescript
import { POST as actuar } from '@/app/api/match/[id]/action/route'

describe('ruta de acciones', () => {
  it('rendirse termina la partida y no filtra tokens', async () => {
    const p = await crearPartidaConDosJugadores()
    const res = await actuar(
      pedirConClave({ token: p.tokenBlancas, ply: 0, action: 'resign' }),
      ctx(p.id),
    )
    expect(res.status).toBe(200)
    const texto = await res.text()
    expect(texto).not.toContain(p.tokenBlancas)
    expect(texto).not.toContain(p.tokenNegras)
    const cuerpo = JSON.parse(texto)
    expect(cuerpo.match.status).toBe('finished')
    expect(cuerpo.match.reason).toBe('resignation')
  })

  it('devuelve 403 sin la cabecera de clave', async () => {
    const p = await crearPartidaConDosJugadores()
    const res = await actuar(
      new Request('http://x/api', {
        method: 'POST',
        body: JSON.stringify({ token: p.tokenBlancas, ply: 0, action: 'resign' }),
      }),
      ctx(p.id),
    )
    expect(res.status).toBe(403)
  })

  it('una acción desconocida da 400', async () => {
    const p = await crearPartidaConDosJugadores()
    const res = await actuar(
      pedirConClave({ token: p.tokenBlancas, ply: 0, action: 'volar' }),
      ctx(p.id),
    )
    expect(res.status).toBe(400)
  })

  it('un cuerpo ausente da 400 y no 500', async () => {
    const p = await crearPartidaConDosJugadores()
    const res = await actuar(pedirConClave(undefined), ctx(p.id))
    expect(res.status).toBe(400)
  })

  it('already_offered y no_offer dan 409', async () => {
    const p = await crearPartidaConDosJugadores()
    await actuar(pedirConClave({ token: p.tokenBlancas, ply: 0, action: 'offer_draw' }), ctx(p.id))
    const repetida = await actuar(
      pedirConClave({ token: p.tokenBlancas, ply: 0, action: 'offer_draw' }), ctx(p.id))
    expect(repetida.status).toBe(409)

    const sinOferta = await actuar(
      pedirConClave({ token: p.tokenBlancas, ply: 0, action: 'accept_draw' }), ctx(p.id))
    expect(sinOferta.status).toBe(409)
  })

  it('un id que no tiene forma de uuid da 404 sin llegar al almacén', async () => {
    const res = await actuar(
      pedirConClave({ token: 'x', ply: 0, action: 'resign' }),
      ctx('no-es-un-uuid'),
    )
    expect(res.status).toBe(404)
  })
})
```

Los helpers `crearPartidaConDosJugadores`, `pedirConClave` y `ctx` ya existen o son triviales de extraer del archivo. Si tienen otro nombre, usá los que estén — no dupliques.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/app/api/match/routes.test.ts`
Expected: FAIL — el módulo de la ruta no existe.

- [ ] **Step 3: Implementar la ruta**

`src/app/api/match/[id]/action/route.ts`:

```typescript
import { withAccess, isValidMatchId } from '@/server/auth'
import { getStore } from '@/server/store'
import { submitAction, type ActionError, type ActionKind } from '@/server/match'
import { toPublic } from '@/core/match-state'

const ESTADO_HTTP: Record<ActionError, number> = {
  not_found: 404,
  not_active: 409,
  stale_ply: 409,
  conflict: 409,
  already_offered: 409,
  no_offer: 409,
  bad_token: 403,
}

const ACCIONES: readonly ActionKind[] = [
  'resign', 'offer_draw', 'accept_draw', 'decline_draw',
]

function esAccion(v: unknown): v is ActionKind {
  return typeof v === 'string' && (ACCIONES as readonly string[]).includes(v)
}

function esCuerpoValido(
  c: unknown,
): c is { token: string; ply: number; action: ActionKind } {
  if (typeof c !== 'object' || c === null) return false
  const o = c as Record<string, unknown>
  return typeof o.token === 'string' && typeof o.ply === 'number' && esAccion(o.action)
}

export const POST = withAccess(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params
  if (!isValidMatchId(id)) return Response.json({ error: 'not_found' }, { status: 404 })

  const cuerpo: unknown = await req.json().catch(() => null)
  if (!esCuerpoValido(cuerpo)) {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }

  const r = await submitAction(getStore(), id, {
    token: cuerpo.token, ply: cuerpo.ply, action: cuerpo.action,
  })

  if (typeof r === 'string') {
    return Response.json({ error: r }, { status: ESTADO_HTTP[r] })
  }
  return Response.json({ match: toPublic(r) })
})
```

Verificá la firma exacta de `withAccess` en `src/server/auth.ts` antes de escribirla: ya envuelve las cuatro rutas existentes y pone `cache-control: no-store`. Copiá el patrón de `src/app/api/match/[id]/move/route.ts`, que es el más parecido.

- [ ] **Step 4: Correr las pruebas**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/app/api/match/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Suite completa, tipos, lint y build**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx next build`
Expected: todo limpio, y la ruta nueva aparece como `ƒ (Dynamic)` en la salida del build.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/match/\[id\]/action/route.ts src/app/api/match/routes.test.ts
git commit -m "feat(api): endpoint de acciones de partida"
```

---

### Task 4: El cliente y los botones

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/useMatch.ts`
- Create: `src/components/AccionesPartida.tsx`
- Modify: `src/app/match/[id]/page.tsx`
- Test: `src/client/useMatch.test.ts`, `src/components/AccionesPartida.test.tsx`

**Interfaces:**
- Consumes: `apiAction`; `useMatch` de `@/client/useMatch`; `PublicMatch`, `Color` de `@/core/match-state`.
- Produces:
  - `apiAction(id, accessKey, { token, ply, action })` en `api.ts`
  - `useMatch` devuelve además `accionar(action: ActionKind): Promise<boolean>`
  - `<AccionesPartida match color onAccion errorAccion />`

- [ ] **Step 1: Escribir los tests que fallan**

`src/components/AccionesPartida.test.tsx` (necesita entorno jsdom; poné el docblock arriba de todo, como hace `useMatch.test.ts`):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccionesPartida } from './AccionesPartida'
import type { PublicMatch } from '@/core/match-state'

function partida(extra: Partial<PublicMatch> = {}): PublicMatch {
  return {
    id: 'x', schema: 2, history: [], fen: '', ply: 0,
    players: {
      w: { kind: 'human', label: 'Blancas', taken: true, open: false },
      b: { kind: 'human', label: 'Negras', taken: true, open: false },
    },
    status: 'active', result: null, reason: null, createdAt: 1, version: 0,
    drawOffer: null,
    ...extra,
  }
}

describe('AccionesPartida', () => {
  it('un espectador no ve ningún botón', () => {
    render(<AccionesPartida match={partida()} color={null} onAccion={vi.fn()} errorAccion={null} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('un jugador ve rendirse y ofrecer tablas', () => {
    render(<AccionesPartida match={partida()} color="w" onAccion={vi.fn()} errorAccion={null} />)
    expect(screen.getByRole('button', { name: /rendirme/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /ofrecer tablas/i })).toBeTruthy()
  })

  it('con una oferta propia pendiente, el botón queda deshabilitado', () => {
    render(<AccionesPartida match={partida({ drawOffer: 'w' })} color="w" onAccion={vi.fn()} errorAccion={null} />)
    const boton = screen.getByRole('button', { name: /tablas ofrecidas/i })
    expect(boton.hasAttribute('disabled')).toBe(true)
  })

  it('con una oferta del rival aparecen aceptar y rechazar', () => {
    render(<AccionesPartida match={partida({ drawOffer: 'b' })} color="w" onAccion={vi.fn()} errorAccion={null} />)
    expect(screen.getByRole('button', { name: /aceptar/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeTruthy()
  })

  it('en una partida terminada no hay botones', () => {
    render(<AccionesPartida match={partida({ status: 'finished' })} color="w" onAccion={vi.fn()} errorAccion={null} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('rendirse pide confirmación antes de avisar al padre', async () => {
    const onAccion = vi.fn()
    const { getByRole } = render(
      <AccionesPartida match={partida()} color="w" onAccion={onAccion} errorAccion={null} />,
    )
    getByRole('button', { name: /rendirme/i }).click()
    expect(onAccion).not.toHaveBeenCalled()
    getByRole('button', { name: /confirmar/i }).click()
    expect(onAccion).toHaveBeenCalledWith('resign')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/components/AccionesPartida.test.tsx`
Expected: FAIL — el componente no existe.

- [ ] **Step 3: Agregar `apiAction`**

En `src/client/api.ts`, junto a `apiMove` y siguiendo exactamente su forma:

```typescript
export const apiAction = (
  id: string,
  accessKey: string,
  cuerpo: { token: string; ply: number; action: string },
) =>
  pedir<GetResponse>(`/api/match/${id}/action`, accessKey, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  })
```

- [ ] **Step 4: Agregar `accionar` al hook**

En `src/client/useMatch.ts`, modelá `accionar` sobre el `mover` que ya existe: mismo manejo de credenciales, mismo incremento de `fallosConsecutivos` en el catch, misma aplicación del estado por la vía que compara `version`, y el mismo canal `errorJugada` para el rechazo. Devolvé `boolean`. Agregalo al objeto que retorna el hook.

No inventes un tercer canal de error: una acción rechazada es del mismo tipo que una jugada rechazada desde el punto de vista del jugador.

- [ ] **Step 5: Escribir el componente**

`src/components/AccionesPartida.tsx`. Requisitos que los tests fijan: sin botones para espectadores (`color === null`) ni con `status !== 'active'`; rendirse pide confirmación en dos pasos con un botón cuyo nombre accesible contenga "confirmar"; el botón de tablas dice "Ofrecer tablas" normalmente y "Tablas ofrecidas" deshabilitado cuando `match.drawOffer === color`; con `match.drawOffer` del color contrario aparecen "Aceptar" y "Rechazar". Mostrá `errorAccion` traducido, reutilizando el mapa de códigos a español que ya existe en `src/app/match/[id]/page.tsx` — extraelo a un módulo compartido en vez de duplicarlo, y agregale `already_offered` y `no_offer`.

- [ ] **Step 6: Montarlo en la página**

En `src/app/match/[id]/page.tsx`, renderizá `<AccionesPartida>` debajo del tablero, pasándole `match`, el `color` del jugador (o `null`), `accionar` del hook y `errorJugada`. En el bloque de fin de partida, distinguí el motivo: rendición, acuerdo, mate, ahogado, repetición, 50 jugadas y material insuficiente, cada uno con su frase.

- [ ] **Step 7: Correr las pruebas**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test`
Expected: PASS.

- [ ] **Step 8: Probarlo a mano con dos navegadores**

```bash
PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run dev
```

Creá una partida, unite desde una ventana de incógnito, y comprobá: que ofrecer tablas le aparece al otro en 4 segundos o menos; que aceptar termina la partida en ambas pantallas; que rechazar la deja seguir; que mover en vez de responder borra la oferta; y que rendirse termina la partida con el resultado correcto de los dos lados. Frená el servidor al terminar.

- [ ] **Step 9: Tipos, lint y build**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx next build`
Expected: todo limpio.

- [ ] **Step 10: Commit**

```bash
git add src/client/api.ts src/client/useMatch.ts src/components/AccionesPartida.tsx src/components/AccionesPartida.test.tsx src/app/match/\[id\]/page.tsx
git commit -m "feat(ui): botones de rendirse y ofrecer tablas"
```

---

### Task 5: El contrato del tablero y la preferencia

**Files:**
- Rename: `src/components/Board.tsx` → `src/components/Board2D.tsx`
- Create: `src/components/boardContract.ts`
- Create: `src/components/decidirJugada.ts`
- Create: `src/client/preferenciaTablero.ts`
- Test: `src/components/decidirJugada.test.ts`, `src/client/preferenciaTablero.test.ts`
- Modify: `src/app/match/[id]/page.tsx`

**Interfaces:**
- Produces:
  - `type BoardProps = { fen: string; history: string[]; orientation: Color; puedeMover: boolean; onMove: (from, to, promotion?) => void }` en `boardContract.ts`
  - `Board2D` (el componente actual, renombrado, tipado con `BoardProps`)
  - `type ModoTablero = '2d' | '3d'`
  - `soportaWebGL(): boolean`
  - `cargarPreferencia(): ModoTablero`, `guardarPreferencia(m: ModoTablero): void`
  - `decidirJugada(history: string[], from: string, to: string): { from: string; to: string; promotion?: string } | null`

- [ ] **Step 1: Escribir los tests que fallan**

`src/client/preferenciaTablero.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { cargarPreferencia, guardarPreferencia } from './preferenciaTablero'

beforeEach(() => localStorage.clear())

describe('preferenciaTablero', () => {
  it('sin nada guardado, el modo por defecto es 3d', () => {
    expect(cargarPreferencia()).toBe('3d')
  })

  it('guarda y recupera la elección', () => {
    guardarPreferencia('2d')
    expect(cargarPreferencia()).toBe('2d')
  })

  it('ignora un valor corrupto y vuelve al defecto', () => {
    localStorage.setItem('chess:tablero', 'plasma')
    expect(cargarPreferencia()).toBe('3d')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/client/preferenciaTablero.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Escribir el contrato y la preferencia**

`src/components/boardContract.ts`:

```typescript
import type { Color } from '@/core/match-state'

/**
 * Contrato que cumplen las dos implementaciones de tablero. Ninguna sabe nada
 * del servidor: reciben la posición y avisan hacia arriba cuando el jugador
 * intenta una jugada.
 */
export type BoardProps = {
  fen: string
  /** Historial en SAN. Necesario para validar en el cliente antes de enviar. */
  history: string[]
  orientation: Color
  puedeMover: boolean
  onMove: (from: string, to: string, promotion?: string) => void
}
```

`src/client/preferenciaTablero.ts`:

```typescript
export type ModoTablero = '2d' | '3d'

const CLAVE = 'chess:tablero'
const POR_DEFECTO: ModoTablero = '3d'

export function cargarPreferencia(): ModoTablero {
  if (typeof localStorage === 'undefined') return POR_DEFECTO
  const v = localStorage.getItem(CLAVE)
  return v === '2d' || v === '3d' ? v : POR_DEFECTO
}

export function guardarPreferencia(m: ModoTablero): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CLAVE, m)
}

/**
 * Se comprueba antes de montar el 3D. Sin esto, un dispositivo sin WebGL
 * mostraría un lienzo en blanco en vez de un tablero.
 */
export function soportaWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
```

- [ ] **Step 3b: Extraer la decisión de jugada a una función pura**

El spec exige probar que un intento ilegal no avisa hacia arriba y uno legal sí,
coronación incluida. Probar eso a través del DOM de `react-chessboard` es
frágil, y encima los dos tableros necesitan exactamente la misma lógica. Va a un
módulo propio.

`src/components/decidirJugada.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { decidirJugada } from './decidirJugada'

describe('decidirJugada', () => {
  it('acepta una jugada legal sin coronación', () => {
    expect(decidirJugada([], 'e2', 'e4')).toEqual({ from: 'e2', to: 'e4' })
  })

  it('rechaza una jugada ilegal', () => {
    expect(decidirJugada([], 'e2', 'e5')).toBeNull()
  })

  it('rechaza casillas inexistentes', () => {
    expect(decidirJugada([], 'z9', 'a1')).toBeNull()
  })

  it('corona a dama cuando la jugada lo exige', () => {
    // chess.js 1.4.0 NO asume dama: sin `promotion` esta jugada es ilegal.
    const historial = ['h4', 'g5', 'hxg5', 'h6', 'gxh6', 'a5', 'g4', 'a4', 'g5',
                       'a3', 'g6', 'axb2', 'g7', 'bxa1=Q']
    expect(decidirJugada(historial, 'g7', 'h8')).toEqual({
      from: 'g7', to: 'h8', promotion: 'q',
    })
  })
})
```

Corré y confirmá que falla (el módulo no existe). Después:

```typescript
import { applyMove } from '@/core/game'

/**
 * Decide qué jugada mandar al servidor, o null si el intento es ilegal.
 * Validación optimista compartida por los dos tableros: se rechaza acá lo que
 * el servidor rechazaría, para que la pieza vuelva a su casilla al instante.
 */
export function decidirJugada(
  history: string[],
  from: string,
  to: string,
): { from: string; to: string; promotion?: string } | null {
  if (applyMove(history, { from, to })) return { from, to }
  // Un peón que llega a la última fila necesita pieza de coronación: chess.js
  // no asume dama y sin el campo la jugada es ilegal. Se corona a dama sin
  // preguntar; elegir otra pieza es trabajo posterior.
  if (applyMove(history, { from, to, promotion: 'q' })) return { from, to, promotion: 'q' }
  return null
}
```

Corré el test de nuevo: debe pasar.

- [ ] **Step 4: Renombrar el tablero actual**

```bash
git mv src/components/Board.tsx src/components/Board2D.tsx
```

Renombrá el componente exportado a `Board2D`, importá `BoardProps` de `./boardContract` y usalo como tipo de props en vez del `type Props` local. Reemplazá los dos intentos de `applyMove` que hoy están en línea dentro de `onPieceDrop` por una sola llamada a `decidirJugada`, que hace exactamente lo mismo y ahora está cubierta por tests. Actualizá el import en `src/app/match/[id]/page.tsx`.

- [ ] **Step 5: Correr todo**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint`
Expected: todo pasa. Los tests e2e todavía no se tocan y deben seguir verdes.

- [ ] **Step 6: Commit**

```bash
git add -u && git add src/components/boardContract.ts src/client/preferenciaTablero.ts src/client/preferenciaTablero.test.ts
git commit -m "refactor(ui): contrato de tablero y preferencia de modo"
```

---

### Task 6: Portar la geometría 3D

**Files:**
- Create: `src/components/board3d/pieceGeometry.ts`
- Create: `src/components/board3d/Piece.tsx`
- Create: `src/components/board3d/BoardMesh.tsx`
- Modify: `package.json`

**Interfaces:**
- Produces: las geometrías de las seis piezas y los componentes de malla que la Task 7 compone en una escena interactiva.

- [ ] **Step 1: Instalar las dependencias**

```bash
PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm install three@^0.185.1 @react-three/fiber@^9.7.0 @react-three/drei@^10.7.8
PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm install -D @types/three@^0.185.4
```

- [ ] **Step 2: Copiar los archivos de la prueba de concepto**

La prueba vive en la rama `spike/tablero-3d`, en un worktree. Traé los tres archivos de geometría tal cual:

```bash
git show spike/tablero-3d:src/app/spike-3d/pieceGeometry.ts > src/components/board3d/pieceGeometry.ts
git show spike/tablero-3d:src/app/spike-3d/Piece.tsx        > src/components/board3d/Piece.tsx
git show spike/tablero-3d:src/app/spike-3d/BoardMesh.tsx    > src/components/board3d/BoardMesh.tsx
```

Creá el directorio antes si hace falta. Ajustá los imports relativos que hayan quedado apuntando a `src/app/spike-3d/`.

- [ ] **Step 3: Leerlos y entenderlos antes de seguir**

No los trates como una caja negra: la Task 7 los va a modificar. Las piezas se generan con superficies de revolución (`LatheGeometry`) a partir de un perfil, y el caballo es el caso especial. Si algo del código de la prueba está a medio hacer o tiene restos de depuración, limpialo ahora.

- [ ] **Step 4: Verificar que compila**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint`
Expected: exit 0 en ambos. Nada los usa todavía; esto solo confirma que el port está sano.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/board3d/
git commit -m "feat(3d): geometría de piezas y tablero portada del prototipo"
```

---

### Task 7: El tablero 3D interactivo

**Files:**
- Create: `src/components/board3d/Board3D.tsx`
- Create: `src/components/board3d/Scene.tsx`
- Test: `src/components/board3d/seleccion.test.ts`
- Create: `src/components/board3d/seleccion.ts`

**Interfaces:**
- Consumes: `BoardProps` y `decidirJugada` de `@/components/`; la geometría de la Task 6.
- Produces: `Board3D` cumpliendo `BoardProps`; `destinosLegales(history, desde): string[]` en `seleccion.ts`.

- [ ] **Step 1: Escribir el test de la lógica de selección**

La parte testeable sin WebGL es qué casillas se resaltan. Extraela a un módulo puro.

`src/components/board3d/seleccion.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { destinosLegales } from './seleccion'

describe('destinosLegales', () => {
  it('un peón inicial puede avanzar una o dos casillas', () => {
    expect(destinosLegales([], 'e2').sort()).toEqual(['e3', 'e4'])
  })

  it('una pieza bloqueada no tiene destinos', () => {
    expect(destinosLegales([], 'a1')).toEqual([])
  })

  it('una casilla vacía no tiene destinos', () => {
    expect(destinosLegales([], 'e4')).toEqual([])
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/components/board3d/seleccion.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar la selección**

`src/components/board3d/seleccion.ts`:

```typescript
import { Chess, type Square } from 'chess.js'

/**
 * Casillas a las que la pieza de `desde` puede moverse legalmente.
 * Se usa para resaltar destinos al seleccionar una pieza en el tablero 3D.
 */
export function destinosLegales(history: string[], desde: string): string[] {
  const chess = new Chess()
  for (const san of history) chess.move(san)
  return chess
    .moves({ square: desde as Square, verbose: true })
    .map((m) => m.to)
}
```

- [ ] **Step 4: Correr el test**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm test src/components/board3d/seleccion.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir la escena y el tablero**

`Scene.tsx` y `Board3D.tsx`, partiendo de `git show spike/tablero-3d:src/app/spike-3d/Scene.tsx` y `page.tsx` como referencia. `Board3D` debe cumplir `BoardProps` exactamente, sin props extra.

**El punto crítico de esta tarea, y la razón por la que existe**: la prueba de concepto descubrió que las piezas altas de la primera fila tapan a los peones de la segunda, así que un click apuntado al suelo de una casilla impacta en la pieza de adelante. Se resuelve con dos capas de rayo:

- Para **seleccionar** una pieza, el rayo va contra las mallas de las piezas.
- Para **elegir destino**, el rayo va contra un plano invisible a la altura del tablero, ignorando por completo la geometría de las piezas.

En la práctica: una malla `<mesh>` del tamaño del tablero, con material transparente y `visible={false}` pero presente para el raycaster, montada **solo cuando hay una pieza seleccionada**. Los eventos de las piezas se detienen con `e.stopPropagation()` únicamente en el modo de selección.

Requisitos funcionales: click para seleccionar con los destinos legales resaltados, click en un destino para mover, click en la pieza ya seleccionada para deseleccionar, cámara orbitable, y respetar `orientation` para que quien juega con negras vea el tablero dado vuelta. Con `puedeMover` en falso, seleccionar no debe hacer nada.

Coronación: **no la reimplementes**. Usá `decidirJugada(history, from, to)` de `@/components/decidirJugada`, la misma función que usa el tablero 2D, y si devuelve `null` no llames a `onMove`.

- [ ] **Step 6: Verificar a mano que la oclusión está resuelta**

Levantá el proyecto y, en el tablero 3D, **mové un peón de la fila 2 diez veces seguidas desde el ángulo por defecto**. Ese es el caso que fallaba. Si algún click selecciona la pieza equivocada, el arreglo no está bien y hay que corregirlo antes de seguir. Reportá qué observaste.

- [ ] **Step 7: Tipos, lint y build**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx next build`
Expected: todo limpio.

- [ ] **Step 8: Commit**

```bash
git add src/components/board3d/
git commit -m "feat(3d): tablero interactivo con selección por capas"
```

---

### Task 8: El interruptor en la página

**Files:**
- Modify: `src/app/match/[id]/page.tsx`
- Create: `src/components/SelectorTablero.tsx`

**Interfaces:**
- Consumes: `Board2D`, `Board3D`, `BoardProps`, `cargarPreferencia`, `guardarPreferencia`, `soportaWebGL`.
- Produces: la página monta uno u otro tablero y ofrece cambiar.

- [ ] **Step 1: Cargar el 3D de forma diferida**

En `src/app/match/[id]/page.tsx`:

```typescript
import dynamic from 'next/dynamic'

// Importación diferida y sin render en servidor: Three.js pesa, y quien juegue
// en 2D no debe descargarlo. `ssr: false` además evita que WebGL se toque
// durante el render del servidor, donde no existe.
const Board3D = dynamic(
  () => import('@/components/board3d/Board3D').then((m) => m.Board3D),
  { ssr: false, loading: () => <p>Cargando tablero 3D…</p> },
)
```

- [ ] **Step 2: Elegir el modo al montar**

La preferencia por defecto es `3d`, pero **si `soportaWebGL()` da falso hay que caer a 2D y avisarlo una vez**, sin ofrecer un interruptor que no va a funcionar. Resolvelo en un efecto que corra una sola vez, no durante el render — `localStorage` y `document` no existen en el servidor, y el proyecto ya se quemó una vez con un `ReferenceError: localStorage is not defined` que solo apareció en `next build`.

- [ ] **Step 3: El selector**

`src/components/SelectorTablero.tsx`: un control con dos opciones, 2D y 3D, que marca la activa, llama a `guardarPreferencia` al cambiar, y **no se renderiza si WebGL no está disponible**. Ponelo cerca del tablero, no escondido al pie.

- [ ] **Step 4: Probarlo a mano**

Levantá el proyecto y comprobá: que entra en 3D la primera vez; que al cambiar a 2D y recargar sigue en 2D; que jugar funciona en los dos; que quien juega con negras ve el tablero dado vuelta en ambos; y que al cambiar de modo en medio de una partida la posición se conserva. Frená el servidor al terminar.

- [ ] **Step 5: Verificar que el 3D no se descarga en 2D**

Con las herramientas de desarrollo abiertas en la pestaña de red, cargá una partida en modo 2D y confirmá que **no** se pide ningún fragmento de Three.js. Después cambiá a 3D y confirmá que recién ahí se descarga. Reportá los tamaños que viste.

- [ ] **Step 6: Tipos, lint y build**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx tsc --noEmit && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run lint && PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npx next build`
Expected: todo limpio.

- [ ] **Step 7: Commit**

```bash
git add src/app/match/\[id\]/page.tsx src/components/SelectorTablero.tsx
git commit -m "feat(ui): interruptor 2D/3D con repliegue por WebGL"
```

---

### Task 9: Pruebas end-to-end

**Files:**
- Modify: `e2e/support.ts`
- Modify: `e2e/dos-jugadores.spec.ts`, `e2e/movimiento-ilegal.spec.ts`, `e2e/espectador.spec.ts`, `e2e/acceso.spec.ts`
- Create: `e2e/rendicion.spec.ts`, `e2e/tablas.spec.ts`, `e2e/tablero-3d.spec.ts`

**Interfaces:**
- Consumes: los helpers que ya existen en `e2e/support.ts`, incluido el arrastre manual `arrastrar` (`locator.dragTo()` NO funciona con este tablero: `react-chessboard` 5.x usa `@dnd-kit`, que necesita eventos intermedios de puntero).

- [ ] **Step 1: Forzar 2D en las pruebas existentes**

En `e2e/support.ts`, agregá un helper que fije la preferencia **antes** de que la página cargue, con `addInitScript`:

```typescript
export async function forzar2D(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem('chess:tablero', '2d')
  })
}
```

Llamalo al crear cada contexto en las cuatro specs existentes. Sin esto se montaría el 3D y los selectores `data-square` no existirían.

- [ ] **Step 2: Correr las existentes y confirmar que siguen verdes**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run test:e2e`
Expected: 5/5 pasan.

- [ ] **Step 3: Prueba de rendición**

`e2e/rendicion.spec.ts`: dos contextos, blancas crea, negras se une. Blancas hace click en "Rendirme", confirma, y **ambas pantallas** muestran la partida terminada con victoria de negras. Verificá el lado de negras también: es lo que prueba que el estado se propagó por el servidor y no es solo optimismo local.

- [ ] **Step 4: Prueba de tablas acordadas**

`e2e/tablas.spec.ts`: blancas ofrece tablas; negras ve aparecer los botones de aceptar y rechazar (con `expect(...).toBeVisible()`, que espera solo — la consulta es cada 4 segundos, así que no asumas propagación instantánea); negras acepta; ambas pantallas muestran tablas por acuerdo.

Agregá un segundo caso en el mismo archivo: blancas ofrece, **negras mueve en vez de responder**, y los botones de aceptar/rechazar desaparecen — la oferta caducó.

- [ ] **Step 5: Prueba de humo del 3D**

`e2e/tablero-3d.spec.ts`: cargar una partida **sin** forzar 2D, confirmar que aparece el lienzo (`canvas`) y que no hay errores de consola. **No intentes arrastrar piezas**: eso requeriría coordenadas de píxeles y es exactamente lo que este hito evita.

- [ ] **Step 6: Correr todo tres veces**

Run: `PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" npm run test:e2e` (tres veces seguidas)
Expected: todas verdes las tres veces. **La fragilidad cuenta como defecto**: si alguna corrida falla de forma intermitente, arreglá la causa, no alargues los timeouts.

- [ ] **Step 7: Commit**

```bash
git add e2e/
git commit -m "test(e2e): rendición, tablas y humo del tablero 3D"
```

---

### Task 10: Documentación

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/2026-08-18-hito1-pendientes.md`

- [ ] **Step 1: Actualizar el README**

Agregá: que se puede rendirse y acordar tablas; que el tablero viene en 3D por defecto y se puede cambiar a 2D, con la preferencia recordada; que en dispositivos sin WebGL cae a 2D solo. En limitaciones conocidas, agregá que no se puede retirar una oferta de tablas propia y por qué.

Verificá que todo comando que el README menciona sigue funcionando, corriéndolo.

- [ ] **Step 2: Cerrar los pendientes que este hito resolvió**

En `docs/superpowers/2026-08-18-hito1-pendientes.md`, los dos huecos de prueba —el canal de errores del cliente y la página de partida sin tests— dejaron de estar abiertos si las tareas 4 y 9 los cubrieron. Comprobalo de verdad antes de tacharlos: si `src/app/match/[id]/page.tsx` sigue sin cobertura directa, decilo en vez de darlo por hecho.

- [ ] **Step 3: Verificación final**

Run, todo en limpio:

```bash
export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH"; set -a; . ./.env.local; set +a
npm test && npm run lint && npx tsc --noEmit && npx next build && npm run test:e2e
```
Expected: todo verde, con los tests de integración de Redis corriendo y sin saltearse.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/2026-08-18-hito1-pendientes.md
git commit -m "docs: acciones de partida y tablero dual en el README"
```

---

## Qué queda fuera de este hito

- Piezas 3D más pulidas, animación de captura y sonido.
- Elección de pieza al coronar: se sigue coronando a dama en ambos tableros.
- Límite de intentos para la clave de acceso (heredado del hito 1).
- Reloj de partida, revancha, historial de partidas.

El worktree y la rama `spike/tablero-3d` se descartan cuando este hito cierre.
