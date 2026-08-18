import { test, expect } from '@playwright/test'
import { arrastrar, crearPartidaComoBlancas, entrarConClave, unirseComoNegras } from './support'

test('un espectador ve el tablero pero no puede unirse ni mover una vez que el asiento de negras está tomado', async ({ browser }) => {
  const ctxBlancas = await browser.newContext()
  const ctxNegras = await browser.newContext()
  const ctxEspectador = await browser.newContext()
  const blancas = await ctxBlancas.newPage()
  const negras = await ctxNegras.newPage()
  const espectador = await ctxEspectador.newPage()

  try {
    const url = await crearPartidaComoBlancas(blancas)
    await entrarConClave(negras, url)
    await unirseComoNegras(negras)
    // Confirma que la partida ya está activa (negras ocupó el asiento)
    // antes de que el espectador entre, para no dejar una carrera abierta.
    await expect(negras.getByText('Turno del rival…')).toBeVisible()

    await entrarConClave(espectador, url)

    // Ve el tablero (una casilla real, con su pieza inicial).
    await expect(espectador.locator('[data-square="e1"]')).toBeVisible()

    // No se le ofrece el asiento de negras: ya está tomado.
    await expect(
      espectador.getByRole('button', { name: 'Unirme como negras' }),
    ).toHaveCount(0)
    await expect(espectador.getByText('Estás mirando como espectador.')).toBeVisible()

    // No puede mover: el tablero le tiene el arrastre deshabilitado, así que
    // ni siquiera debería llegar a intentar la jugada contra el servidor.
    const peticionesMove: string[] = []
    await espectador.route('**/api/match/*/move', (route) => {
      peticionesMove.push(route.request().url())
      return route.continue()
    })
    await arrastrar(espectador, 'e2', 'e4')
    await espectador.waitForTimeout(500)
    expect(peticionesMove).toHaveLength(0)
  } finally {
    await ctxBlancas.close()
    await ctxNegras.close()
    await ctxEspectador.close()
  }
})
