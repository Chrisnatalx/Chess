import { test, expect } from '@playwright/test'
import { arrastrar, crearPartidaComoBlancas, entrarConClave, unirseComoNegras } from './support'

test('un arrastre ilegal se rechaza en el cliente y no llega a /move', async ({ browser }) => {
  const ctxBlancas = await browser.newContext()
  const ctxNegras = await browser.newContext()
  const blancas = await ctxBlancas.newPage()
  const negras = await ctxNegras.newPage()

  try {
    const url = await crearPartidaComoBlancas(blancas)
    await entrarConClave(negras, url)
    await unirseComoNegras(negras)
    await expect(blancas.getByText('Te toca.')).toBeVisible()

    const peticionesMove: string[] = []
    await blancas.route('**/api/match/*/move', (route) => {
      peticionesMove.push(route.request().url())
      return route.continue()
    })

    // a2-a5: un peón no se mueve tres casillas. La validación optimista del
    // cliente (Board.tsx, con applyMove) tiene que rechazarlo antes de que
    // onMove/apiMove exista siquiera. Se usa `arrastrar` (mouse manual, no
    // `locator.dragTo()`) para que el drag realmente se active y esta
    // prueba compruebe el rechazo por ilegalidad, no una casualidad de que
    // la pieza nunca se levantó.
    await arrastrar(blancas, 'a2', 'a5')

    // No hay ningún evento de red que esperar (esa es la esencia de la
    // afirmación: nunca ocurre), así que se le da una ventana explícita a
    // una petición fantasma para llegar, en vez de comprobar en el instante.
    await blancas.waitForTimeout(500)

    expect(peticionesMove).toHaveLength(0)
    // El turno no cambió: seguimos viendo "Te toca." para blancas.
    await expect(blancas.getByText('Te toca.')).toBeVisible()
  } finally {
    await ctxBlancas.close()
    await ctxNegras.close()
  }
})
