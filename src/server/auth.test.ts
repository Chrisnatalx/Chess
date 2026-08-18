import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { checkAccess, isValidMatchId } from './auth'

const original = process.env.ACCESS_KEY

beforeEach(() => { process.env.ACCESS_KEY = 'secreta' })
afterEach(() => {
  if (original === undefined) delete process.env.ACCESS_KEY
  else process.env.ACCESS_KEY = original
})

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

  it('rechaza una clave del mismo largo pero distinta (camino de timingSafeEqual)', () => {
    process.env.ACCESS_KEY = 'secreta'
    expect(checkAccess(pedido('secretx'))).toBe(false)
  })
})

describe('isValidMatchId', () => {
  it('acepta un uuid v4 real', () => {
    expect(isValidMatchId('ec8f1218-b9b8-4231-a095-f62b75c88da4')).toBe(true)
  })

  it('rechaza cadenas arbitrarias', () => {
    expect(isValidMatchId('*')).toBe(false)
    expect(isValidMatchId('match:*')).toBe(false)
    expect(isValidMatchId('abc%0d%0aFLUSHALL')).toBe(false)
    expect(isValidMatchId('')).toBe(false)
    expect(isValidMatchId('../../etc/passwd')).toBe(false)
    expect(isValidMatchId('a'.repeat(2000))).toBe(false)
  })

  it('rechaza un uuid con mayúsculas (randomUUID siempre da minúsculas)', () => {
    expect(isValidMatchId('EC8F1218-B9B8-4231-A095-F62B75C88DA4')).toBe(false)
  })
})
