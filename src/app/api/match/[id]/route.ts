import { withAccess, isValidMatchId } from '@/server/auth'
import { getStore } from '@/server/store'
import { toPublic } from '@/core/match-state'

export const GET = withAccess(async (
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params
  if (!isValidMatchId(id)) return Response.json({ error: 'not_found' }, { status: 404 })
  const state = await getStore().get(id)
  if (!state) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json({ match: toPublic(state) })
})
