import { withAccess, isValidMatchId } from '@/server/auth'
import { getStore } from '@/server/store'
import { submitMove, type MoveError } from '@/server/match'
import { toPublic } from '@/core/match-state'

// Tipado como Record<MoveError, number> en vez de Record<string, number>:
// si el árbitro agrega un resultado nuevo, esto no compila hasta que se
// decida su código HTTP, en vez de degradar en silencio al 400 por defecto.
const ESTADO_HTTP: Record<MoveError, number> = {
  not_found: 404,
  not_active: 409,
  stale_ply: 409,
  // Otro escritor ganó la carrera. El cliente debe recargar el estado y reintentar.
  conflict: 409,
  not_your_turn: 403,
  bad_token: 403,
  illegal_move: 422,
}

type CuerpoMovimiento = {
  token: string
  ply: number
  from: string
  to: string
  promotion?: string
}

function esCuerpoValido(x: unknown): x is CuerpoMovimiento {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.token === 'string' &&
    typeof o.ply === 'number' &&
    typeof o.from === 'string' &&
    typeof o.to === 'string' &&
    (o.promotion === undefined || typeof o.promotion === 'string')
  )
}

export const POST = withAccess(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params
  if (!isValidMatchId(id)) return Response.json({ error: 'not_found' }, { status: 404 })

  // Un cuerpo ausente o mal formado (p. ej. un solo byte "{") no debe tirar
  // la ruta con un 500: cae a null, que ya se trata como bad_request.
  const cuerpo: unknown = await req.json().catch(() => null)

  if (!esCuerpoValido(cuerpo)) {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }

  const r = await submitMove(getStore(), id, {
    token: cuerpo.token,
    ply: cuerpo.ply,
    from: cuerpo.from,
    to: cuerpo.to,
    promotion: cuerpo.promotion,
  })

  if (typeof r === 'string') {
    return Response.json({ error: r }, { status: ESTADO_HTTP[r] })
  }
  return Response.json({ match: toPublic(r) })
})
