import { test, expect } from '@playwright/test'
import { entrarConClave } from './support'

test('una clave de acceso incorrecta muestra un mensaje amigable, no una página vacía ni un error crudo', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Clave de acceso').fill('clave-que-no-es')
  await page.getByRole('button', { name: 'Crear partida' }).click()

  await expect(page.getByText('Clave incorrecta.')).toBeVisible()
  await expect(page.getByText(/^Error:/)).toHaveCount(0)
})

test('una partida inexistente muestra un mensaje amigable en vez del código de error crudo', async ({ page }) => {
  // UUID con la forma correcta (pasa isValidMatchId) pero que nunca se creó.
  const idInexistente = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

  await entrarConClave(page, `/match/${idInexistente}`)

  await expect(page.getByText('No encontramos esa partida. Revisá el link.')).toBeVisible()
  await expect(page.getByText('Error: not_found')).toHaveCount(0)
})
