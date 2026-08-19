# Hito 2 — Acciones de partida y tablero dual 2D/3D — Diseño

Fecha: 2026-08-18
Hito anterior: `2026-08-18-chess-llm-design.md` (hito 1, en producción)

## 1. Qué es

Dos partes independientes que juntas forman un hito del tamaño del anterior:

**A. Acciones de partida.** Rendirse y acordar tablas. Hoy una partida solo
termina por las reglas del ajedrez: mate, ahogado, repetición, 50 jugadas o
material insuficiente. No hay forma de terminarla por voluntad de los
jugadores, así que una partida perdida se abandona dejando el tablero colgado.

**B. Tablero dual 2D/3D.** Un tablero tridimensional como vista por defecto,
con el tablero 2D actual disponible a un click y como repliegue automático
cuando el dispositivo no soporta WebGL.

Las dos partes comparten únicamente la página de partida. No hay acoplamiento
entre ellas.

## 2. Objetivos

- Que un jugador pueda rendirse y que la partida quede correctamente resuelta.
- Que dos jugadores puedan acordar tablas, con una negociación que no deje
  estados colgados.
- Que el juego se vea en 3D por defecto, sin dejar afuera a nadie cuyo
  dispositivo no lo soporte.
- Que la elección de tablero se recuerde entre visitas.
- Que las cinco pruebas end-to-end existentes sigan valiendo sin reescribirse.

## 3. No objetivos

- No hay reloj de partida, ni por lo tanto derrota por tiempo.
- No hay historial de partidas.
- No hay elección de pieza al coronar: se sigue coronando a dama
  automáticamente, en ambos tableros.
- No se pulen las piezas 3D más allá de lo que produjo la prueba de concepto.
  Es trabajo posterior y explícitamente aceptado como tal.
- No se agrega límite de intentos a la clave de acceso. Sigue pendiente y
  documentado en `2026-08-18-hito1-pendientes.md`.

## 4. Decisiones tomadas

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Alcance de acciones | Rendirse y ofrecer tablas | "Abandonar" se descartó: si te vas, te rendís. Es lo que hacen Lichess y Chess.com. |
| Vigencia de la oferta | Caduca cuando se aplica cualquier jugada | Convención estándar del ajedrez. Nada queda colgado y no hace falta limpieza por tiempo. |
| Transporte de las acciones | Un endpoint `POST /api/match/:id/action` | Hereda las mismas guardas de `ply` y de versión que ya protegen los movimientos. |
| Tablero por defecto | 3D | Es lo que distingue al juego. El repliegue a 2D cubre a quien no pueda verlo. |
| Carga del 3D | Importación dinámica | Three.js pesa; quien juegue en 2D no debe pagarlo. |
| Piezas 3D | Generadas por código | La prueba de concepto confirmó que funcionan, caballo incluido. Sin activos ni licencias. |
| Base de las pruebas e2e | El tablero 2D | Un lienzo WebGL no tiene DOM por casilla. Manteniendo el 2D, las cinco pruebas siguen valiendo. |

### Decisiones descartadas y por qué

- **Solo 3D.** Habría obligado a reescribir las cinco pruebas end-to-end contra
  coordenadas de píxeles, mucho más frágiles que los atributos `data-square`, y
  habría dejado sin jugar a cualquiera con WebGL desactivado.
- **Solo 2D pulido.** Era la opción más barata y se evaluó en serio, pero el
  dueño del proyecto quiere 3D y la prueba de concepto mostró que es viable.
- **Una acción "abandonar" distinta de rendirse.** Añadía un tercer estado
  terminal sin un caso de uso que lo justifique.
- **Caducidad de la oferta de tablas por tiempo.** Necesitaría relojes y
  limpieza de estado vencido, y en una partida sin reloj el tiempo no significa
  nada.

## 5. Parte A — Acciones de partida

### 5.1 Modelo de datos

`MatchState` gana un campo:

```typescript
/** Color que tiene una oferta de tablas pendiente, o null si no hay ninguna. */
drawOffer: Color | null
```

`SCHEMA_VERSION` sube a `2`. Las partidas guardadas con esquema 1 dejan de
leerse: `get()` devuelve `null` y el jugador ve "Esta partida ya no existe".
Eso es deliberado y es exactamente para lo que se agregó el campo `schema` en
el hito 1 — una partida vieja deserializada sin `drawOffer` llegaría a
comparaciones que esperan un color o `null`, y rompería una partida en curso en
vez de fallar limpio.

`reason` gana dos valores posibles: `'resignation'` y `'agreement'`.

### 5.2 El endpoint

`POST /api/match/:id/action`, con la clave de acceso como todas las demás.

```typescript
type ActionRequest = {
  token: string
  ply: number
  action: 'resign' | 'offer_draw' | 'accept_draw' | 'decline_draw'
}
```

El `ply` cumple el mismo papel que en un movimiento: si no coincide con el
estado guardado, la acción se rechaza sin aplicar. Sin eso, aceptar unas tablas
ofrecidas hace tres jugadas aceptaría una oferta que ya caducó.

La escritura usa `putIfVersion`, igual que `submitMove`, y devuelve `conflict`
cuando otro escritor gana la carrera.

### 5.3 Reglas

| Acción | Precondiciones | Efecto |
| --- | --- | --- |
| `resign` | Partida activa; el token corresponde a un jugador | `status: 'finished'`, `result` a favor del rival, `reason: 'resignation'` |
| `offer_draw` | Activa; no hay oferta del propio color pendiente | `drawOffer` = color propio |
| `accept_draw` | Activa; `drawOffer` es el color **contrario** | `status: 'finished'`, `result: '1/2-1/2'`, `reason: 'agreement'` |
| `decline_draw` | Activa; `drawOffer` es el color **contrario** | `drawOffer: null` |

Invariantes que las pruebas deben fijar:

- **Nadie puede aceptar su propia oferta.** `accept_draw` exige que la oferta
  sea del color contrario, no simplemente que exista.
- **Cualquier jugada aplicada borra la oferta.** `submitMove` pone
  `drawOffer: null` al aplicar. Si el rival mueve en vez de responder, la
  oferta queda rechazada implícitamente.
- **No se puede actuar sobre una partida terminada ni en espera.** Igual que
  con los movimientos, `status !== 'active'` devuelve `not_active`.
- **Rendirse no depende del turno.** Podés rendirte cuando le toca al rival.
- **Ofrecer tablas tampoco depende del turno**, pero una segunda oferta del
  mismo color mientras la primera sigue pendiente se rechaza como
  `already_offered`, para que el botón no sirva de mecanismo de hostigamiento.
- **No se puede retirar la propia oferta.** `decline_draw` exige que la oferta
  sea del color contrario, así que quien ofreció solo puede esperar a que el
  rival responda o mueva. Es deliberado: retirar una oferta justo cuando el
  rival la acepta abre una carrera cuyo único desenlace correcto es discutible,
  y el costo de no tenerlo es que una oferta arrepentida sobrevive, como mucho,
  hasta la siguiente jugada.

### 5.4 Errores

Se reutiliza el vocabulario existente —`not_found`, `not_active`, `bad_token`,
`stale_ply`, `conflict`— más dos códigos nuevos: `already_offered` y
`no_offer` (aceptar o rechazar cuando no hay oferta del contrario). Ambos mapean
a HTTP 409. Todos se traducen a español en la interfaz, como el resto.

### 5.5 Interfaz

- **Rendirse** pide confirmación. Un click accidental que hace perder una
  partida es imperdonable, y el botón vive al lado del tablero.
- **Ofrecer tablas** no pide confirmación: es reversible, porque el rival puede
  rechazar.
- Cuando hay una oferta contra vos, aparecen **Aceptar** y **Rechazar** con el
  texto de quién la hizo.
- Cuando la tuya está pendiente, el botón muestra "Tablas ofrecidas" y queda
  deshabilitado hasta que se resuelva o caduque.
- Los espectadores no ven ninguno de estos botones.
- El final de partida distingue el motivo: "Ganaste, tu rival se rindió",
  "Tablas acordadas", etc.

## 5.6 Revancha

Cuando una partida termina, cualquiera de los dos puede proponer volver a
jugar. No es una negociación: quien propone ya queda dentro de la partida
nueva, y al rival le aparece un botón para entrar.

**Los colores se invierten.** Jugar siempre con blancas es una ventaja y en una
revancha se nota.

**Los dos jugadores conservan su token.** La partida nueva nace con ambos
asientos ocupados —quien era blancas pasa a negras con el mismo secreto— así
que nadie tiene que volver a unirse y la partida arranca `active`. Esto es lo
que hace que la revancha no tenga fricción: sin links que copiar, sin pantalla
de espera.

**El aviso viaja por donde ya viaja todo lo demás.** La partida terminada guarda
el id de su revancha en un campo nuevo, `rematchId`. El navegador del rival ya
consulta el estado cada 4 segundos, así que el botón le aparece solo.

### Modelo de datos

```typescript
/** Id de la partida creada como revancha de esta, o null si no hay ninguna. */
rematchId: string | null
```

### El endpoint

`POST /api/match/:id/rematch`, con `{ token }` en el cuerpo. A diferencia de las
demás acciones, esta **exige `status: 'finished'`**: una revancha solo existe
cuando la partida terminó. No lleva `ply`, porque una partida terminada ya no
avanza.

Devuelve `{ rematchId }`. El cliente navega ahí.

### Idempotencia

Si los dos jugadores hacen click a la vez, debe crearse **una sola** partida. Se
resuelve con la misma escritura condicional que protege las jugadas:

1. Si la partida ya tiene `rematchId`, se devuelve ese y no se crea nada.
2. Si no, se crea la partida nueva y se escribe su id con `putIfVersion`.
3. Si esa escritura pierde la carrera, se vuelve a leer y se devuelve el
   `rematchId` que ganó — nunca el propio.

El paso 3 es el que importa: sin él, dos clicks simultáneos dejan a los dos
jugadores en tableros distintos, cada uno esperando a un rival que está en otra
partida. La partida huérfana queda sin referencias y expira sola a los 7 días.

### Errores

`not_found`, `bad_token`, y `not_finished` (409) cuando la partida sigue en
curso. Traducidos al español como el resto.

### Interfaz

El botón "Volver a jugar" aparece solo con la partida terminada, y solo a los
jugadores. Cuando la partida ya tiene `rematchId`, el texto cambia a "Entrar a
la revancha" para ambos, porque una vez creada da igual quién la propuso.
Los espectadores no ven ninguno de los dos.

## 6. Parte B — Tablero dual

### 6.1 El contrato compartido

Ambos tableros implementan la misma interfaz y no saben nada del servidor:

```typescript
type BoardProps = {
  fen: string
  history: string[]
  orientation: Color
  puedeMover: boolean
  onMove: (from: string, to: string, promotion?: string) => void
}
```

`Board2D` es el componente actual, renombrado. `Board3D` es nuevo. La página
elige cuál montar y no cambia en nada más.

### 6.2 Selección y repliegue

**Detección de WebGL** al montar. Si el dispositivo no lo soporta, se monta el
2D y se avisa una vez, sin dejar la pantalla en blanco ni ofrecer un botón que
no va a funcionar.

**La preferencia se guarda** en `localStorage`, junto a las credenciales que ya
se guardan ahí. Por defecto 3D.

**El 3D se carga con importación dinámica** y sin renderizado en servidor. Quien
se quede en 2D no descarga Three.js.

### 6.3 Lo que la prueba de concepto ya resolvió

La prueba (rama `spike/tablero-3d`, desechable) confirmó lo siguiente y su
código sirve de referencia, no de base:

- Las piezas se generan por código con superficies de revolución. **El caballo,
  que era el riesgo, salió bien.** No hacen falta modelos ni licencias.
- 60 FPS con cámara orbitable, luces y sombras.
- Click para seleccionar y click para mover, con destinos legales resaltados.

### 6.4 El problema que la prueba descubrió, y cómo se resuelve

Desde el ángulo por defecto, **las piezas altas de la primera fila tapan a los
peones de la segunda**: un click apuntado al suelo de una casilla de la fila 2
impacta en la pieza de la fila 1. Es un problema exclusivo del 3D.

Se resuelve separando el rayo en dos capas:

- Para **seleccionar** una pieza, el rayo va contra las piezas.
- Para **elegir destino**, el rayo va contra un plano invisible a la altura del
  tablero, ignorando la geometría de las piezas.

Con eso, una vez seleccionada la pieza, ninguna otra puede robarle el click al
destino. Es la parte del 3D que hay que hacer con cuidado y la que decide si el
tablero se siente bien o exasperante.

### 6.5 Coronación

El 3D corona a dama automáticamente, igual que el 2D: se intenta la jugada sin
coronación y, si es ilegal, se reintenta con dama. Elegir pieza es trabajo
posterior en ambos tableros.

## 7. Pruebas

**Acciones** (`src/server/match.test.ts`, con `MemoryStore`): cada precondición
de la tabla de §5.3, más los invariantes nombrados ahí — nadie acepta su propia
oferta, una jugada borra la oferta, no se actúa sobre partida terminada,
rendirse no depende del turno, y la segunda oferta del mismo color se rechaza.
Más las dos carreras: dos acciones simultáneas con el mismo `ply`, y una acción
concurrente con un movimiento.

**El endpoint** (`src/app/api/match/routes.test.ts`): cada código de error a su
estado HTTP, y que la respuesta pase por `toPublic` sin filtrar tokens.

**Esquema** (`store/memory.test.ts`, `store/redis.test.ts`): una partida
guardada con `schema: 1` se lee como `null`.

**El contrato del tablero**: una prueba por implementación que verifique que un
arrastre ilegal no llama a `onMove` y que uno legal sí, con la coronación
incluida.

**End-to-end**: las cinco existentes siguen corriendo **en 2D**, forzando esa
preferencia antes de cargar la página. Se agregan dos nuevas: una partida que
termina por rendición, y una que termina por tablas acordadas con las dos
personas. Más una prueba de humo del 3D que confirme que el lienzo monta y
muestra las piezas, sin intentar arrastrar.

**Lo que no se automatiza**: si el tablero 3D se *siente* bien. Eso se juzga
jugando, y ya se juzgó una vez con la prueba de concepto.

## 8. Riesgos conocidos

- **El repliegue por WebGL es difícil de probar automáticamente.** Se cubre con
  una prueba unitaria de la función de detección; que el repliegue real
  funcione se verifica a mano.
- **El rendimiento en celulares viejos no se puede medir acá.** La prueba de
  concepto corrió a 60 FPS en esta máquina; un teléfono de gama baja es otra
  historia. El repliegue manual a 2D es la mitigación.
- **Subir `SCHEMA_VERSION` invalida las partidas en curso** al desplegar. Con
  el uso actual —una POC entre amigos— es aceptable. Conviene desplegarlo
  cuando no haya una partida a medias.

## 9. Referencias

- Prueba de concepto del tablero 3D: rama `spike/tablero-3d`, con
  `HALLAZGOS.md`. Es material de referencia y se descarta al terminar el hito.
- Pendientes heredados del hito 1: `2026-08-18-hito1-pendientes.md`. Dos de
  ellos —la falta de tests del canal de errores del cliente y de la página de
  partida— se cubren naturalmente al reescribir esa página en este hito, y el
  plan debe incluirlos explícitamente en vez de darlos por cubiertos.
