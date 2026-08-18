import { describe, it, expect } from 'vitest'
import { shouldPoll, pollInterval } from './useMatch'

describe('shouldPoll', () => {
  it('consulta si la partida espera rival', () => {
    expect(shouldPoll({ status: 'waiting', esMiTurno: false, visible: true })).toBe(true)
  })

  it('consulta mientras es el turno del rival', () => {
    expect(shouldPoll({ status: 'active', esMiTurno: false, visible: true })).toBe(true)
  })

  it('no consulta si es mi turno: nada puede cambiar sin que yo mueva', () => {
    expect(shouldPoll({ status: 'active', esMiTurno: true, visible: true })).toBe(false)
  })

  it('no consulta si la partida terminó', () => {
    expect(shouldPoll({ status: 'finished', esMiTurno: false, visible: true })).toBe(false)
  })

  it('no consulta si la pestaña no está visible', () => {
    expect(shouldPoll({ status: 'active', esMiTurno: false, visible: false })).toBe(false)
  })
})

describe('pollInterval', () => {
  it('consulta cada 4 segundos al principio', () => {
    expect(pollInterval(0)).toBe(4000)
    expect(pollInterval(60_000)).toBe(4000)
  })

  it('se relaja a 15 segundos tras 2 minutos sin cambios', () => {
    expect(pollInterval(120_001)).toBe(15_000)
    expect(pollInterval(600_000)).toBe(15_000)
  })
})
