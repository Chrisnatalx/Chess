# Ajedrez web con LLMs — Diseño

Fecha: 2026-08-18

## 1. Qué es

Un juego de ajedrez web con tres formas de jugar, construidas sobre un mismo núcleo:

- Dos personas, cada una desde su dispositivo, unidas por un link de invitación.
- Una persona contra un LLM, en dos variantes seleccionables por el usuario:
  - **Rival LLM**: el modelo elige las jugadas.
  - **Motor + tutor**: un motor de ajedrez elige las jugadas y el LLM cumple el papel educativo.
- Dos modelos enfrentados entre sí, elegidos desde un selector, con espectadores mirando.

El propósito es aprender ajedrez jugando, y observar cómo juegan distintos modelos.

## 2. Objetivos

- Que el usuario pueda jugar partidas completas y legales contra un LLM y contra un motor.
- Que reciba ayuda cuando la pide, no cuando el sistema decide dársela.
- Que al terminar entienda dónde se le fue la partida.
- Que se pueda enfrentar dos modelos y comparar cómo juegan.
- Que corra desplegado en internet con una URL compartible, dentro de los planes gratuitos.

## 3. No objetivos

- No hay registro público ni cuentas de usuario.
- No hay ranking, historial persistente de partidas ni perfiles.
- No hay reloj de partida.
- No se expone un servidor MCP para agentes externos (se evaluó y se descartó).
- No hay comentario automático jugada por jugada: el tutor habla cuando se lo pide o al final.

## 4. Decisiones tomadas

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Papel del LLM | Híbrido seleccionable | El usuario elige rival LLM o motor+tutor. Obliga a que motor y LLM sean piezas intercambiables desde el inicio. |
| Capa educativa | Pistas a pedido + resumen post-partida | Sin interrupciones durante el juego. Menos llamadas, menos ruido, menos costo. |
| Autoridad de la partida | Servidor | Hay dos personas y hay espectadores: el estado no puede vivir en un navegador. |
| Validación en el cliente | Sí, optimista | El tablero responde al instante. Es la misma librería de los dos lados, así que cuesta poco. |
| Stack | Next.js + TypeScript | Front y back en un proyecto, deploy directo en Vercel. |
| Hosting | Vercel Hobby | Sin arranques en frío. El estado va a Redis, que es lo que Vercel no da. |
| Estado | Upstash Redis | Free tier: 256 MB y 500.000 comandos al mes. Una partida son unos pocos KB. |
| Sincronización | Consulta periódica cada 4 s | El ajedrez es por turnos y lento. Evita conexiones largas y el límite de 60 s de Vercel. |
| Motor de ajedrez | Stockfish WASM en el navegador | No consume CPU del servidor ni cuesta dinero por partida. |
| Reglas | `chess.js` | En cliente y servidor. |
| Acceso al LLM | Vercel AI SDK | Cambiar de modelo es cambiar una configuración. |
| Proveedor inicial | MiniMax vía `@ai-sdk/openai-compatible` | Es la API key que hay hoy. Sumar Anthropic u OpenAI después es agregar un adaptador. |
| Control de acceso | Clave compartida en variable de entorno | Cada jugada del LLM la paga el dueño del sitio. |

### Decisiones descartadas y por qué

- **Servidor MCP para agentes externos.** La idea original era que dos LLMs se conectaran por MCP y jugaran solos. Se descartó a favor de un selector de modelos en la UI con el backend orquestando ambos lados: más simple, más controlable, y permite pasarle a cada modelo la lista de movimientos legales en cada turno. La abstracción `Player` deja la puerta abierta a agregar MCP más adelante sin tocar el núcleo.
- **Render en vez de Vercel.** Render tiene free tier con proceso vivo, lo que evitaría Redis. Se descartó por el arranque en frío de hasta un minuto tras 15 minutos sin tráfico, inaceptable para compartir un link y mostrar el juego.
- **Conexión persistente (SSE) para avisar movimientos.** Innecesaria: el ajedrez tolera de sobra una consulta cada 4 segundos, y evitarla elimina el problema del límite de duración de las funciones de Vercel.
- **Comentario automático en cada jugada.** Descartado por decisión de producto: genera ruido y multiplica el costo de API.

## 5. Arquitectura

### 5.1 La pieza central: `Player`

Una interfaz con un solo método: *dada una posición, entregá un movimiento*. El árbitro no distingue entre implementaciones. Cualquier modo de juego es un par `(Player, Player)`.

| Implementación | Dónde corre | Cómo entrega el movimiento |
| --- | --- | --- |
| `HumanPlayer` | Navegador | El usuario hace clic; el cliente lo envía al servidor |
| `EnginePlayer` (Stockfish) | Navegador, en un Web Worker | El cliente calcula y lo envía como cualquier otro movimiento |
| `LlmPlayer` | Servidor | El servidor llama al modelo por el AI SDK |
| `ScriptedPlayer` | Solo en pruebas | Devuelve jugadas de una lista preescrita |

Consecuencia: el servidor ve dos clases de jugador. Los **remotos**, que envían su movimiento por la API (humano y motor), y los **locales al servidor**, que el servidor consulta directamente (LLM). Esa es la única distinción que necesita hacer.

### 5.2 Módulos

**Compartidos (cliente y servidor)**

- `core/game` — envoltorio delgado sobre `chess.js`: posición, movimientos legales, jaque mate, tablas. Puro, sin entrada/salida.
- `core/player` — la interfaz `Player` y los tipos de movimiento y posición.

**Servidor**

- `match` — el árbitro. Carga la partida, valida el movimiento, lo aplica, guarda, y si el siguiente jugador es local al servidor, le pide su jugada.
- `llm` — adaptadores del AI SDK, registro de modelos disponibles, construcción del pedido y validación de la respuesta.
- `store` — persistencia de partidas detrás de una interfaz. Primera implementación: Upstash Redis. Un doble en memoria sirve para las pruebas.
- `api` — rutas de Next.js.

**Cliente**

- `board` — el tablero y la validación optimista.
- `engine` — Stockfish WASM en un Web Worker: juega y evalúa posiciones.
- `tutor` — el botón de pista y el resumen post-partida.

### 5.3 Rutas de la API

| Ruta | Qué hace |
| --- | --- |
| `POST /api/match` | Crea una partida con dos jugadores configurados. Devuelve el id y el link de invitación. |
| `POST /api/match/:id/join` | Une al segundo jugador y le asigna color. |
| `GET /api/match/:id` | Devuelve el estado completo. Lo usan jugadores en espera y espectadores. |
| `POST /api/match/:id/move` | Recibe un movimiento de un jugador remoto. Valida, aplica y, si corresponde, pide la jugada del LLM en la misma respuesta. |
| `POST /api/match/:id/step` | Avanza una jugada en una partida entre dos modelos. |
| `POST /api/hint` | Devuelve una orientación redactada por el LLM a partir de la posición y el análisis del motor. |
| `POST /api/review` | Devuelve el resumen post-partida, en streaming. |

Todas exigen la clave de acceso.

## 6. Flujos

**Movimiento de un jugador remoto.** El cliente valida con su `chess.js` y pinta la jugada al instante, luego la envía. El servidor carga la partida de Redis, la valida de nuevo, la aplica y guarda. Si el cliente estaba desincronizado, el servidor devuelve el estado real y el tablero se corrige. El servidor siempre devuelve el estado completo, nunca un delta.

**Turno del LLM.** Ocurre dentro de la misma petición que el movimiento del humano. El servidor calcula los movimientos legales, arma el pedido —posición actual, historial de la partida, color que juega, y la lista literal de jugadas legales—, llama al modelo, verifica que lo devuelto esté en la lista, lo aplica y devuelve ambas jugadas juntas. Una sola ida y vuelta para el usuario.

**Turno del motor.** Stockfish corre en el navegador. El cliente calcula la respuesta y la envía por `POST /move` como cualquier otro movimiento. El servidor la valida igual.

**Espera del otro jugador.** El cliente consulta `GET /api/match/:id` cada 4 segundos. La consulta se detiene cuando la pestaña no está visible (Page Visibility API) y se relaja a 15 segundos tras un período sin cambios.

**Pista a pedido.** Stockfish evalúa la posición y produce la mejor línea. Eso viaja al servidor con la posición, y el LLM redacta una orientación. El pedido incluye una instrucción explícita: explicar la idea sin nombrar la jugada. Sin esa restricción el modelo canta la jugada y anula el ejercicio.

**Resumen post-partida.** El navegador evalúa todas las posiciones de la partida con Stockfish a profundidad baja y detecta dónde saltó la evaluación. Envía los 5 saltos mayores al servidor con su contexto —posición, jugada hecha, mejor jugada, diferencia de evaluación— y el LLM redacta el informe, que llega en streaming. El motor encuentra los momentos; el LLM los explica.

**Modelo contra modelo.** La partida avanza de a un paso: el cliente que la creó llama a `POST /step`, el servidor consulta al modelo que corresponde, aplica y responde. El cliente repite. Ninguna función se acerca al límite de 60 segundos y hay control natural de pausa y velocidad. Los espectadores solo consultan el estado; no disparan jugadas.

Consecuencia aceptada: la partida avanza porque el navegador que la creó la empuja. Si esa pestaña se cierra, la partida queda congelada en Redis. Se prefiere eso a un proceso de fondo consumiendo crédito de API sin supervisión.

## 7. Manejo de errores

**Jugada ilegal o inventada por el modelo.** Se valida contra la lista de legales antes de aplicar nada. Si no está, se reintenta indicándole al modelo que la jugada no es legal y repitiendo la lista, hasta 2 reintentos. Tras el tercer fallo:

- En modo rival LLM: se juega una jugada legal al azar y la interfaz avisa que el modelo no supo elegir.
- En modelo contra modelo: derrota por incapacidad.

El contador de intentos ilegales por modelo se guarda y se muestra. Es una métrica de interés, no solo un error.

**Respuesta con formato equivocado.** Se pide salida estructurada al AI SDK. Si el proveedor no la soporta de forma fiable, se extrae la jugada del texto como respaldo. Nunca se aplica nada que no coincida exactamente con una jugada de la lista legal.

**Fallo del proveedor.** Un reintento con espera; si vuelve a fallar, error visible al usuario. La partida queda intacta en Redis y se puede reintentar la misma jugada.

**Petición repetida o doble clic.** Cada movimiento viaja con el número de jugada al que corresponde. Si no coincide con el estado guardado, se rechaza sin aplicar.

**Límite de 60 segundos de Vercel.** Solo lo roza el resumen post-partida, que se envía en streaming y se acota a 5 momentos clave.

**Partidas interminables.** `chess.js` detecta tablas por repetición y por la regla de 50 jugadas. Además, tope de 100 jugadas por bando; alcanzado el tope, tablas.

**Clave de API ausente o inválida.** Se verifica al crear la partida, no en el primer movimiento, para que el error aparezca antes de que el usuario invierta tiempo.

## 8. Seguridad y costos

- Las claves de API viven solo en el servidor. El navegador nunca las ve.
- El acceso al sitio requiere una clave compartida, configurada por variable de entorno.
- Cada jugada del LLM es una llamada a la API. Una partida de 40 jugadas son 40 llamadas por modelo. Los pedidos son cortos —posición, historial y unas 35 jugadas legales—, así que el costo por llamada es bajo.
- El tope de 100 jugadas por bando acota el gasto máximo de cualquier partida.

## 9. Pruebas

El `ScriptedPlayer` permite correr partidas completas sin gastar API y sin esperar a Stockfish.

- **Reglas** (`core/game`): pruebas unitarias puras. Mates conocidos, enroque corto y largo, captura al paso, coronación, tablas por repetición y por 50 jugadas.
- **Adaptador del LLM**: pruebas con respuestas simuladas, centradas en los casos malos — jugada ilegal, prosa en vez de jugada, respuesta ilegible, respuesta vacía, timeout. Sin llamar a ningún proveedor real.
- **Árbitro**: partidas completas entre dos `ScriptedPlayer`, verificando validación, aplicación y guardado, y el rechazo de movimientos con número de jugada equivocado.
- **Almacenamiento**: pruebas contra el doble en memoria, más una prueba de integración contra un Redis real.
- **De punta a punta**: una partida jugada desde el navegador contra un `ScriptedPlayer`, comprobando que el tablero refleja el estado del servidor. Una segunda prueba con dos clientes verificando la sincronización.

No se puede automatizar la calidad de juego de cada modelo ni la utilidad de las explicaciones del tutor. Eso se evalúa jugando, a mano.

## 10. Hitos

**Hito 1 — Dos personas, dos dispositivos.** Tablero, creación de partida, link de invitación, servidor árbitro, Redis, consulta cada 4 s, clave de acceso, deploy en Vercel. Al terminar: dos personas pueden jugar una partida completa desde el link.

**Hito 2 — Rival LLM.** `LlmPlayer`, AI SDK con MiniMax, selector de modelo, validación y reintentos, contador de jugadas ilegales.

**Hito 3 — Motor y tutor.** Stockfish WASM en Web Worker, modo motor+tutor, botón de pista, resumen post-partida.

**Hito 4 — Modelo contra modelo.** Selector doble, bucle de pasos, marcador de resultados, comparación de jugadas ilegales por modelo, vista de espectador.

El hito 1 se eligió primero porque obliga a que la identidad de jugador y la sincronización estén bien resueltas desde el inicio, que es la parte estructural más difícil de remendar después.

## 11. Riesgos conocidos

- **No hay evidencia de qué tan bien juega al ajedrez ningún modelo de MiniMax.** Están posicionados para código y agentes. Puede jugar mal. Para la POC eso es parte de lo que se quiere observar, no un defecto.
- **El free tier de Upstash es el límite más ajustado.** 500.000 comandos al mes dan del orden de 140 partidas mensuales con consulta cada 4 s. Si molesta, subir el intervalo lo estira sin que se note.
- **Los nombres exactos de modelos y las versiones de paquetes se verifican al implementar**, no se toman de memoria.

## 12. Referencias verificadas

- MiniMax expone un endpoint compatible con OpenAI en `https://api.minimax.io/v1` con autenticación Bearer: https://platform.minimax.io/docs/api-reference/text-openai-api
- El AI SDK provee `createOpenAICompatible({ baseURL, name, apiKey })`: https://ai-sdk.dev/providers/openai-compatible-providers/custom-providers
- Límites de las funciones de Vercel (60 s en Hobby): https://vercel.com/docs/functions/limitations
- Free tier de Upstash Redis (256 MB, 500.000 comandos/mes): https://upstash.com/pricing/redis
