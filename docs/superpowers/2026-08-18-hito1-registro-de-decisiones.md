# SDD ledger — plan: docs/superpowers/plans/2026-08-18-hito1-dos-personas.md

Rama: hito-1-dos-personas (creada desde main @ be01ecb)

Ruling: sin worktree, se trabaja en una rama del repo principal — el partner
pidió explícitamente "armalo local", y un worktree obligaría a duplicar
node_modules y a levantar el dev server fuera del directorio que él está
mirando. Costo si es incorrecto: main queda un commit atrás; se resuelve con
un merge.

## Escaneo previo de conflictos

| # | Alcance | Produce → Consume | Hallazgo |
|---|---|---|---|
| 1 | T1 → T2..T9 | alias `@/*` de create-next-app → imports `@/core`, `@/server` | OK. vitest.config.ts define el mismo alias. |
| 2 | T2 → T4 | `applyMove`, `fenOf`, `turnOf`, `outcomeOf` → árbitro | OK, firmas coinciden. |
| 3 | T2 → T8 | `legalMoves`, `applyMove` → cliente | **CONFLICTO.** Nadie los consume. El Board de T8 devuelve `true` sin validar. |
| 4 | T3 → T4 | `MatchState`, `MatchStore`, `PlayerSlot` → árbitro | OK. |
| 5 | T3 → T5 | `toPublic`, `PublicMatch` → rutas | OK. |
| 6 | T3 → T6 | `MatchStore` → `RedisStore` | OK. |
| 7 | T5 → T6 | `store/index.ts` creado y luego reemplazado completo | OK, T6 da el archivo entero. |
| 8 | T5 → T7 | Formas de respuesta `{match,token,color}` / `{match}` → tipos del cliente | OK, coinciden. |
| 9 | T7 → T8 | `useMatch`, `turnoDe`, `api*`, `*Creds` → páginas | OK, todo exportado. |
| 10 | T8 → T9 | Textos de la UI → selectores de Playwright | **CONFLICTO.** `getByRole('textbox')` no matchea `input[type=password]`. |
| 11 | T6 → T9 | `.env.local` con Upstash → e2e | **CONFLICTO.** T9 exige ausencia de credenciales pero Next carga `.env.local` igual. |
| 12 | T2 interna | secuencias de jugadas de los tests ↔ aserciones | RIESGO. Coronación y ahogado dependen de secuencias que hay que verificar corriéndolas. |
| 13 | T4 interna | orden de validación ply/turno ↔ tests | OK. `stale_ply` se chequea antes que el turno; los tests lo asumen así. |
| 14 | T4 interna | `submitMove` sobre partida terminada ↔ test | OK, `status !== 'active'` cubre `finished`. |
| 15 | T5 interna | `checkAccess` falla cerrada ↔ Global Constraints | OK. |
| 16 | T7 interna | `turnoDe` por paridad de ply ↔ árbitro | OK, equivalente al turno real en ajedrez estándar. |
| 17 | T10 | repositorio en GitHub | Depende del partner; no bloquea T1..T9. |

### Rulings del escaneo

Ruling (fila 3): el spec §5 exige validación optimista en el cliente y el plan
la prometió en su bloque de arquitectura, pero T8 no la implementa. Se enmienda
T8: `Board` recibe el historial y valida con `applyMove` antes de enviar,
devolviendo `false` si la jugada es ilegal para que la pieza vuelva sola.
Incluye autocoronación a dama. Costo si es incorrecto: el tablero acepta
jugadas ilegales y parpadea al corregirlas desde el servidor.

Ruling (fila 10): se cambia el selector de T9 a `input[type=password]`. Los
inputs de contraseña no exponen rol `textbox` en ARIA, así que el selector del
plan nunca habría encontrado el campo. Costo si es incorrecto: el test e2e
falla y hay que ajustar el selector con `--debug`.

Ruling (fila 11): se elimina la exigencia de que no haya credenciales de
Upstash durante el e2e. Es inaplicable —Next carga `.env.local` siempre— e
innecesaria: la prueba pasa igual contra Redis, solo consume algunos comandos
del free tier. Costo si es incorrecto: el e2e gasta cuota de Upstash.

Ruling (fila 12): el implementador debe verificar empíricamente las secuencias
de jugadas de los tests de coronación, ahogado y repetición, ajustándolas hasta
que alcancen la posición descrita. Lo que no puede cambiar es la aserción.
Costo si es incorrecto: se prueba una situación distinta de la que dice el
nombre del test.

## Progreso

Ruling (previo, T2): `legalMoves` queda en el núcleo aunque el Hito 1 no lo
consuma. Es el primitivo del que depende la mitigación central del spec (pasarle
las jugadas legales al LLM) y su test es la comprobación más directa de que el
módulo funciona. Costo si es incorrecto: una función de una línea sin usar
durante un hito.

Verificación previa T2 (fila 12): las cinco secuencias del plan se corrieron
contra chess.js 1.4.0 real. Resultado: mate del loco = checkmate turno w (0-1),
mate del pastor = checkmate turno b (1-0), ahogado = stalemate, repetición =
threefold, coronación = SAN `gxh8=Q`. Ninguna necesita ajuste; el riesgo de la
fila 12 queda cerrado.

Ruling (entorno): el `node` por defecto de la máquina es v18.20.5 y Next 16.3.1
exige >=20.9.0. Hay v22.12.0 instalado vía nvm. Se usa v22.12.0 mediante
`PATH=...` por comando, y se agrega `.nvmrc`. NO se toca el default global de la
máquina: es un efecto fuera del repo y el partner no lo pidió. Costo si es
incorrecto: cada comando npm necesita el prefijo de PATH, lo que es engorroso
pero no rompe nada; si molesta, el partner corre `nvm use` en su terminal.

Task 1: implementador DONE_WITH_CONCERNS (commit 5ab6eaa, base ae144a6).
  npm test 2/2, npm run build OK bajo Node 22.12.0.
  Desviación 1: create-next-app@16.3.1 aborta duro si el directorio tiene
  entradas fuera de su whitelist; `.superpowers/` se movió fuera y se restauró.
  Desviación 2: el .gitignore generado usaba `.env*`, que también ignoraba
  `.env.example`; el implementador agregó `!.env.example`.
  Revisión de tarea despachada.

Task 1: revisión limpia — spec OK, calidad aprobada, 0 críticos, 0 importantes.
  El revisor verificó en vivo que el alias `@/subruta` resuelve en Vitest, que
  el default global de node sigue en v18.20.5, y que docs/ y .superpowers/
  sobrevivieron al andamiaje.
Task 1: minor (deferred): package.json usa rangos con caret (^1.4.0 etc.) en vez
  de versiones exactas; package-lock.json fija las correctas.
  Ruling: se acepta el pinning por lockfile, que es la práctica estándar y ya
  está versionado. Costo si es incorrecto: un `npm install` sin lockfile podría
  traer versiones menores distintas.
Task 1: minor (deferred): vitest emite un aviso de configLoader en cada corrida.
  Ruling: se pliega el arreglo (renombrar a vitest.config.mts) al despacho de la
  Task 2, en vez de dejarlo para el final. El aviso va a ensuciar la salida de
  las 9 tareas restantes y es donde se detectan los problemas reales. Costo si
  es incorrecto: un renombre trivial de revertir.
Task 1: complete (commits ae144a6..5ab6eaa, review clean)

Task 2: implementador DONE (commit f877a4f, base 5ab6eaa). 13 tests del núcleo,
  15 en total, suite completa verde. Diff limpio: solo src/core/game.ts y su test.
  El renombre a vitest.config.mts NO silenció el aviso, así que se revirtió según
  la vía de escape del despacho. El minor del aviso vuelve a quedar diferido para
  la revisión final.
  Revisión de tarea despachada.

Task 2: revisión limpia — spec OK, calidad aprobada, 0 críticos, 0 importantes.
  El revisor confirmó por inspección (no solo por test) que applyMove no muta el
  array recibido y que la atribución del mate no está invertida. Verificó en el
  árbol de trabajo que la reversión del renombre de vitest fue limpia.
Task 2: minor (deferred): `catch {}` sin capturar el error pierde el mensaje
  original de chess.js.
Task 2: minor (deferred): `replay()` lanza sin control si el historial llegara
  corrupto; hoy es imposible porque solo lo produce applyMove, pero conviene el
  comentario del invariante.
Task 2: complete (commits 5ab6eaa..f877a4f, review clean)

Task 3: implementador DONE (commit 721b61c, base f877a4f). 19 tests en total,
  4 nuevos. Diff limpio: match-state.ts, store/types.ts, store/memory.ts y su test.
  Nota: el desglose por tarea del reporte no cierra (dice 7+8 para tareas previas,
  los reales eran 2 y 13). El total de 19 sí es consistente. Se pasó al revisor
  para que lo confirme corriendo la suite.
  Revisión de tarea despachada.

Task 3: revisión — spec OK, calidad aprobada. El revisor construyó el caso
  adversario real para toPublic (ambos tokens presentes) y confirmó que ni
  `'token' in players.w` ni JSON.stringify filtran el secreto: el orden
  spread-luego-sobrescritura es seguro. tsc --noEmit limpio. Suite 19/19
  re-corrida por el revisor con --reporter=verbose.

Task 3: IMPORTANTE (no en el código, en el reporte): el reporte del implementador
  nombra un archivo de test inexistente (`src/core/pgn.test.ts`) con un conteo
  inventado, atribuye 7 tests a game.test.ts (son 13) y omite smoke.test.ts. El
  total de 19 coincide por casualidad.
  Ruling: NO se abre ciclo de arreglo. El hallazgo es sobre un archivo de texto,
  no sobre el diff, que el revisor verificó independientemente correcto y verde.
  Lo que sí cambia es el proceso: (a) los implementadores pasan de haiku a sonnet
  para el resto de las tareas — es la segunda imprecisión de reporte del mismo
  nivel de modelo; (b) ningún reporte de test se acepta sin que el revisor
  re-corra la suite él mismo, cosa que ya venía haciendo. Costo si es incorrecto:
  se gasta más por tarea a cambio de reportes fiables.

Task 3: minor elevado: no hay test que cubra `toPublic`, que es la función de la
  que depende que un token no llegue al navegador del rival.
  Ruling: se pliega al despacho de la Task 4 un test que afirme que toPublic no
  expone `token` en ninguno de los dos colores. El revisor lo clasificó menor
  porque el brief no lo pedía, pero yo marqué esa propiedad como crítica de
  seguridad y no puede quedar sin cobertura. Costo si es incorrecto: un test de
  tres líneas de más.

Task 3: minor (deferred): `JSON.parse(...) as MatchState` sin validación en
  tiempo de ejecución; Task 6 (Redis) no debe copiar ese patrón a ciegas.
Task 3: complete (commits f877a4f..721b61c, review clean)

Task 4: implementador DONE (commit cf742d5, base 721b61c). Suite 36/36 en 5
  archivos (2 humo + 13 reglas + 4 almacén + 14 árbitro + 3 toPublic), tsc limpio.
  Incluye el test de toPublic plegado desde la revisión de la Task 3.
  El implementador detectó que la prosa del brief decía 13 tests para
  match.test.ts cuando el código pegado en el mismo brief tiene 14 bloques `it`,
  lo reportó y NO alteró los tests para forzar la coincidencia. Comportamiento
  correcto; confirma que el cambio de haiku a sonnet era la decisión adecuada.
  Revisión de tarea despachada en opus: es el módulo de mayor riesgo del hito.

Task 4: revisión — spec OK, calidad NECESITA ARREGLOS. 6 importantes, todos
  demostrados con pruebas ejecutadas fuera del árbol (HEAD intacto).
  Verificado correcto: turno por historial y paridad de ply no pueden discrepar;
  todos los tipos de tablas terminan la partida; los rechazos nunca escriben;
  nunca se ramifica por `kind`; el token de blancas no se sobrescribe al unirse.

  Ruling (hallazgo 1, orden ply-antes-que-turno): mi propio despacho afirmó que
  un test cubría ese orden. El revisor probó que NO: intercambiando las dos
  líneas los 14 tests siguen verdes. Se agrega el test que sí distingue (doble
  clic real de blancas). Costo si es incorrecto: un test de más.

  Ruling (hallazgo 2, coronación sin cobertura): chess.js 1.4.0 NO corona a dama
  por defecto — omitir `promotion` devuelve `illegal_move`. Borrar el
  pass-through no rompe ningún test hoy. Se agrega test de coronación en el
  árbitro. Esto además valida la enmienda que hice al plan de la Task 8, donde
  el tablero corona a dama explícitamente. Costo si es incorrecto: un test de más.

  Ruling (hallazgos 3 y 4, concurrencia): son los dos bugs reales del hito y
  ambos se reprodujeron. Dos joins simultáneos entregan negras a dos tokens
  distintos; dos movimientos simultáneos con el mismo ply se aplican los dos y
  uno desaparece en silencio tras haber sido reportado como exitoso al cliente.
  El revisor sugirió elevarlo a decisión humana. NO lo hago: "dos personas en dos
  dispositivos" es literalmente el hito, un movimiento que se evapora destruye la
  confianza en el producto, y el arreglo no es un salto al vacío. Se agrega
  `version: number` a MatchState y `putIfVersion(state, expectedVersion)` a
  MatchStore, con nuevo error `conflict`. Costo si es incorrecto: una escritura
  condicional de más y un campo que Task 6 debe respetar en Redis.

  Ruling (hallazgo 5, id de 8 hex): el id de partida ES la credencial para
  ocupar el asiento negro, y 32 bits es enumerable. Se quita `.slice(0, 8)`.
  Costo si es incorrecto: URLs más largas.

  Ruling (hallazgo 6, duplicación del mate del loco en tests): se extrae helper.

  Ruling (minor Q4, asiento con token null): un bot no tiene secreto que
  presentar, así que su asiento leería como vacante y cualquier humano con el
  link lo desplazaría. Se agrega `open: boolean` a PlayerSlot ahora, que es
  cuando cuesta tres líneas. Costo si es incorrecto: un campo booleano de más.

Task 4 fix round 1: el primer implementador se colgó (watchdog, 600s sin
  progreso) dejando la capa de almacenamiento aplicada sin commitear y match.ts
  intacto. El trabajo parcial se inspeccionó y es correcto: putIfVersion en
  MemoryStore no tiene await entre leer la versión y escribir.
  Ruling: se despacha un implementador FRESCO con la lista de lo que falta, en
  vez de reanimar al que se colgó. Costo si es incorrecto: se rehace trabajo ya
  hecho, pero el despacho enumera explícitamente lo que no debe tocarse.

Plan enmendado (tasks 5, 6, 8) por el cambio de escritura condicional:
  - T5: 'conflict' mapea a HTTP 409; la ruta de unión lo traduce a 'full',
    que es lo que el hecho significa para quien pierde la carrera.
  - T6: RedisStore implementa putIfVersion con EVAL Lua sobre una clave hermana
    `match:{id}:v`, evitando depender de cjson. Verificado contra los tipos
    reales de @upstash/redis 1.38.2: `eval(script, keys, args): Promise<TData>`
    existe en la clase Redis. Se agregan 3 tests de integración de CAS.
  - T8: el botón "unirme como negras" mira `open`, no `taken`.
  Briefs 5, 6 y 8 regenerados.

Task 4: fix round 1/5 (7 hallazgos atendidos, 0 abiertos; commits cf742d5..919393b).
  Suite 44/44 en 5 archivos, tsc limpio. El implementador validó que dos de los
  tests nuevos son portantes reintroduciendo cada bug y confirmando que falla
  exactamente ese test.
  Ruling (coordinación): el implementador reportó que el archivo del plan apareció
  modificado sin que él lo tocara; fui yo enmendándolo en paralelo, y su `git add
  -A` lo arrastró al commit. Solo documentación, sin daño. Corrección de proceso:
  no editar el plan mientras hay un implementador despachado. Costo si es
  incorrecto: un commit mezcla código y documentación.

Task 4: re-revisión — los 7 hallazgos ADDRESSED, 0 roturas nuevas. El revisor
  verificó que los tests nuevos son falsables (el implementador ya había
  reintroducido cada bug) y que las garantías de concurrencia son deterministas,
  no una carrera afortunada.
Task 4: complete (commits 721b61c..919393b, review clean tras 1 ronda de arreglo)

Task 5: implementador DONE (commit acf16bb, base 919393b). Suite 48/48 en 6
  archivos, tsc limpio. 7 archivos, ninguno fuera de alcance; no usó git add -A.
  Verificó por curl que el token no aparece dentro de match.players ni en crear
  ni en leer, y ejercitó join (200 y luego 409) y move (aplicado, 403 sin clave).
  Revisión despachada en opus: es toda la superficie expuesta del proyecto.

Task 5: revisión (opus) — spec OK, calidad NECESITA ARREGLOS. 3 importantes,
  5 menores. Verificado bajo ataque real, con servidor levantado: 0 apariciones
  de los tokens reales en ningún cuerpo de respuesta (grep sobre bytes crudos, no
  inspección de forma); la clave se valida antes de `await params` y antes de
  parsear el cuerpo (403 gana a 500 y a 404, sin oráculo de existencia); toda la
  tabla MoveError->HTTP correcta; `promotion` hostil ("k","K","p","",null,{},...)
  siempre termina en illegal_move/422, sin coronar a rey ni default silencioso;
  ids con metacaracteres dan 404 limpio; las 4 rutas son dinámicas en next build.

  Ruling (imp. 1): `await req.json()` sin guarda devuelve 500 con cuerpo vacío
  ante un cuerpo ausente o `{`. No filtra la traza, pero rompe el contrato de
  4xx limpio en la frontera y lo alcanza cualquiera con un byte. Se arregla con
  `.catch(() => null)`, que ya cae en el 400 existente.

  Ruling (imp. 2): las 4 rutas no tienen NINGÚN test automatizado; la única
  cobertura es curl manual. En el conjunto de archivos que constituye toda la
  frontera de seguridad, eso no alcanza: nada impide que una edición futura
  devuelva un MatchState crudo. Se agregan tests de ruta importando los handlers
  directamente. La aserción de mayor valor es la negativa: el texto de la
  respuesta no debe contener el token. Costo si es incorrecto: un archivo de test.

  Ruling (imp. 3): el `afterEach` de auth.test.ts asigna `process.env.ACCESS_KEY
  = undefined`, que en Node guarda la CADENA "undefined" — o sea deja una clave
  verdadera puesta para lo que corra después en ese worker, desarmando en
  silencio la garantía de fail-closed. Hoy ningún test falla, pero es una trampa
  armada justo para los tests de ruta del punto 2. Se arregla con delete.

  Ruling (menores 5,6,7 + timing): se hacen todos, son de una línea cada uno:
  guarda de formato UUID para el id antes de que llegue al almacén (Task 6 lo
  mete en nombres de claves de Redis); `Record<MoveError, number>` en vez de
  `Record<string, number>` para recuperar exhaustividad en compilación; `unknown`
  en vez de `any` para el cuerpo; `cache-control: no-store` en respuestas que
  llevan el token; y comparación de tiempo constante para la clave.

  Ruling (menor 8): la guarda de acceso está duplicada en 4 archivos y sostenida
  por costumbre, no por estructura. El Hito 2 agrega tres rutas más (pista,
  resumen, paso). Se envuelve en `withAccess(handler)` ahora, que es cuando
  cuesta poco. Costo si es incorrecto: una capa de indirección.

  Ruling (menor 4, límite de intentos): NO se implementa en este hito. Una clave
  corta con intentos ilimitados es el ataque realista contra esta frontera, pero
  un límite decente necesita el Redis de la Task 6 y la decisión de cuán
  restrictivo ser afecta el bolsillo del partner. Se documenta la exigencia de
  clave larga y aleatoria, y se eleva a decisión suya al cerrar el hito.
  Costo si es incorrecto: alguien con el link puede intentar adivinar la clave
  sin freno hasta que se agregue el límite.

Task 5: fix round 1/5 (8 items atendidos; commits acf16bb..6286bf1). Suite 64/64
  en 7 archivos, tsc limpio, next build OK. El implementador validó que los tests
  nuevos son portantes: revirtió la guarda de req.json y falló el test del cuerpo
  ausente; devolvió el estado crudo desde una ruta y falló el test de fuga de
  token mostrando ambos tokens en el texto. Ambos revertidos.
  Re-revisión acotada despachada.

Task 5: re-revisión — los 8 hallazgos ADDRESSED, 0 roturas críticas/importantes.
  El revisor rastreó loadEnv() de Vite para confirmar que Vitest NO inyecta
  ACCESS_KEY desde .env.local, o sea que el test de fail-closed ejercita
  realmente la variable ausente.
Task 5: minor (deferred): si un handler envuelto lanza una excepción no
  capturada, withAccess no llega a poner cache-control en el 500 del framework.
Task 5: minor (deferred): ID_VALIDO acepta cualquier UUID con forma hex, no
  estrictamente v4. Suficiente para el motivo (claves de Redis).
Task 5: complete (commits 919393b..6286bf1, review clean tras 1 ronda de arreglo)

Ruling (Task 6, verificación): los tests de integración de Redis se saltean solos
  sin credenciales, y crear la base en Upstash requiere la cuenta del partner —
  no puedo hacerlo yo. Se implementa igual y se le avisa. Para no dejar la parte
  más riesgosa (el script Lua de CAS) sin ninguna verificación, se exige además
  un test unitario con un cliente Redis simulado que compruebe los argumentos
  exactos que se le pasan a eval. Costo si es incorrecto: el CAS de Redis queda
  sin probar contra un Redis real hasta que el partner cargue credenciales.

Task 6: implementador DONE (commit 71bf352, base 6286bf1). 73 tests, 5 salteados
  por falta de credenciales, tsc y next build limpios. Seam de inyección mínimo
  en el constructor + 4 tests unitarios con cliente falso.

VERIFICACIÓN CLAVE: el partner entregó credenciales de Upstash justo al terminar
  la tarea. Se cargaron en .env.local (confirmado ignorado en .gitignore:34, git
  status limpio) y el coordinador corrió la suite completa con las variables
  exportadas — Vitest NO carga .env.local por sí solo, hay que exportarlas.
  Resultado: 73/73 pasan, 0 salteados. Los 5 tests de integración pasan contra
  el Upstash real, incluidos los tres de CAS. El script Lua funciona en el
  entorno real de Upstash, que era la única incógnita seria del hito: de él
  dependen los dos arreglos de concurrencia de la Task 4. Además, como las
  credenciales estaban presentes, routes.test.ts corrió contra Redis real
  (latencias de ~800ms), verificando la pila completa y no solo la pieza.

Task 6: revisión — spec OK, calidad aprobada con seguimiento. Todas las pruebas
  adversarias contra la base real pasaron: 20 putIfVersion concurrentes con
  exactamente un ganador y sin estado mezclado; fidelidad byte a byte por ambos
  caminos de escritura (SET normal y Lua), incluidos nulls y players anidado;
  TTL de 604800s confirmado consultando la base; getStore() sin credenciales no
  construye RedisStore ni lanza en import (68 pasan, 5 se saltean).

  Ruling (importante): `put()` hace dos SET independientes. Si muere entre uno y
  otro al crear la partida, queda el estado sin su clave de versión. El revisor
  lo reprodujo: get() devuelve la partida normalmente porque nunca lee la clave
  de versión, pero todo putIfVersion posterior devuelve false PARA SIEMPRE, y al
  llamador le llega como un 409 corriente. Partida muerta en silencio, sin
  recuperación ni señal. Ventana angosta —solo en creación— pero es exactamente
  la clase de falla que este almacén existe para evitar. Se arregla enrutando
  put() por un EVAL Lua incondicional que escribe ambas claves de una.
  Costo si es incorrecto: una llamada eval en vez de dos set.

Task 6: fix round 1/5 (1 hallazgo atendido; commits 71bf352..ca17442). put() pasa
  por un EVAL Lua incondicional. 74/74 con credenciales, 68+6 salteados sin ellas,
  tsc y next build limpios. El implementador validó que el test es portante:
  revirtió a dos `set` y el test unitario falló como se esperaba.
  Re-revisión acotada despachada.

Task 6: hallazgo diferido (declarado por el implementador, no introducido por el
  arreglo): routes.test.ts usa el singleton getStore(), así que cuando hay
  credenciales en el shell esos tests pegan contra el Redis real en vez de la
  memoria (se nota: 150-1400ms por test contra unos pocos ms). Eso los vuelve
  dependientes de la red y consume cuota del free tier del partner.
  Ruling: se pliega el arreglo al despacho de la Task 7 — los tests de ruta deben
  forzar el almacén en memoria de forma determinista. Costo si es incorrecto:
  la suite tarda más y gasta comandos de Upstash en cada corrida.

Task 6: re-revisión — ADDRESSED, 0 roturas nuevas. Verificado de nuevo contra la
  base real: TTL en ambas claves, simetría de serialización por ambos caminos,
  15 putIfVersion concurrentes con un solo ganador, suite verde con y sin
  credenciales. El revisor rastreó por git log que el acoplamiento de
  routes.test.ts es preexistente (acf16bb y 71bf352), no de este arreglo, y
  recomienda vi.mock de '@/server/store' en ese archivo.
Task 6: complete (commits 6286bf1..ca17442, review clean tras 1 ronda de arreglo)

Task 7: implementador DONE (commit 00cff1a, base ca17442). 75+6 salteados sin
  credenciales, 81 con ellas; tsc y next build limpios. Item 4 verificado: los
  tiempos de routes.test.ts cayeron de 174-1371ms a 0-31ms tras stubear
  getStore(), con y sin credenciales exportadas.
  Desviación declarada: usó un factory async con import perezoso en vi.mock en
  vez del snippet literal, para esquivar el riesgo de hoisting que el propio
  despacho advertía.
  Concern declarado: el useMatch.ts VERBATIM DEL PLAN (código mío, no suyo)
  dispara 3 errores y 1 warning de ESLint bajo las reglas react-hooks/React
  Compiler del repo. No alteró código verbatim sin preguntar, que es lo correcto.
  Revisión despachada en opus, pidiéndole explícitamente que separe ruido de
  linter de defectos reales de cierres obsoletos y carreras poll-vs-move.

Task 7: revisión (opus) — spec OK, calidad NECESITA ARREGLOS. 2 CRÍTICOS, 2
  importantes, 6 menores. Los dos críticos están en el useMatch.ts que escribí yo
  en el plan, no en el trabajo del implementador. Su aporte propio (el stub de
  getStore en routes.test.ts) es correcto, justificado y medido antes/después.

  Ruling (crítico 1): una sola consulta fallida detiene el polling PARA SIEMPRE.
  El bucle se reprograma solo cuando cambia la identidad de `match`, y el catch
  de refrescar nunca llama a setMatch — así que las tres dependencias del efecto
  quedan idénticas, no hay limpieza, no hay temporizador pendiente y ningún
  camino crea uno nuevo. Es determinista por la semántica de comparación de
  dependencias de React, no una carrera. Se dispara con cualquier fallo pasajero:
  un bache de red móvil, despertar el laptop, un arranque en frío de Vercel. El
  tablero se congela en silencio y solo se recupera si el usuario cambia de
  pestaña y vuelve. Se reestructura el hook.

  Ruling (crítico 2): una consulta en vuelo puede pisar un estado más nuevo.
  Secuencia: consulta en vuelo con ply N -> el jugador mueve -> el servidor
  aplica y devuelve N+1 -> la consulta vieja resuelve con N y setMatch la escribe
  sin condición. El tablero REVIERTE visualmente la jugada propia hasta 4s, y en
  esa ventana el jugador puede arrastrar otra pieza, mandar el ply viejo, recibir
  409 y ver un error por una jugada que en realidad entró. Ninguna jugada
  incorrecta se aplica jamás en el servidor —la guarda de ply funciona— pero el
  tablero le miente al jugador. Se arregla con setMatch funcional comparando
  `version`, que PublicMatch ya trae.

  Ruling (imp. 3): `npm run lint` está en rojo (exit 1), 3 errores y 1 warning,
  todos en useMatch.ts. Tres de los cuatro apuntan directamente a los dos
  críticos: preserve-manual-memoization reporta literalmente que la lista de
  dependencias escrita a mano es más angosta que lo que el cuerpo lee. No es
  ruido de linter.

  Ruling (imp. 4): las ~70 líneas con estado del hook no tienen NINGUNA cobertura
  de runtime, y el harness no puede dárselas: no hay jsdom ni testing-library, y
  el glob de vitest excluye .tsx (lo que además va a excluir los tests de la
  Task 8). Por eso el crítico 1 llegó hasta acá. Se instalan jsdom y
  @testing-library/react, se ensancha el glob y se agregan dos tests de regresión.
  Costo si es incorrecto: dos dependencias de desarrollo más.

  Ruling (menores api.ts): se arreglan los de robustez — r.json() antes de mirar
  r.ok hace que un 502 con HTML explote con un SyntaxError crudo en la cara del
  usuario, volviendo inalcanzable el fallback escrito justo para ese caso; `pedir`
  descarta init.headers en silencio; loadCreds parsea sin guarda y una
  localStorage corrupta tira el componente desde dentro del efecto.

Task 7: fix round 1/5 (2 críticos + 2 importantes + 4 menores atendidos;
  commits 00cff1a..5733884). 83 con credenciales, 77+6 salteados sin ellas.
  npm run lint pasa de 3 errores + 1 warning a exit 0, sin comentarios de
  disable. tsc y next build limpios. routes.test.ts sigue en 0-15ms.
  El implementador encontró y corrigió un bug de aislamiento propio:
  vi.clearAllMocks() dejaba una entrada sin consumir en la cola del mock y hacía
  que el test del crítico 2 pasara contra el código VIEJO por el motivo
  equivocado; cambió a vi.resetAllMocks() y re-verificó que ambos fallan de
  verdad contra el código anterior.
  Desviaciones declaradas: sin canal de despertar inmediato tras la jugada propia
  (juzga aceptable el peor caso de 4s); backoff base*2^fallos.
  Re-revisión acotada despachada en opus, con instrucción de correr los tests de
  regresión contra el código viejo en vez de creerle al reporte.

Task 7: la primera re-revisión MURIÓ a mitad (la máquina se durmió) tras haber
  revertido src/client/useMatch.ts al código pre-arreglo para probarlo, dejando
  el árbol sucio. El coordinador inspeccionó el diff, confirmó que era eso,
  restauró con git checkout -- y verificó 83/83 verdes en HEAD 5733884.
  Ruling (proceso): la re-revisión se relanza con instrucción de usar un
  `git worktree` aparte en el commit viejo en vez de modificar el checkout
  principal, y de verificar `git status --porcelain` vacío antes de terminar.
  Costo si es incorrecto: el revisor gasta unos minutos armando el worktree.

Task 7: re-revisión — todos los críticos e importantes ADDRESSED, 0 roturas
  nuevas. El revisor usó un worktree aislado y verificó que ambos tests de
  regresión fallan contra 00cff1a incluso corriéndolos por separado con -t
  (el reporte no había establecido la independencia del orden), y que con
  clearAllMocks el test del crítico 2 pasa espuriamente: el bug de aislamiento
  autodetectado era real y su arreglo es portante. Coincide con las dos
  decisiones declaradas (sin canal de despertar; backoff base*2^fallos).

  Ruling (menor abierto, Credentials.accessKey): el implementador lo dejó
  opcional, que era una de las dos salidas que yo mismo había ofrecido. Elijo la
  otra: se elimina. Dos domicilios para un mismo secreto es una trampa de
  mantenimiento, y como yo controlo el despacho de la Task 8 puedo enmendar sus
  tres llamadas en el mismo movimiento. Plan enmendado y brief 8 regenerado.
  Costo si es incorrecto: hay que tocar tres literales en Task 8.

  Ruling (entorno, no del diff): `npx tsc --noEmit` salía 1 por cuatro archivos
  duplicados dentro de .next/types/ con sufijo " 2.ts" — firma de macOS
  duplicando por sincronización de iCloud/Drive, no del código. Se borraron
  (salida de compilación regenerable e ignorada por git) y tsc pasa a exit 0.
  Quedan más duplicados " 2.*" en .next/ que no afectan el chequeo. Se le avisa
  al partner porque es su entorno.

Task 7: minor (deferred): la cadena de temporizadores nunca queda ociosa; con la
  partida terminada sigue habiendo un despertar cada 4-15s sin red, por la vida
  del componente.
Task 7: minor (deferred): la guarda de visibilidad no aplica antes de la primera
  carga exitosa, así que un hook montado en pestaña oculta sí pide una vez.
Task 7: complete (commits ca17442..5733884, review clean tras 1 ronda de arreglo)

Task 8: implementador DONE (commit abfbf62, base 55b9908). 77+6 salteados (sin
  credenciales exportadas), lint, tsc y next build limpios. 4 archivos.
  Verificación manual REAL: dos BrowserContexts independientes de Playwright con
  arrastre de mouse de verdad, no llamadas a la API. Confirmó flujo de
  invitación, unirse como negras, arrastre ilegal rechazado con CERO llamadas de
  red, y mate del loco terminando 0-1 en ambos lados. Reprodujo además el 409
  stale_ply y confirmó que el tablero vuelve a la verdad del servidor con un
  mensaje neutro.
  Desviaciones declaradas: reestructuró un useEffect que fallaba
  set-state-in-effect; guardó los accesos a localStorage por un crash REAL de SSR
  encontrado en next build; agregó esErrorDeSincronizacion para el 409 no
  culpabilizante; quitó el accessKey? muerto de Credentials.
  Revisión despachada con instrucción de manejar la app él mismo y probar
  específicamente coronación, espectador, clave equivocada e id inexistente.

Task 8: revisión — spec OK, calidad APROBADA, 0 críticos, 0 importantes.
  El revisor manejó la app él mismo con Playwright real y worktrees aislados
  (nunca tocó el checkout revisado, git status limpio antes/durante/después).
  Reprodujo por su cuenta el crash de SSR (ReferenceError: localStorage is not
  defined) revirtiendo la guarda, y el error de lint set-state-in-effect
  restaurando el useEffect literal del brief: ambas desviaciones eran reales.
  Fortaleció la prueba de snap-back usando jugadas distintas (servidor e4 vs
  arrastre d4) para que el estado final desambigüe verdad del servidor de render
  optimista. Coronó un peón de verdad por captura y verificó Q en h8 en el FEN.
  Espectador: ve el tablero, no se le ofrece el asiento tomado, y su arrastre
  genera CERO llamadas a /move.
Task 8: minor (deferred): el fallback de partida inexistente muestra el código
  crudo "Error: not_found" en una UI por lo demás en español. Es código literal
  del brief, no algo que el implementador haya introducido.
Task 8: minor (deferred): sin tests automatizados para Board.tsx ni las páginas;
  el brief lo define como verificación manual y la Task 9 trae el e2e.
Task 8: complete (commits 55b9908..abfbf62, review clean sin rondas de arreglo)

Repositorio subido a GitHub (https://github.com/Chrisnatalx/Chess.git) a pedido
  del partner. NO se corrieron los comandos que GitHub sugiere: `git branch -M
  main` habría renombrado a la fuerza la rama de trabajo sobre main, y el
  "first commit" habría agregado un commit suelto encima de 10 tareas de
  historia. Se agregó el remoto y se empujaron ambas ramas tal cual.
  Antes de empujar se escaneó toda la historia: el token y la URL de Upstash no
  aparecen en ningún commit, y el único .env versionado es .env.example vacío.
  main sigue en be01ecb (solo documentación); se fusiona al cerrar el hito, que
  es el paso previo al deploy. Se le avisó al partner para que no importe en
  Vercel antes de eso.

Task 9: implementador DONE (commit d57603e, base abfbf62). 5 specs e2e, 5/5 en
  5 corridas consecutivas; npm test 77+6, lint, tsc y next build limpios.
  Corrigió dos suposiciones que le di yo: (a) dragTo() de Playwright NO funciona
  con este tablero porque react-chessboard 5.x usa @dnd-kit y necesita eventos
  intermedios de puntero — lo reemplazó por un arrastre manual; (b) el paralelismo
  por defecto causaba contención real contra el único proceso de next dev, y lo
  arregló con workers:1 en vez de alargar timeouts, que era la condición.
  El e2e usa memoria y nunca Upstash real: NODE_ENV=test (verificado
  empíricamente que hace que Next ignore .env.local) más variables vacías
  explícitas en webServer.env que pisan el shell invocante.
  Revisión despachada con instrucción de verificar ambas correcciones y de
  romper el código para comprobar que los tests no pasan en vacío.

Task 9: revisión — spec OK, calidad APROBADA. 1 importante, 2 menores.
  El revisor verificó AMBAS correcciones desde cero: escribió una sonda propia y
  confirmó que dragTo() deja 0 llamadas a /move y la casilla sin cambios; y leyó
  node_modules/@next/env para confirmar que loadEnvConfig decide la exclusión de
  .env.local leyendo process.env.NODE_ENV directamente, más
  node_modules/playwright para confirmar que webServer.env se aplica último y
  pisa el shell invocante. Corrió la suite 2 veces (5/5) vigilando lsof: ninguna
  conexión a Upstash.
  PRUEBA DE QUE NO PASAN EN VACÍO: rompió la validación del cliente en Board.tsx
  y movimiento-ilegal falló con 1 request en vez de 0; rompió las guardas de
  espectador y espectador.spec falló igual. Restauró y verificó árbol limpio.

  Ruling (importante): el relato de `workers: 1` es más amplio de lo que
  reproduce. Con globalSetup activo y 4 workers la suite pasa 3/3; la falla real
  era una carrera de compilación en frío de Turbopack, ya resuelta por el
  pre-calentamiento, no contención sostenida. Se MANTIENE workers:1 porque es
  seguro, pero se corrige el comentario para que no le diga a un mantenedor
  futuro que el paralelismo es inseguro en general. Se pliega al despacho de la
  Task 10. Costo si es incorrecto: un comentario.

Task 9: minor (deferred): los tests de espectador y arrastre ilegal se apoyan en
  dos guardas independientes; romper una sola no hace fallar el test, así que no
  identifican qué capa regresionó.
Task 9: minor (deferred): reuseExistingServer:false levanta un next dev completo
  por invocación; junto con workers:1 explica los ~35s de reloj.
Task 9: complete (commits abfbf62..d57603e, review clean sin rondas de arreglo)

Task 10: implementador DONE (commit 5601050). README en español + corrección del
  comentario de workers:1. npm test 83 con credenciales, lint, tsc, next build y
  e2e 5/5 limpios.

INTEGRACIÓN: el partner desplegó en Vercel desde main, que solo tenía los dos
  documentos —ni package.json— así que no había aplicación que construir.
  Ruling: se fusiona a main ANTES de la revisión final de rama, invirtiendo el
  orden del proceso. El partner tenía un deploy roto y eso pesa más que el orden;
  las 10 tareas ya están revisadas individualmente y lo que falta es la lectura
  del conjunto, que se corre igual a continuación. Costo si es incorrecto: si la
  revisión final encuentra algo, se arregla sobre main en vez de antes de
  fusionar.
  El push inicial fue RECHAZADO: el partner ya había mergeado el PR #1 en GitHub.
  No se forzó nada; se integró su merge con el local (651b85e) y se verificó
  83/83 y next build antes de empujar.

Revisión final de rama (opus): 1 CRÍTICO (clave de acceso de 3 caracteres en
  .env.local, sin límite de intentos, con el sitio en producción — se roté la
  local y se elevó a decisión del partner la de Vercel), 3 importantes y varios
  menores. Confirmó que la mitad estructural del hito es correcta: autoridad del
  servidor, CAS contra Upstash real, frontera de seguridad que falla cerrada,
  historial SAN como verdad. El defecto que solo aparece mirando el conjunto:
  shouldPoll y el camino de error de mover son correctos por separado e
  incompatibles juntos, y un /move fallido congela el tablero para siempre.

Ola de arreglos: 8 hallazgos, 8 commits incrementales (651b85e..660e67f).
  91 tests con credenciales, lint, tsc, next build y e2e 5/5 limpios.
  El primer agente se colgó tras medir la línea base sin cambiar nada; se
  relanzó con los hallazgos en archivo y commits incrementales por severidad.
  Empujado a producción antes de la re-revisión: había bugs reales en vivo y los
  arreglos están verificados. La re-revisión corre a continuación.

