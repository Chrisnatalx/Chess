import { checkAccess, accessDenied } from '@/server/auth'
import { getStore } from '@/server/store'
import { toPublic } from '@/core/match-state'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAccess(req)) return accessDenied()
  const { id } = await params
  const state = await getStore().get(id)
  if (!state) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json({ match: toPublic(state) })
}
