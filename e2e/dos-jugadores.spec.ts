import { test, expect, type Page } from '@playwright/test'
import { arrastrar, crearPartidaComoBlancas, entrarConClave, unirseComoNegras } from './support'

test('dos personas juegan el mate del loco desde dispositivos distintos', async ({ browser }) => {
  const ctxBlancas = await browser.newContext()
  const ctxNegras = await browser.newContext()
  const blancas = await ctxBlancas.newPage()
  const negras = await ctxNegras.newPage()

  try {
    // Blancas crean la partida desde la pantalla de inicio.
    const url = await crearPartidaComoBlancas(blancas)

    // Negras entran por el link, ponen la clave y se unen como negras.
    await entrarConClave(negras, url)
    await unirseComoNegras(negras)

    // Con las negras unidas la partida pasa a activa y le toca a blancas.
    // Blancas se entera por su próximo sondeo (cada 4s), no al instante.
    await expect(blancas.getByText('Te toca.')).toBeVisible()

    // Mate del loco, arrastrando pieza a pieza.
    const jugadas: Array<[Page, string, string]> = [
      [blancas, 'f2', 'f3'],
      [negras, 'e7', 'e5'],
      [blancas, 'g2', 'g4'],
      [negras, 'd8', 'h4'],
    ]

    for (const [pagina, desde, hasta] of jugadas) {
      await expect(pagina.getByText('Te toca.')).toBeVisible()
      await arrastrar(pagina, desde, hasta)
    }

    await expect(blancas.getByText(/Partida terminada: 0-1/)).toBeVisible()
    await expect(negras.getByText(/Partida terminada: 0-1/)).toBeVisible()
  } finally {
    await ctxBlancas.close()
    await ctxNegras.close()
  }
})
