import { SCHEMA_VERSION } from '@/core/match-state'
import type { MatchState } from '@/core/match-state'
import type { MatchStore } from './types'

/**
 * Almacén en memoria. Sirve para pruebas y desarrollo local.
 * En Vercel NO sirve: cada invocación puede caer en otra instancia.
 */
export class MemoryStore implements MatchStore {
  private partidas = new Map<string, string>()

  async get(id: string): Promise<MatchState | null> {
    const crudo = this.partidas.get(id)
    if (!crudo) return null
    const estado = JSON.parse(crudo) as MatchState
    // Un registro de un esquema distinto (falta el campo, o no es el
    // esperado) no es de fiar: se trata como si no existiera en vez de
    // arriesgarse a corromper una partida viva con campos `undefined`.
    // Ver el comentario de SCHEMA_VERSION en @/core/match-state.
    return estado.schema === SCHEMA_VERSION ? estado : null
  }

  async put(state: MatchState): Promise<void> {
    // Se serializa al guardar para imitar a Redis: quien lea recibe una
    // copia y no puede mutar el estado guardado por accidente.
    this.partidas.set(state.id, JSON.stringify(state))
  }

  async putIfVersion(state: MatchState, expectedVersion: number): Promise<boolean> {
    // Sin ningún `await` entre leer la versión actual y escribir: en un
    // solo hilo de JS eso alcanza para que sea atómico. Se lee el mapa
    // directamente (no this.get()) para no depender de otra función que
    // algún día podría volverse asíncrona de verdad.
    const crudo = this.partidas.get(state.id)
    const actual = crudo ? (JSON.parse(crudo) as MatchState).version : undefined
    if (actual !== expectedVersion) return false
    this.partidas.set(state.id, JSON.stringify(state))
    return true
  }
}
