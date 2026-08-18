import { timingSafeEqual } from 'node:crypto'

export function checkAccess(req: Request): boolean {
  const esperada = process.env.ACCESS_KEY
  // Sin clave configurada el sitio queda cerrado, no abierto.
  // Fallar cerrado evita exponer la API por un despliegue mal configurado.
  if (!esperada) return false

  const recibida = req.headers.get('x-access-key')
  if (recibida === null) return false

  // Comparación en tiempo constante: === corta apenas encuentra la primera
  // diferencia, lo que filtra por temporización cuánto de la clave coincide.
  // timingSafeEqual exige buffers del mismo largo o lanza, así que el largo
  // se compara aparte (esa fuga de longitud es aceptable e inevitable sin
  // hashear antes).
  const a = Buffer.from(esperada)
  const b = Buffer.from(recibida)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function accessDenied(): Response {
  return Response.json({ error: 'forbidden' }, { status: 403 })
}

// El id de partida lo genera siempre `crypto.randomUUID()` (ver defaultDeps
// en @/server/match). Cualquier otra cosa no puede ser una partida real, y
// rechazarla antes de tocar el almacén evita que la Task 6 la mande tal cual
// a una clave de Redis.
const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isValidMatchId(id: string): boolean {
  return ID_VALIDO.test(id)
}

type Handler<Args extends unknown[]> = (req: Request, ...args: Args) => Promise<Response>

/**
 * Envuelve un handler de ruta para que la clave de acceso se valide primero,
 * siempre, y para que toda respuesta (incluido el 403) salga con
 * cache-control: no-store — dos de estas rutas devuelven un token secreto
 * en el cuerpo.
 */
export function withAccess<Args extends unknown[]>(handler: Handler<Args>): Handler<Args> {
  return async (req: Request, ...args: Args): Promise<Response> => {
    const res = checkAccess(req) ? await handler(req, ...args) : accessDenied()
    res.headers.set('cache-control', 'no-store')
    return res
  }
}
