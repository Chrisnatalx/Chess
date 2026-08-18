import { withAccess } from '@/server/auth'
import { getStore } from '@/server/store'
import { createMatch, defaultDeps } from '@/server/match'
import { toPublic } from '@/core/match-state'

export const POST = withAccess(async () => {
  const { state, token } = await createMatch(getStore(), defaultDeps)
  return Response.json({ match: toPublic(state), token, color: 'w' })
})
