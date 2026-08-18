'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiCreate, saveAccessKey, saveCreds, loadAccessKey } from '@/client/api'

export default function Home() {
  const router = useRouter()
  // `loadAccessKey` lee localStorage, que no existe durante el prerenderizado
  // en el servidor (`next build`/SSR corren en Node, sin `window`). Se evita
  // llamarla ahí y se arranca en '' en ese caso; en el cliente, el
  // inicializador perezoso de useState sí la lee, en el primer render.
  const [clave, setClave] = useState(() => (
    typeof window === 'undefined' ? '' : loadAccessKey()
  ))
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      saveAccessKey(clave)
      const r = await apiCreate(clave)
      saveCreds(r.match.id, { token: r.token, color: r.color })
      router.push(`/match/${r.match.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error')
      setCreando(false)
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Ajedrez</h1>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Clave de acceso
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>
      <button onClick={crear} disabled={!clave || creando} style={{ padding: '8px 16px' }}>
        {creando ? 'Creando…' : 'Crear partida'}
      </button>
      {error === 'forbidden' && <p style={{ color: 'crimson' }}>Clave incorrecta.</p>}
      {error && error !== 'forbidden' && <p style={{ color: 'crimson' }}>Error: {error}</p>}
    </main>
  )
}
