# Hito 1 — Dos personas, dos dispositivos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos personas juegan una partida completa de ajedrez desde dispositivos distintos, unidas por un link de invitación, con el servidor como única autoridad sobre el estado.

**Architecture:** Next.js App Router. El estado canónico de cada partida vive en el servidor detrás de una interfaz `MatchStore` (primero en memoria, después Upstash Redis). El núcleo de reglas es un módulo puro sobre `chess.js` que toma el historial de jugadas como fuente de verdad y deriva la posición, para que la repetición triple y la regla de 50 jugadas funcionen. El cliente valida de forma optimista con el mismo módulo y consulta el estado cada 4 segundos mientras espera al rival.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript estricto, chess.js 1.4.0, react-chessboard 5.12.1, @upstash/redis 1.38.2, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-chess-llm-design.md`

## Global Constraints

- TypeScript en modo `strict`. Nada de `any` implícito.
- **`chess.js` 1.4.0: `move()` lanza `Error("Invalid move: ...")` con jugadas ilegales.** Siempre envolver en `try/catch`. No comparar contra `null`.
- **`react-chessboard` 5.12.1: toda la configuración va en la prop `options`.** `onPieceDrop` recibe `{ piece, sourceSquare, targetSquare }`, devuelve `boolean`, y **`targetSquare` puede ser `null`** cuando se suelta la pieza fuera del tablero.
- El historial de jugadas en SAN es la fuente de verdad de una partida. El FEN se guarda solo como conveniencia para el cliente y nunca se usa para decidir reglas.
- Toda ruta bajo `/api/` valida la clave de acceso antes de cualquier otra cosa.
- Todo movimiento lleva el `ply` esperado. Si no coincide con el estado guardado, se rechaza sin aplicar.
- Ninguna prueba llama a un servicio externo real, salvo la prueba de integración de Redis, que se salta sola si no hay credenciales.

---

### Task 1: Andamiaje del proyecto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `npm test` (Vitest), `npm run dev` (Next), `npm run build`.

- [ ] **Step 1: Crear el proyecto**

```bash
cd /Users/chrisnatale/Desktop/chess
npx create-next-app@16.3.1 . --typescript --app --src-dir --eslint --no-tailwind --import-alias "@/*"
```

Si el directorio ya tiene `docs/`, `create-next-app` pide confirmación: aceptar, no borra `docs/`.

- [ ] **Step 2: Instalar dependencias**

```bash
npm install chess.js@1.4.0 react-chessboard@5.12.1 @upstash/redis@1.38.2
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 3: Configurar Vitest**

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

Agregar a `package.json`:

```json
"scripts": { "test": "vitest run", "test:watch": "vitest" }
```

- [ ] **Step 4: Escribir la prueba de humo**

`src/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'

describe('andamiaje', () => {
  it('chess.js está instalado y arranca en la posición inicial', () => {
    const chess = new Chess()
    expect(chess.turn()).toBe('w')
    expect(chess.moves()).toHaveLength(20)
  })

  it('move() lanza excepción con una jugada ilegal', () => {
    const chess = new Chess()
    expect(() => chess.move('e5')).toThrow(/Invalid move/)
  })
})
```

- [ ] **Step 5: Correr las pruebas**

Run: `npm test`
Expected: PASS, 2 pruebas.

- [ ] **Step 6: Verificar que compila**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 7: Crear `.env.example`**

```
ACCESS_KEY=cambiame
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Crear también `.env.local` con `ACCESS_KEY=dev` para trabajar en local. Confirmar que `.env.local` está en `.gitignore`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: andamiaje Next.js + Vitest"
```

---

### Task 2: Núcleo de reglas (`core/game`)

Módulo puro. No conoce HTTP, ni almacenamiento, ni React. Recibe el historial de jugadas en SAN y responde sobre él.

**Files:**
- Create: `src/core/game.ts`
- Test: `src/core/game.test.ts`

**Interfaces:**
- Consumes: `chess.js`.
- Produces:
  - `type MoveInput = { from: string; to: string; promotion?: string }`
  - `type Outcome = { over: boolean; result: '1-0' | '0-1' | '1/2-1/2' | null; reason: string | null }`
  - `type AppliedMove = { history: string[]; fen: string; san: string }`
  - `legalMoves(history: string[]): string[]`
  - `applyMove(history: string[], move: MoveInput): AppliedMove | null`
  - `fenOf(history: string[]): string`
  - `turnOf(history: string[]): 'w' | 'b'`
  - `outcomeOf(history: string[]): Outcome`

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/core/game.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { legalMoves, applyMove, fenOf, turnOf, outcomeOf } from './game'

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('legalMoves', () => {
  it('hay 20 jugadas legales en la posición inicial', () => {
    expect(legalMoves([])).toHaveLength(20)
  })
})

describe('fenOf y turnOf', () => {
  it('la partida vacía es la posición inicial y juegan blancas', () => {
    expect(fenOf([])).toBe(INICIAL)
    expect(turnOf([])).toBe('w')
  })

  it('tras una jugada de blancas, juegan negras', () => {
    expect(turnOf(['e4'])).toBe('b')
  })
})

describe('applyMove', () => {
  it('aplica una jugada legal y devuelve el SAN', () => {
    const r = applyMove([], { from: 'e2', to: 'e4' })
    expect(r).not.toBeNull()
    expect(r!.san).toBe('e4')
    expect(r!.history).toEqual(['e4'])
  })

  it('no muta el historial que recibe', () => {
    const historial: string[] = []
    applyMove(historial, { from: 'e2', to: 'e4' })
    expect(historial).toEqual([])
  })

  it('devuelve null con una jugada ilegal en vez de lanzar', () => {
    expect(applyMove([], { from: 'e2', to: 'e5' })).toBeNull()
  })

  it('devuelve null si las casillas no existen', () => {
    expect(applyMove([], { from: 'z9', to: 'a1' })).toBeNull()
  })

  it('corona a dama cuando se indica', () => {
    // Blancas coronan en h8.
    const historial = ['h4', 'g5', 'hxg5', 'h6', 'gxh6', 'a5', 'g4', 'a4', 'g5', 'a3', 'g6', 'axb2', 'g7', 'bxa1=Q']
    const r = applyMove(historial, { from: 'g7', to: 'h8', promotion: 'q' })
    expect(r).not.toBeNull()
    expect(r!.san).toContain('=Q')
  })
})

describe('outcomeOf', () => {
  it('la partida inicial no terminó', () => {
    expect(outcomeOf([])).toEqual({ over: false, result: null, reason: null })
  })

  it('detecta el mate del loco (mate de negras)', () => {
    const r = outcomeOf(['f3', 'e5', 'g4', 'Qh4#'])
    expect(r.over).toBe(true)
    expect(r.result).toBe('0-1')
    expect(r.reason).toBe('checkmate')
  })

  it('detecta el mate del pastor (mate de blancas)', () => {
    const r = outcomeOf(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1-0')
    expect(r.reason).toBe('checkmate')
  })

  it('detecta ahogado', () => {
    const r = outcomeOf([
      'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'Qxc7', 'Rah6',
      'h4', 'f6', 'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7',
      'Qxc8', 'Kg6', 'Qe6',
    ])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1/2-1/2')
    expect(r.reason).toBe('stalemate')
  })

  it('detecta repetición triple', () => {
    const r = outcomeOf(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])
    expect(r.over).toBe(true)
    expect(r.result).toBe('1/2-1/2')
    expect(r.reason).toBe('threefold')
  })
})
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `npm test src/core/game.test.ts`
Expected: FAIL — el módulo `./game` no existe.

- [ ] **Step 3: Implementar el módulo**

`src/core/game.ts`:

```typescript
import { Chess } from 'chess.js'

export type MoveInput = { from: string; to: string; promotion?: string }

export type Outcome = {
  over: boolean
  result: '1-0' | '0-1' | '1/2-1/2' | null
  reason: string | null
}

export type AppliedMove = { history: string[]; fen: string; san: string }

/**
 * Reconstruye la partida desde el historial. Es la fuente de verdad:
 * la repetición triple y la regla de 50 jugadas no se pueden derivar
 * de un FEN suelto.
 */
function replay(history: string[]): Chess {
  const chess = new Chess()
  for (const san of history) chess.move(san)
  return chess
}

export function legalMoves(history: string[]): string[] {
  return replay(history).moves()
}

export function fenOf(history: string[]): string {
  return replay(history).fen()
}

export function turnOf(history: string[]): 'w' | 'b' {
  return replay(history).turn()
}

export function applyMove(history: string[], move: MoveInput): AppliedMove | null {
  const chess = replay(history)
  try {
    const applied = chess.move(move)
    return { history: [...history, applied.san], fen: chess.fen(), san: applied.san }
  } catch {
    // chess.js 1.x lanza excepción con jugadas ilegales. Acá se traduce
    // a null porque para el árbitro "ilegal" es un caso esperado, no un fallo.
    return null
  }
}

export function outcomeOf(history: string[]): Outcome {
  const chess = replay(history)
  if (!chess.isGameOver()) return { over: false, result: null, reason: null }

  if (chess.isCheckmate()) {
    // El turno es de quien recibió el mate, así que gana el otro.
    return { over: true, result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
  }
  if (chess.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' }
  if (chess.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'threefold' }
  if (chess.isInsufficientMaterial()) {
    return { over: true, result: '1/2-1/2', reason: 'insufficient_material' }
  }
  return { over: true, result: '1/2-1/2', reason: 'fifty_move' }
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npm test src/core/game.test.ts`
Expected: PASS.

Si la prueba de coronación falla porque la secuencia de jugadas es inválida, corregir el historial hasta que sea legal — lo que se está probando es que `promotion: 'q'` produce un SAN con `=Q`, no esa secuencia en particular.

- [ ] **Step 5: Commit**

```bash
git add src/core/game.ts src/core/game.test.ts
git commit -m "feat(core): reglas de ajedrez sobre historial de jugadas"
```

---

### Task 3: Estado de partida y almacenamiento en memoria

**Files:**
- Create: `src/core/match-state.ts`
- Create: `src/server/store/types.ts`
- Create: `src/server/store/memory.ts`
- Test: `src/server/store/memory.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `type Color = 'w' | 'b'`
  - `type PlayerKind = 'human' | 'llm' | 'engine'`
  - `type PlayerSlot = { kind: PlayerKind; token: string | null; label: string }`
  - `type MatchStatus = 'waiting' | 'active' | 'finished'`
  - `type MatchState = { id, history, fen, ply, players, status, result, reason, createdAt }`
  - `interface MatchStore { get(id): Promise<MatchState | null>; put(state): Promise<void> }`
  - `class MemoryStore implements MatchStore`

- [ ] **Step 1: Definir los tipos**

`src/core/match-state.ts`:

```typescript
export type Color = 'w' | 'b'
export type PlayerKind = 'human' | 'llm' | 'engine'

/** `token` es el secreto que identifica a un jugador humano. null = asiento libre. */
export type PlayerSlot = { kind: PlayerKind; token: string | null; label: string }

export type MatchStatus = 'waiting' | 'active' | 'finished'

export type MatchState = {
  id: string
  /** Jugadas en SAN. Fuente de verdad de la partida. */
  history: string[]
  /** Desnormalizado desde `history` para comodidad del cliente. */
  fen: string
  /** Cantidad de medias jugadas aplicadas. Igual a history.length. */
  ply: number
  players: { w: PlayerSlot; b: PlayerSlot }
  status: MatchStatus
  result: '1-0' | '0-1' | '1/2-1/2' | null
  reason: string | null
  createdAt: number
}

/** Vista pública: sin los tokens secretos de los jugadores. */
export type PublicPlayer = { kind: PlayerKind; label: string; taken: boolean }

export type PublicMatch = Omit<MatchState, 'players'> & {
  players: { w: PublicPlayer; b: PublicPlayer }
}

export function toPublic(state: MatchState): PublicMatch {
  const strip = (s: PlayerSlot) => ({ kind: s.kind, label: s.label, taken: s.token !== null })
  return { ...state, players: { w: strip(state.players.w), b: strip(state.players.b) } }
}
```

`src/server/store/types.ts`:

```typescript
import type { MatchState } from '@/core/match-state'

export interface MatchStore {
  get(id: string): Promise<MatchState | null>
  put(state: MatchState): Promise<void>
}
```

- [ ] **Step 2: Escribir la prueba que falla**

`src/server/store/memory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MemoryStore } from './memory'
import type { MatchState } from '@/core/match-state'

function partida(id: string): MatchState {
  return {
    id,
    history: [],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    ply: 0,
    players: {
      w: { kind: 'human', token: 'tok-w', label: 'Blancas' },
      b: { kind: 'human', token: null, label: 'Negras' },
    },
    status: 'waiting',
    result: null,
    reason: null,
    createdAt: 1,
  }
}

describe('MemoryStore', () => {
  it('devuelve null para una partida que no existe', async () => {
    const store = new MemoryStore()
    expect(await store.get('nope')).toBeNull()
  })

  it('guarda y recupera', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    const leida = await store.get('a')
    expect(leida?.id).toBe('a')
  })

  it('devuelve una copia, no la referencia guardada', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    const leida = await store.get('a')
    leida!.history.push('e4')
    const otra = await store.get('a')
    expect(otra!.history).toEqual([])
  })

  it('sobrescribe al volver a guardar', async () => {
    const store = new MemoryStore()
    await store.put(partida('a'))
    await store.put({ ...partida('a'), ply: 3 })
    expect((await store.get('a'))!.ply).toBe(3)
  })
})
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `npm test src/server/store/memory.test.ts`
Expected: FAIL — `./memory` no existe.

- [ ] **Step 4: Implementar**

`src/server/store/memory.ts`:

```typescript
import type { MatchState } from '@/core/match-state'
import type { MatchStore } from './types'

/**
 * Almacén en memoria. Sirve para pruebas y desarrollo local.
 * En Vercel NO sirve: cada invocación puede caer en otra instancia.
 */
export class MemoryStore implements MatchStore {
  private partidas = new Map<string, string>()

  async get(id: string): Promise<MatchState | null> {
    const crudo = this.partidas.get(id)
    return crudo ? (JSON.parse(crudo) as MatchState) : null
  }

  async put(state: MatchState): Promise<void> {
    // Se serializa al guardar para imitar a Redis: quien lea recibe una
    // copia y no puede mutar el estado guardado por accidente.
    this.partidas.set(state.id, JSON.stringify(state))
  }
}
```

- [ ] **Step 5: Correr las pruebas**

Run: `npm test src/server/store/memory.test.ts`
Expected: PASS, 4 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src/core/match-state.ts src/server/store/
git commit -m "feat(store): estado de partida e implementación en memoria"
```

---

### Task 4: El árbitro

Donde vive toda la lógica de partida. No conoce HTTP.

**Files:**
- Create: `src/server/match.ts`
- Test: `src/server/match.test.ts`

**Interfaces:**
- Consumes: `applyMove`, `fenOf`, `turnOf`, `outcomeOf` de `@/core/game`; `MatchStore` de `@/server/store/types`; tipos de `@/core/match-state`.
- Produces:
  - `type CreateResult = { state: MatchState; token: string }`
  - `type JoinResult = { state: MatchState; token: string; color: Color }`
  - `type MoveError = 'not_found' | 'not_your_turn' | 'stale_ply' | 'illegal_move' | 'not_active' | 'bad_token'`
  - `createMatch(store, deps): Promise<CreateResult>`
  - `joinMatch(store, id): Promise<JoinResult | 'not_found' | 'full'>`
  - `submitMove(store, id, req): Promise<MatchState | MoveError>` donde `req = { token: string; ply: number; from: string; to: string; promotion?: string }`
  - `type Deps = { newId: () => string; newToken: () => string; now: () => number }`

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/server/match.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryStore } from './store/memory'
import { createMatch, joinMatch, submitMove } from './match'
import type { Deps } from './match'

let store: MemoryStore
let n: number

const deps: Deps = {
  newId: () => `id-${++n}`,
  newToken: () => `tok-${++n}`,
  now: () => 1000,
}

beforeEach(() => {
  store = new MemoryStore()
  n = 0
})

/** Crea una partida y suma el segundo jugador. Devuelve id y ambos tokens. */
async function partidaLista() {
  const creada = await createMatch(store, deps)
  const unida = await joinMatch(store, creada.state.id)
  if (unida === 'not_found' || unida === 'full') throw new Error('no se pudo unir')
  return { id: creada.state.id, blancas: creada.token, negras: unida.token }
}

describe('createMatch', () => {
  it('crea una partida esperando rival, con blancas ocupadas', async () => {
    const { state, token } = await createMatch(store, deps)
    expect(state.status).toBe('waiting')
    expect(state.ply).toBe(0)
    expect(state.history).toEqual([])
    expect(state.players.w.token).toBe(token)
    expect(state.players.b.token).toBeNull()
  })

  it('la guarda en el almacén', async () => {
    const { state } = await createMatch(store, deps)
    expect(await store.get(state.id)).not.toBeNull()
  })
})

describe('joinMatch', () => {
  it('ocupa las negras y activa la partida', async () => {
    const creada = await createMatch(store, deps)
    const unida = await joinMatch(store, creada.state.id)
    expect(unida).not.toBe('not_found')
    expect(unida).not.toBe('full')
    if (unida === 'not_found' || unida === 'full') return
    expect(unida.color).toBe('b')
    expect(unida.state.status).toBe('active')
  })

  it('rechaza a un tercero', async () => {
    const creada = await createMatch(store, deps)
    await joinMatch(store, creada.state.id)
    expect(await joinMatch(store, creada.state.id)).toBe('full')
  })

  it('devuelve not_found si la partida no existe', async () => {
    expect(await joinMatch(store, 'inexistente')).toBe('not_found')
  })
})

describe('submitMove', () => {
  it('aplica una jugada legal de las blancas', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'e2', to: 'e4',
    })
    expect(typeof r).not.toBe('string')
    if (typeof r === 'string') return
    expect(r.history).toEqual(['e4'])
    expect(r.ply).toBe(1)
    expect(r.fen).toContain(' b ')
  })

  it('rechaza si no es tu turno', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: p.negras, ply: 0, from: 'e7', to: 'e5',
    })
    expect(r).toBe('not_your_turn')
  })

  it('rechaza un ply desactualizado (doble clic)', async () => {
    const p = await partidaLista()
    await submitMove(store, p.id, { token: p.blancas, ply: 0, from: 'e2', to: 'e4' })
    await submitMove(store, p.id, { token: p.negras, ply: 1, from: 'e7', to: 'e5' })
    const repetida = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'd2', to: 'd4',
    })
    expect(repetida).toBe('stale_ply')
  })

  it('rechaza una jugada ilegal', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: p.blancas, ply: 0, from: 'e2', to: 'e5',
    })
    expect(r).toBe('illegal_move')
  })

  it('rechaza un token desconocido', async () => {
    const p = await partidaLista()
    const r = await submitMove(store, p.id, {
      token: 'intruso', ply: 0, from: 'e2', to: 'e4',
    })
    expect(r).toBe('bad_token')
  })

  it('rechaza mover mientras la partida espera rival', async () => {
    const creada = await createMatch(store, deps)
    const r = await submitMove(store, creada.state.id, {
      token: creada.token, ply: 0, from: 'e2', to: 'e4',
    })
    expect(r).toBe('not_active')
  })

  it('devuelve not_found si la partida no existe', async () => {
    const r = await submitMove(store, 'inexistente', {
      token: 'x', ply: 0, from: 'e2', to: 'e4',
    })
    expect(r).toBe('not_found')
  })

  it('marca la partida terminada al dar mate', async () => {
    const p = await partidaLista()
    // Mate del loco: f3 e5 g4 Qh4#
    const jugadas: Array<[string, string, string]> = [
      [p.blancas, 'f2', 'f3'],
      [p.negras, 'e7', 'e5'],
      [p.blancas, 'g2', 'g4'],
      [p.negras, 'd8', 'h4'],
    ]
    let ply = 0
    let ultimo
    for (const [token, from, to] of jugadas) {
      ultimo = await submitMove(store, p.id, { token, ply, from, to })
      expect(typeof ultimo).not.toBe('string')
      ply++
    }
    if (typeof ultimo === 'string' || !ultimo) return
    expect(ultimo.status).toBe('finished')
    expect(ultimo.result).toBe('0-1')
    expect(ultimo.reason).toBe('checkmate')
  })

  it('rechaza jugar en una partida terminada', async () => {
    const p = await partidaLista()
    const jugadas: Array<[string, string, string]> = [
      [p.blancas, 'f2', 'f3'],
      [p.negras, 'e7', 'e5'],
      [p.blancas, 'g2', 'g4'],
      [p.negras, 'd8', 'h4'],
    ]
    let ply = 0
    for (const [token, from, to] of jugadas) {
      await submitMove(store, p.id, { token, ply, from, to })
      ply++
    }
    const despues = await submitMove(store, p.id, {
      token: p.blancas, ply: 4, from: 'a2', to: 'a3',
    })
    expect(despues).toBe('not_active')
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test src/server/match.test.ts`
Expected: FAIL — `./match` no existe.

- [ ] **Step 3: Implementar el árbitro**

`src/server/match.ts`:

```typescript
import { applyMove, fenOf, turnOf, outcomeOf } from '@/core/game'
import type { Color, MatchState } from '@/core/match-state'
import type { MatchStore } from './store/types'

export type Deps = {
  newId: () => string
  newToken: () => string
  now: () => number
}

export const defaultDeps: Deps = {
  newId: () => crypto.randomUUID().slice(0, 8),
  newToken: () => crypto.randomUUID(),
  now: () => Date.now(),
}

export type CreateResult = { state: MatchState; token: string }
export type JoinResult = { state: MatchState; token: string; color: Color }

export type MoveError =
  | 'not_found' | 'not_your_turn' | 'stale_ply'
  | 'illegal_move' | 'not_active' | 'bad_token'

export type MoveRequest = {
  token: string
  ply: number
  from: string
  to: string
  promotion?: string
}

export async function createMatch(store: MatchStore, deps: Deps): Promise<CreateResult> {
  const token = deps.newToken()
  const state: MatchState = {
    id: deps.newId(),
    history: [],
    fen: fenOf([]),
    ply: 0,
    players: {
      w: { kind: 'human', token, label: 'Blancas' },
      b: { kind: 'human', token: null, label: 'Negras' },
    },
    status: 'waiting',
    result: null,
    reason: null,
    createdAt: deps.now(),
  }
  await store.put(state)
  return { state, token }
}

export async function joinMatch(
  store: MatchStore,
  id: string,
  deps: Deps = defaultDeps,
): Promise<JoinResult | 'not_found' | 'full'> {
  const state = await store.get(id)
  if (!state) return 'not_found'
  if (state.players.b.token !== null) return 'full'

  const token = deps.newToken()
  const siguiente: MatchState = {
    ...state,
    players: { ...state.players, b: { ...state.players.b, token } },
    status: 'active',
  }
  await store.put(siguiente)
  return { state: siguiente, token, color: 'b' }
}

function colorDelToken(state: MatchState, token: string): Color | null {
  if (state.players.w.token === token) return 'w'
  if (state.players.b.token === token) return 'b'
  return null
}

export async function submitMove(
  store: MatchStore,
  id: string,
  req: MoveRequest,
): Promise<MatchState | MoveError> {
  const state = await store.get(id)
  if (!state) return 'not_found'
  if (state.status !== 'active') return 'not_active'

  const color = colorDelToken(state, req.token)
  if (color === null) return 'bad_token'

  // El ply se compara antes que el turno: si el cliente venía atrasado,
  // el error preciso es que está desactualizado, no que no le toca.
  if (req.ply !== state.ply) return 'stale_ply'
  if (turnOf(state.history) !== color) return 'not_your_turn'

  const aplicada = applyMove(state.history, {
    from: req.from, to: req.to, promotion: req.promotion,
  })
  if (aplicada === null) return 'illegal_move'

  const fin = outcomeOf(aplicada.history)
  const siguiente: MatchState = {
    ...state,
    history: aplicada.history,
    fen: aplicada.fen,
    ply: aplicada.history.length,
    status: fin.over ? 'finished' : 'active',
    result: fin.result,
    reason: fin.reason,
  }
  await store.put(siguiente)
  return siguiente
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npm test src/server/match.test.ts`
Expected: PASS, 13 pruebas.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS, todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/server/match.ts src/server/match.test.ts
git commit -m "feat(match): árbitro de partida con validación de turno, ply y legalidad"
```

---

### Task 5: Clave de acceso y rutas de la API

**Files:**
- Create: `src/server/auth.ts`
- Create: `src/server/store/index.ts`
- Create: `src/app/api/match/route.ts`
- Create: `src/app/api/match/[id]/route.ts`
- Create: `src/app/api/match/[id]/join/route.ts`
- Create: `src/app/api/match/[id]/move/route.ts`
- Test: `src/server/auth.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `joinMatch`, `submitMove`, `defaultDeps` de `@/server/match`; `toPublic` de `@/core/match-state`.
- Produces:
  - `checkAccess(req: Request): boolean`
  - `getStore(): MatchStore`
  - Las cuatro rutas HTTP.

- [ ] **Step 1: Escribir la prueba de la clave de acceso**

`src/server/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkAccess } from './auth'

const original = process.env.ACCESS_KEY

beforeEach(() => { process.env.ACCESS_KEY = 'secreta' })
afterEach(() => { process.env.ACCESS_KEY = original })

function pedido(clave?: string): Request {
  return new Request('http://x/api/match', {
    headers: clave === undefined ? {} : { 'x-access-key': clave },
  })
}

describe('checkAccess', () => {
  it('acepta la clave correcta', () => {
    expect(checkAccess(pedido('secreta'))).toBe(true)
  })

  it('rechaza una clave equivocada', () => {
    expect(checkAccess(pedido('otra'))).toBe(false)
  })

  it('rechaza si no viene la cabecera', () => {
    expect(checkAccess(pedido())).toBe(false)
  })

  it('rechaza todo si ACCESS_KEY no está configurada', () => {
    delete process.env.ACCESS_KEY
    expect(checkAccess(pedido('lo-que-sea'))).toBe(false)
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test src/server/auth.test.ts`
Expected: FAIL — `./auth` no existe.

- [ ] **Step 3: Implementar la clave de acceso**

`src/server/auth.ts`:

```typescript
export function checkAccess(req: Request): boolean {
  const esperada = process.env.ACCESS_KEY
  // Sin clave configurada el sitio queda cerrado, no abierto.
  // Fallar cerrado evita exponer la API por un despliegue mal configurado.
  if (!esperada) return false
  return req.headers.get('x-access-key') === esperada
}

export function accessDenied(): Response {
  return Response.json({ error: 'forbidden' }, { status: 403 })
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npm test src/server/auth.test.ts`
Expected: PASS, 4 pruebas.

- [ ] **Step 5: Crear el selector de almacén**

`src/server/store/index.ts`:

```typescript
import { MemoryStore } from './memory'
import type { MatchStore } from './types'

let instancia: MatchStore | null = null

/**
 * Por ahora siempre en memoria. La Task 6 agrega Redis acá.
 */
export function getStore(): MatchStore {
  if (!instancia) instancia = new MemoryStore()
  return instancia
}
```

- [ ] **Step 6: Crear la ruta de creación**

`src/app/api/match/route.ts`:

```typescript
import { checkAccess, accessDenied } from '@/server/auth'
import { getStore } from '@/server/store'
import { createMatch, defaultDeps } from '@/server/match'
import { toPublic } from '@/core/match-state'

export async function POST(req: Request) {
  if (!checkAccess(req)) return accessDenied()
  const { state, token } = await createMatch(getStore(), defaultDeps)
  return Response.json({ match: toPublic(state), token, color: 'w' })
}
```

- [ ] **Step 7: Crear la ruta de lectura**

`src/app/api/match/[id]/route.ts`:

```typescript
import { checkAccess, accessDenied } from '@/server/auth'
import { getStore } from '@/server/store'
import { toPublic } from '@/core/match-state'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAccess(req)) return accessDenied()
  const { id } = await params
  const state = await getStore().get(id)
  if (!state) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json({ match: toPublic(state) })
}
```

Nota: en Next 15+ `params` es una promesa y hay que esperarla.

- [ ] **Step 8: Crear la ruta de unión**

`src/app/api/match/[id]/join/route.ts`:

```typescript
import { checkAccess, accessDenied } from '@/server/auth'
import { getStore } from '@/server/store'
import { joinMatch, defaultDeps } from '@/server/match'
import { toPublic } from '@/core/match-state'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAccess(req)) return accessDenied()
  const { id } = await params
  const r = await joinMatch(getStore(), id, defaultDeps)
  if (r === 'not_found') return Response.json({ error: 'not_found' }, { status: 404 })
  if (r === 'full') return Response.json({ error: 'full' }, { status: 409 })
  // Dos personas abrieron el link a la vez y la otra ganó: para quien pierde
  // el asiento ya está ocupado, así que se le responde como si estuviera lleno.
  if (r === 'conflict') return Response.json({ error: 'full' }, { status: 409 })
  return Response.json({ match: toPublic(r.state), token: r.token, color: r.color })
}
```

- [ ] **Step 9: Crear la ruta de movimiento**

`src/app/api/match/[id]/move/route.ts`:

```typescript
import { checkAccess, accessDenied } from '@/server/auth'
import { getStore } from '@/server/store'
import { submitMove } from '@/server/match'
import { toPublic } from '@/core/match-state'

const ESTADO_HTTP: Record<string, number> = {
  not_found: 404,
  not_active: 409,
  stale_ply: 409,
  // Otro escritor ganó la carrera. El cliente debe recargar el estado y reintentar.
  conflict: 409,
  not_your_turn: 403,
  bad_token: 403,
  illegal_move: 422,
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAccess(req)) return accessDenied()
  const { id } = await params
  const cuerpo = await req.json()

  if (
    typeof cuerpo?.token !== 'string' ||
    typeof cuerpo?.ply !== 'number' ||
    typeof cuerpo?.from !== 'string' ||
    typeof cuerpo?.to !== 'string'
  ) {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }

  const r = await submitMove(getStore(), id, {
    token: cuerpo.token,
    ply: cuerpo.ply,
    from: cuerpo.from,
    to: cuerpo.to,
    promotion: typeof cuerpo.promotion === 'string' ? cuerpo.promotion : undefined,
  })

  if (typeof r === 'string') {
    return Response.json({ error: r }, { status: ESTADO_HTTP[r] ?? 400 })
  }
  return Response.json({ match: toPublic(r) })
}
```

- [ ] **Step 10: Probar las rutas a mano**

```bash
npm run dev
```

En otra terminal:

```bash
# Crear (guardá el id y el token que devuelve)
curl -s -X POST localhost:3000/api/match -H 'x-access-key: dev' | tee /tmp/creada.json

# Sin clave debe dar 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/match
```

Expected: el primero devuelve JSON con `match`, `token` y `color: "w"`. El segundo imprime `403`.

- [ ] **Step 11: Commit**

```bash
git add src/server/auth.ts src/server/auth.test.ts src/server/store/index.ts src/app/api
git commit -m "feat(api): rutas de partida con clave de acceso"
```

---

### Task 6: Almacenamiento en Upstash Redis

**Files:**
- Create: `src/server/store/redis.ts`
- Modify: `src/server/store/index.ts`
- Test: `src/server/store/redis.test.ts`

**Interfaces:**
- Consumes: `MatchStore` de `./types`.
- Produces: `class RedisStore implements MatchStore`. `getStore()` elige Redis si hay credenciales, memoria si no.

- [ ] **Step 1: Escribir la prueba de integración**

Se salta sola si no hay credenciales, para que la suite siga siendo verde en cualquier máquina.

`src/server/store/redis.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
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
```

- [ ] **Step 2: Correr y observar que se saltea**

Run: `npm test src/server/store/redis.test.ts`
Expected: FAIL — `./redis` no existe (el import falla antes del skip).

- [ ] **Step 3: Implementar**

`src/server/store/redis.ts`:

```typescript
import { Redis } from '@upstash/redis'
import type { MatchState } from '@/core/match-state'
import type { MatchStore } from './types'

/** Las partidas caducan a los 7 días. Es una POC, no un archivo histórico. */
const TTL_SEGUNDOS = 60 * 60 * 24 * 7

/**
 * Escritura condicional atómica. La versión vive además en su propia clave
 * porque compararla dentro del script sin decodificar JSON es más simple y no
 * depende de que el entorno Lua tenga cjson disponible.
 *
 * GET devuelve false cuando la clave no existe, y false nunca es igual a la
 * versión esperada, así que una partida inexistente cae en conflicto — que es
 * la respuesta correcta: no se puede sobrescribir lo que no está.
 */
const CAS = `
if redis.call('GET', KEYS[2]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
  return 1
end
return 0
`

export class RedisStore implements MatchStore {
  private redis = Redis.fromEnv()

  private clave(id: string) {
    return `match:${id}`
  }

  /** Clave hermana que guarda solo la versión, para poder compararla en Lua. */
  private claveVersion(id: string) {
    return `match:${id}:v`
  }

  async get(id: string): Promise<MatchState | null> {
    // El cliente de Upstash deserializa JSON automáticamente al leer.
    const valor = await this.redis.get<MatchState>(this.clave(id))
    return valor ?? null
  }

  async put(state: MatchState): Promise<void> {
    // Se guarda el JSON como cadena explícita para que coincida byte a byte
    // con lo que escribe el script Lua, que solo maneja cadenas.
    await this.redis.set(this.clave(state.id), JSON.stringify(state), { ex: TTL_SEGUNDOS })
    await this.redis.set(this.claveVersion(state.id), String(state.version), { ex: TTL_SEGUNDOS })
  }

  async putIfVersion(state: MatchState, expectedVersion: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(
      CAS,
      [this.clave(state.id), this.claveVersion(state.id)],
      [
        String(expectedVersion),
        JSON.stringify(state),
        String(state.version),
        String(TTL_SEGUNDOS),
      ],
    )
    return r === 1
  }
}
```

- [ ] **Step 4: Conectar el selector**

`src/server/store/index.ts` completo:

```typescript
import { MemoryStore } from './memory'
import { RedisStore } from './redis'
import type { MatchStore } from './types'

let instancia: MatchStore | null = null

/**
 * Redis si hay credenciales, memoria si no.
 * En Vercel el almacén en memoria NO funciona: cada invocación puede
 * caer en otra instancia y la partida se pierde entre jugadas.
 */
export function getStore(): MatchStore {
  if (instancia) return instancia
  const hayRedis =
    !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  instancia = hayRedis ? new RedisStore() : new MemoryStore()
  return instancia
}
```

- [ ] **Step 5: Crear la base en Upstash y correr la prueba de verdad**

1. Crear una base Redis gratuita en https://console.upstash.com
2. Copiar `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` a `.env.local`
3. Run: `npm test src/server/store/redis.test.ts`

Expected: PASS, 2 pruebas (ya no salteadas).

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/store/
git commit -m "feat(store): persistencia en Upstash Redis"
```

---

### Task 7: Cliente de la API y consulta periódica

**Files:**
- Create: `src/client/api.ts`
- Create: `src/client/useMatch.ts`
- Test: `src/client/useMatch.test.ts`

**Interfaces:**
- Consumes: los tipos `PublicMatch` de `@/core/match-state`.
- Produces:
  - `type Credentials = { accessKey: string; token: string; color: Color }`
  - `saveCreds(id, creds)` / `loadCreds(id): Credentials | null` (localStorage)
  - `apiCreate`, `apiGet`, `apiJoin`, `apiMove`
  - `shouldPoll(state): boolean` y `pollInterval(msSinCambio): number`
  - `useMatch(id)` — hook de React

- [ ] **Step 1: Escribir la prueba de la política de consulta**

La lógica de cuándo y cada cuánto preguntar se extrae a funciones puras para poder probarla sin React ni navegador.

`src/client/useMatch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { shouldPoll, pollInterval } from './useMatch'

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
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test src/client/useMatch.test.ts`
Expected: FAIL — `./useMatch` no existe.

- [ ] **Step 3: Implementar el cliente de la API**

`src/client/api.ts`:

```typescript
import type { PublicMatch, Color } from '@/core/match-state'

export type Credentials = { accessKey: string; token: string; color: Color }

const claveDe = (id: string) => `chess:creds:${id}`

export function saveCreds(id: string, creds: Credentials): void {
  localStorage.setItem(claveDe(id), JSON.stringify(creds))
}

export function loadCreds(id: string): Credentials | null {
  const crudo = localStorage.getItem(claveDe(id))
  return crudo ? (JSON.parse(crudo) as Credentials) : null
}

export function saveAccessKey(clave: string): void {
  localStorage.setItem('chess:accessKey', clave)
}

export function loadAccessKey(): string {
  return localStorage.getItem('chess:accessKey') ?? ''
}

async function pedir<T>(url: string, accessKey: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-access-key': accessKey },
  })
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(cuerpo?.error ?? `http_${r.status}`)
  return cuerpo as T
}

type CreateResponse = { match: PublicMatch; token: string; color: Color }
type GetResponse = { match: PublicMatch }

export const apiCreate = (accessKey: string) =>
  pedir<CreateResponse>('/api/match', accessKey, { method: 'POST' })

export const apiGet = (id: string, accessKey: string) =>
  pedir<GetResponse>(`/api/match/${id}`, accessKey)

export const apiJoin = (id: string, accessKey: string) =>
  pedir<CreateResponse>(`/api/match/${id}/join`, accessKey, { method: 'POST' })

export const apiMove = (
  id: string,
  accessKey: string,
  cuerpo: { token: string; ply: number; from: string; to: string; promotion?: string },
) =>
  pedir<GetResponse>(`/api/match/${id}/move`, accessKey, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  })
```

- [ ] **Step 4: Implementar el hook y su política**

`src/client/useMatch.ts`:

```typescript
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
```

- [ ] **Step 5: Correr las pruebas**

Run: `npm test src/client/useMatch.test.ts`
Expected: PASS, 7 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src/client/
git commit -m "feat(client): cliente de API y consulta periódica con pausa por visibilidad"
```

---

### Task 8: Interfaz — pantalla de inicio y tablero

**Files:**
- Create: `src/components/Board.tsx`
- Create: `src/app/match/[id]/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `useMatch`, `turnoDe`, `apiCreate`, `apiJoin`, `saveCreds`, `loadCreds`, `saveAccessKey`, `loadAccessKey`; `applyMove` de `@/core/game`.
- Produces: la aplicación jugable.

- [ ] **Step 1: Escribir el tablero**

`src/components/Board.tsx`:

```tsx
'use client'

import { Chessboard } from 'react-chessboard'
import { applyMove } from '@/core/game'
import type { Color } from '@/core/match-state'

type Props = {
  fen: string
  /** Historial en SAN. Necesario para validar en el cliente antes de enviar. */
  history: string[]
  orientation: Color
  puedeMover: boolean
  onMove: (from: string, to: string, promotion?: string) => void
}

export function Board({ fen, history, orientation, puedeMover, onMove }: Props) {
  return (
    <Chessboard
      options={{
        position: fen,
        boardOrientation: orientation === 'w' ? 'white' : 'black',
        allowDragging: puedeMover,
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          // targetSquare es null cuando se suelta la pieza fuera del tablero.
          if (!targetSquare || !puedeMover) return false

          // Validación optimista: se rechaza acá lo que el servidor rechazaría,
          // así la pieza vuelve a su casilla al instante en vez de parpadear
          // cuando llega la corrección del servidor.
          if (applyMove(history, { from: sourceSquare, to: targetSquare })) {
            onMove(sourceSquare, targetSquare)
            return true
          }

          // Un peón que llega a la última fila necesita pieza de coronación.
          // Se corona a dama sin preguntar; elegir otra pieza es una mejora
          // posterior, no parte de este hito.
          if (applyMove(history, { from: sourceSquare, to: targetSquare, promotion: 'q' })) {
            onMove(sourceSquare, targetSquare, 'q')
            return true
          }

          return false
        },
      }}
    />
  )
}
```

- [ ] **Step 2: Escribir la pantalla de inicio**

`src/app/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiCreate, saveAccessKey, saveCreds, loadAccessKey } from '@/client/api'

export default function Home() {
  const router = useRouter()
  const [clave, setClave] = useState(loadAccessKey())
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      saveAccessKey(clave)
      const r = await apiCreate(clave)
      saveCreds(r.match.id, { accessKey: clave, token: r.token, color: r.color })
      router.push(`/match/${r.match.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
      setCreando(false)
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Ajedrez</h1>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Clave de acceso
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <button onClick={crear} disabled={!clave || creando} style={{ padding: '8px 16px' }}>
        {creando ? 'Creando…' : 'Crear partida'}
      </button>
      {error === 'forbidden' && <p style={{ color: 'crimson' }}>Clave incorrecta.</p>}
      {error && error !== 'forbidden' && <p style={{ color: 'crimson' }}>Error: {error}</p>}
    </main>
  )
}
```

- [ ] **Step 3: Escribir la pantalla de partida**

`src/app/match/[id]/page.tsx`:

```tsx
'use client'

import { use, useEffect, useState } from 'react'
import { Board } from '@/components/Board'
import { useMatch, turnoDe } from '@/client/useMatch'
import { apiJoin, loadAccessKey, loadCreds, saveAccessKey, saveCreds } from '@/client/api'
import type { Color } from '@/core/match-state'

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { match, error, mover, refrescar } = useMatch(id)
  const [color, setColor] = useState<Color | null>(null)
  const [clave, setClave] = useState(loadAccessKey())
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    setColor(loadCreds(id)?.color ?? null)
  }, [id, match?.ply])

  async function unirse() {
    saveAccessKey(clave)
    const r = await apiJoin(id, clave)
    saveCreds(id, { accessKey: clave, token: r.token, color: r.color })
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

  if (!match) return <main style={{ padding: 32 }}>Error: {error}</main>

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
          <p style={{ color: 'crimson' }}>Movimiento rechazado: {error}</p>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Probar a mano con dos navegadores**

```bash
npm run dev
```

1. Abrir `localhost:3000`, poner la clave `dev`, crear partida.
2. Copiar el link, abrirlo en una ventana de incógnito.
3. En la ventana de incógnito: poner la clave, unirse como negras.
4. Jugar el mate del loco alternando ventanas: `f2-f3`, `e7-e5`, `g2-g4`, `d8-h4`.

Expected: cada jugada aparece en la otra ventana en 4 segundos o menos, y al final ambas muestran "Partida terminada: 0-1 (checkmate)".

- [ ] **Step 5: Verificar que compila**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/components src/app/page.tsx src/app/match
git commit -m "feat(ui): pantalla de inicio, tablero y partida entre dos personas"
```

---

### Task 9: Prueba de punta a punta con dos clientes

**Files:**
- Create: `playwright.config.ts`
- Test: `e2e/dos-jugadores.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: la aplicación completa corriendo.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Instalar Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Configurar**

`playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    env: { ACCESS_KEY: 'dev' },
  },
})
```

Agregar a `package.json`: `"test:e2e": "playwright test"`.

Nota: la prueba funciona con cualquiera de los dos almacenes. Si `.env.local` tiene credenciales de Upstash, el estado irá a Redis y consumirá unos pocos comandos del free tier; si no las tiene, usa el almacén en memoria, que alcanza porque `npm run dev` es un único proceso.

- [ ] **Step 3: Escribir la prueba**

`e2e/dos-jugadores.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test('dos personas juegan el mate del loco desde dispositivos distintos', async ({ browser }) => {
  const ctxBlancas = await browser.newContext()
  const ctxNegras = await browser.newContext()
  const blancas = await ctxBlancas.newPage()
  const negras = await ctxNegras.newPage()

  // Blancas crean la partida.
  await blancas.goto('/')
  await blancas.getByLabel('Clave de acceso').fill('dev')
  await blancas.getByRole('button', { name: 'Crear partida' }).click()
  await expect(blancas).toHaveURL(/\/match\/.+/)
  const url = blancas.url()

  // Negras entran por el link y se unen.
  await negras.goto(url)
  await negras.locator('input[type=password]').fill('dev')
  await negras.getByRole('button', { name: 'Entrar' }).click()
  await negras.getByRole('button', { name: 'Unirme como negras' }).click()

  await expect(blancas.getByText('Te toca.')).toBeVisible({ timeout: 10_000 })

  // Mate del loco, arrastrando pieza a pieza.
  const jugadas: Array<[typeof blancas, string, string]> = [
    [blancas, 'f2', 'f3'],
    [negras, 'e7', 'e5'],
    [blancas, 'g2', 'g4'],
    [negras, 'd8', 'h4'],
  ]

  for (const [pagina, desde, hasta] of jugadas) {
    await expect(pagina.getByText('Te toca.')).toBeVisible({ timeout: 10_000 })
    await pagina.locator(`[data-square="${desde}"]`).dragTo(
      pagina.locator(`[data-square="${hasta}"]`),
    )
  }

  await expect(blancas.getByText(/Partida terminada: 0-1/)).toBeVisible({ timeout: 10_000 })
  await expect(negras.getByText(/Partida terminada: 0-1/)).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Step 4: Correr**

Run: `npm run test:e2e`
Expected: PASS.

Si el arrastre no funciona, el selector de casilla de `react-chessboard` 5.x puede no ser `data-square`. Verificarlo con `npx playwright test --debug` inspeccionando el DOM del tablero, y ajustar el selector. Alternativa robusta: hacer clic en la casilla de origen y luego en la de destino, ya que el componente soporta `onSquareClick`.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/ package.json
git commit -m "test(e2e): partida completa entre dos clientes"
```

---

### Task 10: Despliegue en Vercel

Esta tarea es manual: no hay pruebas automatizadas que la cubran.

**Files:**
- Create: `README.md`

- [ ] **Step 1: Subir el repositorio a GitHub**

- [ ] **Step 2: Importar el proyecto en Vercel**

En https://vercel.com/new, elegir el repositorio. Vercel detecta Next.js solo.

- [ ] **Step 3: Configurar las variables de entorno en Vercel**

Para los entornos Production y Preview:

- `ACCESS_KEY` — la clave que vas a compartir
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Sin las dos de Upstash el sitio arranca pero pierde las partidas entre jugadas**, porque cae al almacén en memoria. Verificar que estén las tres.

- [ ] **Step 4: Verificar el despliegue**

Desde dos dispositivos distintos (o un teléfono y la computadora):

1. Crear una partida en uno.
2. Abrir el link en el otro y unirse.
3. Jugar cuatro o cinco jugadas.

Expected: las jugadas se ven en ambos lados en 4 segundos o menos.

- [ ] **Step 5: Escribir el README**

`README.md` con: qué es, cómo correrlo en local, qué variables de entorno hacen falta, cómo correr las pruebas, y un enlace al spec y a este plan.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README con instrucciones de desarrollo y despliegue"
```

---

## Qué queda fuera de este hito

Lo siguiente es de hitos posteriores y no debe construirse acá:

- Rival LLM, selector de modelos, AI SDK (Hito 2)
- Stockfish, modo tutor, pistas, resumen post-partida (Hito 3)
- Modelo contra modelo, marcador, vista de espectador dedicada (Hito 4)

El campo `kind` de `PlayerSlot` ya admite `'llm'` y `'engine'`, y el árbitro ya no distingue quién juega cada color. Esa es toda la preparación que el Hito 1 debe hacer para los que siguen.
