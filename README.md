# Ajedrez web (dos personas)

Un juego de ajedrez que se juega desde dos dispositivos distintos: una persona
crea la partida, comparte un link de invitación, y la otra se une desde su
propio teléfono o computadora. El servidor es la única autoridad sobre el
estado de la partida — ni el navegador de blancas ni el de negras deciden qué
jugada es válida; ambos consultan y proponen, y el servidor resuelve.

Esto es el **Hito 1** de un plan más grande. Los hitos siguientes agregan un
rival LLM (Hito 2), un motor de ajedrez con modo tutor (Hito 3), y partidas de
exhibición modelo contra modelo con espectadores (Hito 4). Varias decisiones
de este código que a primera vista parecen sobredimensionadas para "dos
personas juegan al ajedrez" — el campo `kind` de cada asiento (`human` /
`llm` / `engine`), que el árbitro no distinga quién juega cada color, la
separación entre lógica pura y estado del servidor — existen para que esos
hitos se puedan construir encima sin reescribir esto. El diseño completo está
en `docs/superpowers/specs/2026-08-18-chess-llm-design.md` (enlace abajo).

## Requisitos

- **Node 22.12.0.** El repo trae un `.nvmrc` con esa versión exacta. Si tu
  máquina tiene un Node por defecto más viejo (algo común, `node -v` para
  chequear), corré `nvm use` antes de cualquier otro comando de esta guía.
- **Una base de datos Upstash Redis.** El plan gratuito alcanza. Se crea en
  <https://console.upstash.com/> — un botón "Create database", sin tarjeta.

## Puesta en marcha local

```bash
git clone https://github.com/Chrisnatalx/Chess.git
cd Chess
nvm use
npm install
cp .env.example .env.local
```

Completá `.env.local` con tres variables:

- **`ACCESS_KEY`** — la contraseña compartida que abre todo el sitio: cada
  ruta bajo `/api/` la exige y rechaza lo que no la traiga. Generala al azar
  y larga (`openssl rand -hex 24`, por ejemplo) — todavía no hay límite de
  intentos, así que una clave corta es adivinable por fuerza bruta.
- **`UPSTASH_REDIS_REST_URL`** y **`UPSTASH_REDIS_REST_TOKEN`** — de dónde
  saca el servidor la URL REST y el token de tu base de Upstash (están en el
  panel de la base, pestaña "REST API"). **Si falta cualquiera de las dos, la
  app arranca igual, pero pierde las partidas entre una jugada y la
  siguiente**, en silencio, sin ningún error visible: cae a un almacén en
  memoria del proceso, y en un entorno serverless cada request puede caer en
  una instancia distinta que nunca vio la jugada anterior. Es la forma de
  falla más confusa de todo el proyecto — si el tablero "olvida" jugadas,
  revisá esto primero.

Con las tres puestas:

```bash
npm run dev
```

Abrí <http://localhost:3000>.

## Cómo se juega

1. Entrás la clave de acceso y creás una partida. Quien crea juega **siempre
   con blancas**.
2. Copiás el link de invitación (el botón lo pone en el portapapeles) y se lo
   pasás a la otra persona.
3. Esa persona abre el link en su propio dispositivo, entra la misma clave de
   acceso, y se une — queda con **negras**.
4. Juegan arrastrando piezas en su turno. El tablero del otro se actualiza
   solo, sin recargar, en unos segundos.

Cualquiera que tenga el link y la clave de acceso puede abrir la partida sin
sumarse como jugador: la ve como **espectador**, con el tablero al día pero
sin poder mover ni ocupar el asiento libre.

## Comandos

- `npm run dev` — servidor de desarrollo.
- `npm test` — pruebas unitarias e de integración (Vitest).
- `npm run test:e2e` — pruebas end-to-end con navegadores reales (Playwright).
- `npm run lint` — ESLint.
- `npm run build` — build de producción.

Dos cosas no obvias sobre las pruebas:

- **Vitest no carga `.env.local` por sí solo.** Las pruebas de integración
  contra Redis se saltan a sí mismas si esas variables no están en el
  entorno del proceso. Para correrlas de verdad, exportá `.env.local` antes:

  ```bash
  set -a; . ./.env.local; set +a
  npm test
  ```

- **La suite e2e corre a propósito contra el almacén en memoria, nunca
  contra Upstash real** (fuerza `UPSTASH_REDIS_REST_URL` y
  `UPSTASH_REDIS_REST_TOKEN` vacías para su propio servidor de prueba,
  aunque tu shell tenga las reales exportadas). Así nunca consume la cuota
  del plan gratuito de Upstash sólo por correr los tests.

## Despliegue en Vercel

1. Importar el repositorio de GitHub en <https://vercel.com/new>. Vercel
   detecta que es un proyecto Next.js solo — no hace falta configuración de
   build más allá de lo que trae por defecto.
2. Configurar las mismas tres variables (`ACCESS_KEY`,
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) tanto para
   **Production** como para **Preview**.
3. Deploy.

Si te olvidás alguna de las dos variables de Upstash, el sitio va a arrancar
sin ningún error visible y va a perder las partidas entre jugadas — el mismo
modo de falla silenciosa descrito arriba, más peligroso todavía en producción
porque cada invocación serverless puede caer en una instancia distinta.
Verificá las tres antes de compartir el link con nadie.

## Estructura del proyecto

- `src/core` — reglas de ajedrez y estado de partida. Puro: sin I/O, sin
  conocer HTTP ni el almacén.
- `src/server` — el árbitro (valida cada jugada contra el estado guardado),
  los almacenes (memoria y Redis), y el chequeo de la clave de acceso.
- `src/app/api` — las cuatro rutas HTTP: crear partida, unirse, consultar
  estado, mover.
- `src/client` — el wrapper de `fetch` hacia esas rutas y el hook de consulta
  periódica que mantiene el tablero al día.
- `src/components` — el tablero (`react-chessboard`) y su lógica de arrastre.
- `e2e` — las pruebas de Playwright que ejercitan la app real, con dos
  navegadores jugando entre sí.

## Decisiones de diseño que conviene conocer

- **El historial de jugadas en SAN es la fuente de verdad, no el FEN.** El
  FEN se guarda igual, por comodidad del cliente, pero se deriva del
  historial en cada jugada. Un FEN solo no alcanza para detectar la
  repetición de posición por triple ni la regla de las cincuenta jugadas —
  ambas necesitan saber qué pasó antes, no solo la posición actual.
- **El servidor es la única autoridad.** El cliente valida de forma
  optimista — con la misma librería de reglas del lado del servidor — pero
  solo para que el tablero reaccione al instante; la jugada que de verdad
  cuenta es la que el servidor acepta.
- **Las escrituras usan concurrencia optimista**: cada partida tiene un
  campo `version`, y el almacén hace un compare-and-swap (`putIfVersion`) en
  vez de un `put` liso. Sin esto, dos personas abriendo el link de invitación
  al mismo tiempo, o alguien haciendo doble clic en una conexión lenta,
  podrían generar dos escrituras que ambas "tienen éxito" y una jugada
  desaparece sin que nadie se entere.
- **El cliente consulta cada 4 segundos en vez de mantener una conexión
  abierta** (websocket, SSE). Es menos inmediato, pero evita por completo los
  límites de duración de las funciones serverless, que no están pensadas
  para conexiones persistentes.

## Limitaciones conocidas (Hito 1)

- No hay límite de intentos sobre la clave de acceso.
- No hay reloj de partida.
- No hay panel de historial de jugadas visible en la UI.
- No hay revancha: terminada una partida, hay que crear una nueva.

## Más información

- Diseño: [`docs/superpowers/specs/2026-08-18-chess-llm-design.md`](docs/superpowers/specs/2026-08-18-chess-llm-design.md)
- Plan de implementación: [`docs/superpowers/plans/2026-08-18-hito1-dos-personas.md`](docs/superpowers/plans/2026-08-18-hito1-dos-personas.md)
