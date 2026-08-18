import { defineConfig } from '@playwright/test'
import { CLAVE_E2E } from './e2e/support'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // El chequeo de disponibilidad de `webServer` sólo calienta `/`; el resto
  // de las rutas (API de crear/unirse/mover, página de partida) compilan
  // recién con su primera petición real. `globalSetup` las toca a todas una
  // vez, con el server ya arriba, antes de que corra el primer test — así
  // los tests miden el comportamiento real de la app, no el arranque en
  // frío de Turbopack.
  globalSetup: './e2e/global-setup.ts',
  retries: 0,
  reporter: 'list',
  // Un solo worker: los cinco specs comparten un único `next dev` (un solo
  // proceso Node, almacén en memoria). Con 4 workers en paralelo, varios
  // navegadores golpeando ese mismo proceso a la vez (create/join/poll de
  // varias partidas simultáneas) lo hacían tardar más de los 15s de
  // `expect.timeout` en responder un simple POST /api/match — no una
  // aserción lenta, sino contención real de un server de desarrollo de un
  // solo proceso. Serializar los tests evita esa contención en la raíz, en
  // vez de subir el timeout para tolerarla.
  workers: 1,
  expect: {
    // El default de Playwright (5s) alcanza casi siempre, pero el hook de
    // sondeo de la app se relaja a un intervalo de 4s entre consultas: un
    // cambio hecho por el otro jugador puede legítimamente tardar unos
    // segundos en aparecer en la pantalla de uno. 15s da margen de sobra a
    // eso sin ocultar una demora real (si algo tarda más que eso, es un
    // defecto, no falta de paciencia).
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // false, no true: así cada corrida levanta su propio server con este
    // env exacto. Si ya hay algo escuchando en el puerto (p.ej. un `npm run
    // dev` manual del desarrollador, con la clave y el almacén reales), la
    // corrida falla con un error claro en vez de jugar en silencio contra
    // ese server ajeno.
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // Next.js (vía @next/env) sólo carga `.env.local` cuando
      // NODE_ENV !== 'test' (comprobado leyendo node_modules/@next/env y
      // confirmado por separado corriendo `loadEnvConfig` a mano con cada
      // NODE_ENV). Con 'test' busca .env.test.local/.env.test/.env, ninguno
      // de los cuales existe en este repo, así que `.env.local` no se toca:
      // ni su ACCESS_KEY real ni sus credenciales de Upstash llegan al
      // server de e2e por esta vía.
      NODE_ENV: 'test',
      ACCESS_KEY: CLAVE_E2E,
      // Playwright arranca `command` con
      // { ...DEFAULT_ENV, ...process.env, ...this.env } (ver
      // node_modules/playwright/lib/runner/index.js, _startProcess): lo que
      // pongamos acá pisa lo que haya exportado la shell que invoca
      // `npm run test:e2e`. Si alguien corriera el test tras hacer
      // `set -a; . ./.env.local; set +a`, sin estas dos líneas las
      // credenciales reales de Upstash se colarían por ahí, esquivando la
      // protección de NODE_ENV=test de arriba. Puestas en '' (no ausentes)
      // fuerzan `getStore()` (src/server/store/index.ts) a caer siempre al
      // almacén en memoria, que alcanza porque `next dev` es un único
      // proceso: así la prueba nunca toca la base de datos real ni gasta
      // cuota del free tier, y no depende de la red.
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    },
  },
})
