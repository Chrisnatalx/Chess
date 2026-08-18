import type { PublicMatch, Color } from '@/core/match-state'

export type Credentials = { accessKey: string; token: string; color: Color }

const claveDe = (id: string) => `chess:creds:${id}`

export function saveCreds(id: string, creds: Credentials): void {
  localStorage.setItem(claveDe(id), JSON.stringify(creds))
}

export function loadCreds(id: string): Credentials | null {
  const crudo = localStorage.getItem(claveDe(id))
  return crudo ? (JSON.parse(crudo) as Credentials) : null
}

export function saveAccessKey(clave: string): void {
  localStorage.setItem('chess:accessKey', clave)
}

export function loadAccessKey(): string {
  return localStorage.getItem('chess:accessKey') ?? ''
}

async function pedir<T>(url: string, accessKey: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-access-key': accessKey },
  })
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(cuerpo?.error ?? `http_${r.status}`)
  return cuerpo as T
}

type CreateResponse = { match: PublicMatch; token: string; color: Color }
type GetResponse = { match: PublicMatch }

export const apiCreate = (accessKey: string) =>
  pedir<CreateResponse>('/api/match', accessKey, { method: 'POST' })

export const apiGet = (id: string, accessKey: string) =>
  pedir<GetResponse>(`/api/match/${id}`, accessKey)

export const apiJoin = (id: string, accessKey: string) =>
  pedir<CreateResponse>(`/api/match/${id}/join`, accessKey, { method: 'POST' })

export const apiMove = (
  id: string,
  accessKey: string,
  cuerpo: { token: string; ply: number; from: string; to: string; promotion?: string },
) =>
  pedir<GetResponse>(`/api/match/${id}/move`, accessKey, {
    method: 'POST',
    body: JSON.stringify(cuerpo),
  })
