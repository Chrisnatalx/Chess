# Hito 1 — Pendientes conocidos

Lo que quedó abierto al cerrar el hito, con la decisión que se tomó en cada
caso. El registro completo de las 39 decisiones está en
`2026-08-18-hito1-registro-de-decisiones.md`.

## Requiere acción del dueño del proyecto

**Sin límite de intentos para la clave de acceso.** `checkAccess` compara en
tiempo constante y falla cerrada, pero no cuenta intentos. Con una clave larga
y aleatoria el ataque por fuerza bruta deja de ser viable, y por eso se difirió
el limitador. **Con una clave corta, no.** La clave local se rotó a 48
caracteres; la de Vercel la controla el dueño. Un limitador por IP sobre el
Redis que ya existe son unas 15 líneas, y conviene tenerlo antes de que el
próximo hito ponga gasto de API detrás de esa misma puerta.

## Deuda de pruebas

**El canal de errores del cliente no tiene cobertura automatizada.** La
separación entre `errorSincronizacion` y `errorJugada` se verificó leyendo el
código y con dos navegadores reales, pero ningún test afirma sobre esos valores.
Falta un test de `renderHook`: fallar `mover()`, dejar que la siguiente consulta
tenga éxito, y afirmar que `errorJugada` sigue puesto mientras
`errorSincronizacion` es `null`.

**`src/app/match/[id]/page.tsx` no tiene ningún test.** El try/catch de
`unirse()`, el botón deshabilitado y los mensajes de asiento perdido se
demostraron con tres contextos de navegador pero no están cubiertos. Lo más
barato es extender `e2e/espectador.spec.ts` con dos contextos compitiendo por el
asiento negro.

## Menor de la última revisión

**El color del error al unirse no distingue el tipo de fallo**
(`src/app/match/[id]/page.tsx:169-171`). El texto sí diferencia un problema de
red de un asiento perdido, pero cualquier código que no sea `full` se pinta en
rojo de alarma, incluida una falla de red. Es una línea: usar la misma
comprobación de códigos no culpabilizantes que ya existe en el resto del archivo.

## Diferidos con motivo, sin acción pendiente

- **Rangos con caret en `package.json`.** El lockfile fija las versiones exactas
  y está versionado; el pinning por lockfile es la práctica estándar.
- **Aviso de configLoader de Vitest** en cada corrida. Se intentó renombrar a
  `.mts` y no lo silenció; se revirtió.
- **`catch {}` en `applyMove` descarta el mensaje de chess.js.** Para el árbitro
  "ilegal" es un caso esperado, no un fallo que haya que diagnosticar.
- **`replay()` lanza si el historial llegara corrupto.** Hoy es imposible: solo
  lo produce `applyMove`, y desde el hito 1 el campo `schema` protege además
  contra registros viejos.
- **`withAccess` no pone `cache-control` en un 500 del framework.** El cuerpo de
  esos 500 va vacío, así que no se filtra nada.
- **`ID_VALIDO` acepta cualquier UUID con forma hexadecimal**, no estrictamente
  v4. Suficiente para el motivo: mantener bytes arbitrarios fuera de los nombres
  de claves de Redis.
- **La guarda de visibilidad no aplica antes de la primera carga**, así que un
  hook montado en una pestaña oculta pide una vez. Es deliberado: un primer
  fallo no debe dejar el hook varado.
- **Los tests e2e de espectador y arrastre ilegal se apoyan en dos guardas
  independientes**, así que romper una sola no los hace fallar. No identifican
  qué capa regresionó.
- **`reuseExistingServer: false`** levanta un `next dev` completo por invocación.
  Junto con `workers: 1` explica los ~35 segundos de reloj.
- **Las secuencias de ajedrez de los tests nuevos** se generaron con un script
  de apoyo que no quedó en el repositorio. Las secuencias se verificaron a mano;
  es un problema de reproducibilidad, no de corrección.

## Fuera de alcance por diseño, no son deuda

Sin reloj de partida, sin panel de historial de jugadas, sin revancha, sin
cuentas de usuario. Las partidas expiran a los 7 días y perder el
almacenamiento local pierde el asiento de forma permanente: ambas cosas están
documentadas en el README.
