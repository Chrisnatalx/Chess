import type { PublicMatch, Color } from '@/core/match-state'

// El token de acceso (`accessKey`) vive únicamente en loadAccessKey/
// saveAccessKey; no tiene sentido como campo de `Credentials` porque nadie
// lo leería desde ahí (era peso muerto y una segunda casa para el mismo
// secreto).
export type Credentials = { token: string; color: Color }

const claveDe = (id: string) => `chess:creds:${id}`

export function saveCreds(id: string, creds: Credentials): void {
  localStorage.setItem(claveDe(id), JSON.stringify(creds))
}

export function loadCreds(id: string): Credentials | null {
  const crudo = localStorage.getItem(claveDe(id))
  if (!crudo) return null
  try {
    return JSON.parse(crudo) as Credentials
  } catch {
    // localStorage corrupto (edición manual, versión vieja del esquema,
    // etc.): se degrada a "sin credenciales" en vez de tirar la excepción
    // hacia arriba y romper el efecto de consulta periódica.
    return null
  }
}

export function saveAccessKey(clave: string): void {
  localStorage.setItem('chess:accessKey', clave)
}

export function loadAccessKey(): string {
  return localStorage.getItem('chess:accessKey') ?? ''
}

async function pedir<T>(url: string, accessKey: string, init?: RequestInit): Promise<T> {
  // new Headers(...) normaliza cualquier forma de HeadersInit (objeto,
  // array de tuplas, u otro Headers) en vez de perder init.headers, que es
  // lo que hacía el spread anterior al reasignar `headers` después de
  // `...init`.
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json')
  headers.set('x-access-key', accessKey)
  const r = await fetch(url, { ...init, headers })

  // Se lee como texto primero: un cuerpo de error que no es JSON (una
  // página de error HTML de un proxy, un 204 sin contenido) haría que
  // r.json() lance un SyntaxError que llega al usuario como "Unexpected
  // token '<'", justo en el caso para el que existía el `?? http_${r.status}`
  // de abajo — con ese fallback inalcanzable porque nunca se llegaba a él.
  const texto = await r.text()
  let cuerpo: unknown
  try {
    cuerpo = texto ? JSON.parse(texto) : undefined
  } catch {
    cuerpo = undefined
  }

  if (!r.ok) {
    const codigo =
      cuerpo !== null &&
      typeof cuerpo === 'object' &&
      'error' in cuerpo &&
      typeof (cuerpo as { error: unknown }).error === 'string'
        ? (cuerpo as { error: string }).error
        : `http_${r.status}`
    throw new Error(codigo)
  }
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
