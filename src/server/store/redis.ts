import { Redis } from '@upstash/redis'
import { SCHEMA_VERSION } from '@/core/match-state'
import type { MatchState } from '@/core/match-state'
import type { MatchStore } from './types'

/** Las partidas caducan a los 7 días. Es una POC, no un archivo histórico. */
const TTL_SEGUNDOS = 60 * 60 * 24 * 7

/**
 * Escritura condicional atómica. La versión vive además en su propia clave
 * porque compararla dentro del script sin decodificar JSON es más simple y no
 * depende de que el entorno Lua tenga cjson disponible.
 *
 * GET devuelve false cuando la clave no existe, y false nunca es igual a la
 * versión esperada, así que una partida inexistente cae en conflicto — que es
 * la respuesta correcta: no se puede sobrescribir lo que no está.
 */
const CAS = `
if redis.call('GET', KEYS[2]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
  return 1
end
return 0
`

/**
 * Escritura incondicional, pero de las dos claves en un solo EVAL para que
 * sea atómica. `put()` corre una sola vez en el flujo real (createMatch); sin
 * esto, dos SET independientes dejan una ventana donde puede existir la
 * clave de estado sin su clave hermana de versión si el proceso muere entre
 * medio — y entonces putIfVersion() rechaza para siempre porque compara
 * contra una versión que no está, dejando la partida jugable-nunca-más sin
 * ningún diagnóstico visible.
 */
const PUT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1
`

export class RedisStore implements MatchStore {
  /**
   * Seam mínimo para pruebas: se puede inyectar un cliente falso. Cuando no
   * se inyecta nada, `Redis.fromEnv()` recién se evalúa acá (los valores por
   * default de un parámetro solo se evalúan si no llega argumento), así que
   * nunca explota por falta de credenciales cuando sí hay cliente inyectado.
   */
  constructor(private redis: Redis = Redis.fromEnv()) {}

  private clave(id: string) {
    return `match:${id}`
  }

  /** Clave hermana que guarda solo la versión, para poder compararla en Lua. */
  private claveVersion(id: string) {
    return `match:${id}:v`
  }

  async get(id: string): Promise<MatchState | null> {
    // El cliente de Upstash deserializa JSON automáticamente al leer.
    const valor = await this.redis.get<MatchState>(this.clave(id))
    if (!valor) return null
    // Un registro de un esquema distinto (falta el campo, o no es el
    // esperado) no es de fiar: se trata como si no existiera en vez de
    // arriesgarse a corromper una partida viva con campos `undefined`.
    // Ver el comentario de SCHEMA_VERSION en @/core/match-state.
    return valor.schema === SCHEMA_VERSION ? valor : null
  }

  async put(state: MatchState): Promise<void> {
    // Un solo EVAL para las dos claves: ver el comentario de PUT arriba.
    // Se guarda el JSON como cadena explícita para que coincida byte a byte
    // con lo que escribe putIfVersion, que solo maneja cadenas.
    await this.redis.eval<string[], number>(
      PUT,
      [this.clave(state.id), this.claveVersion(state.id)],
      [JSON.stringify(state), String(state.version), String(TTL_SEGUNDOS)],
    )
  }

  async putIfVersion(state: MatchState, expectedVersion: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(
      CAS,
      [this.clave(state.id), this.claveVersion(state.id)],
      [
        String(expectedVersion),
        JSON.stringify(state),
        String(state.version),
        String(TTL_SEGUNDOS),
      ],
    )
    return r === 1
  }
}
