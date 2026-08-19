'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiCreate, saveAccessKey, saveCreds, loadAccessKey } from '@/client/api'
import { useValorDelNavegador } from '@/client/useValorDelNavegador'

export default function Home() {
  const router = useRouter()
  // `loadAccessKey` lee localStorage, que no existe durante el prerenderizado
  // en el servidor. `useValorDelNavegador` (useSyncExternalStore por debajo)
  // arranca en '' tanto en el servidor como en el primer render del cliente
  // — así los dos coinciden y React no reporta un mismatch de hidratación —
  // y recién después de montar se actualiza al valor real de localStorage.
  // El campo sigue siendo editable: `claveEditada` es la edición del usuario,
  // que gana sobre el valor guardado en cuanto existe (incluso si es '').
  const claveGuardada = useValorDelNavegador(loadAccessKey, '')
  const [claveEditada, setClaveEditada] = useState<string | null>(null)
  const clave = claveEditada ?? claveGuardada
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
          onChange={(e) => setClaveEditada(e.target.value)}
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
