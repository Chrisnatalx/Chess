import { checkAccess, accessDenied } from '@/server/auth'
import { getStore } from '@/server/store'
import { submitMove } from '@/server/match'
import { toPublic } from '@/core/match-state'

const ESTADO_HTTP: Record<string, number> = {
  not_found: 404,
  not_active: 409,
  stale_ply: 409,
  // Otro escritor ganó la carrera. El cliente debe recargar el estado y reintentar.
  conflict: 409,
  not_your_turn: 403,
  bad_token: 403,
  illegal_move: 422,
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAccess(req)) return accessDenied()
  const { id } = await params
  const cuerpo = await req.json()

  if (
    typeof cuerpo?.token !== 'string' ||
    typeof cuerpo?.ply !== 'number' ||
    typeof cuerpo?.from !== 'string' ||
    typeof cuerpo?.to !== 'string'
  ) {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }

  const r = await submitMove(getStore(), id, {
    token: cuerpo.token,
    ply: cuerpo.ply,
    from: cuerpo.from,
    to: cuerpo.to,
    promotion: typeof cuerpo.promotion === 'string' ? cuerpo.promotion : undefined,
  })

  if (typeof r === 'string') {
    return Response.json({ error: r }, { status: ESTADO_HTTP[r] ?? 400 })
  }
  return Response.json({ match: toPublic(r) })
}
