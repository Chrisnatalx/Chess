import { withAccess, isValidMatchId } from '@/server/auth'
import { getStore } from '@/server/store'
import { joinMatch, defaultDeps } from '@/server/match'
import { toPublic } from '@/core/match-state'

export const POST = withAccess(async (
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params
  if (!isValidMatchId(id)) return Response.json({ error: 'not_found' }, { status: 404 })
  const r = await joinMatch(getStore(), id, defaultDeps)
  if (r === 'not_found') return Response.json({ error: 'not_found' }, { status: 404 })
  if (r === 'full') return Response.json({ error: 'full' }, { status: 409 })
  // Dos personas abrieron el link a la vez y la otra ganó: para quien pierde
  // el asiento ya está ocupado, así que se le responde como si estuviera lleno.
  if (r === 'conflict') return Response.json({ error: 'full' }, { status: 409 })
  return Response.json({ match: toPublic(r.state), token: r.token, color: r.color })
})
