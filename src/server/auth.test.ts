import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkAccess } from './auth'

const original = process.env.ACCESS_KEY

beforeEach(() => { process.env.ACCESS_KEY = 'secreta' })
afterEach(() => { process.env.ACCESS_KEY = original })

function pedido(clave?: string): Request {
  return new Request('http://x/api/match', {
    headers: clave === undefined ? {} : { 'x-access-key': clave },
  })
}

describe('checkAccess', () => {
  it('acepta la clave correcta', () => {
    expect(checkAccess(pedido('secreta'))).toBe(true)
  })

  it('rechaza una clave equivocada', () => {
    expect(checkAccess(pedido('otra'))).toBe(false)
  })

  it('rechaza si no viene la cabecera', () => {
    expect(checkAccess(pedido())).toBe(false)
  })

  it('rechaza todo si ACCESS_KEY no está configurada', () => {
    delete process.env.ACCESS_KEY
    expect(checkAccess(pedido('lo-que-sea'))).toBe(false)
  })
})
