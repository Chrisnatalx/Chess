import { expect, type Page } from '@playwright/test'

// Clave de acceso exclusiva de esta corrida de e2e: no tiene relación con el
// ACCESS_KEY real de `.env.local`. `playwright.config.ts` importa esta
// misma constante para configurar el server de prueba, así que sólo hay un
// lugar donde puede desincronizarse de lo que usan los tests.
export const CLAVE_E2E = 'e2e-test-key'

/**
 * Crea una partida desde la pantalla de inicio, como blancas, y devuelve la
 * URL de la partida (para que otro contexto/página la use para unirse).
 */
export async function crearPartidaComoBlancas(page: Page, clave = CLAVE_E2E): Promise<string> {
  await page.goto('/')
  await page.getByLabel('Clave de acceso').fill(clave)
  await page.getByRole('button', { name: 'Crear partida' }).click()
  await expect(page).toHaveURL(/\/match\/.+/)
  return page.url()
}

/**
 * Entra a la URL de una partida con un contexto nuevo (sin credenciales en
 * localStorage): eso siempre dispara el 403 inicial y muestra el formulario
 * de "Ingresá la clave de acceso", que se completa acá.
 */
export async function entrarConClave(page: Page, url: string, clave = CLAVE_E2E): Promise<void> {
  await page.goto(url)
  await page.locator('input[type=password]').fill(clave)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

/** Ocupa el asiento de negras. Asume que ya se entró con la clave correcta. */
export async function unirseComoNegras(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Unirme como negras' }).click()
}

/**
 * Arrastra una pieza de una casilla a otra con eventos de mouse manuales.
 *
 * No se usa `locator.dragTo()`: comprobado a mano (con un server real, no
 * es una suposición) que ese helper de Playwright mueve el mouse en un solo
 * salto y react-chessboard 5.x usa @dnd-kit para el arrastre, cuyo sensor de
 * puntero necesita varios eventos `pointermove` intermedios para activar el
 * drag. Con `dragTo()` la pieza nunca se levanta y no sale ninguna petición
 * a `/move`; con varios `mouse.move()` intermedios antes de soltar, sí.
 */
export async function arrastrar(page: Page, desde: string, hasta: string): Promise<void> {
  const origen = await page.locator(`[data-square="${desde}"]`).boundingBox()
  const destino = await page.locator(`[data-square="${hasta}"]`).boundingBox()
  if (!origen || !destino) {
    throw new Error(`No se encontró la casilla ${desde} o ${hasta} en el tablero`)
  }
  const centro = (caja: { x: number; y: number; width: number; height: number }) => (
    { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 }
  )
  const src = centro(origen)
  const dst = centro(destino)

  await page.mouse.move(src.x, src.y)
  await page.mouse.down()
  const pasos = 8
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(
      src.x + (dst.x - src.x) * (i / pasos),
      src.y + (dst.y - src.y) * (i / pasos),
    )
  }
  await page.mouse.up()
}
