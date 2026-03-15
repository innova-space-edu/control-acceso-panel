'use client'
import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const router   = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [cargando, setCargando] = useState(false)

  async function ingresar() {
    if (!email || !password) { setError('Completa los dos campos'); return }
    setCargando(true)
    setError('')
    const sb = createSupabaseBrowser()
    const { error: err } = await sb.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Correo o contraseña incorrectos')
      setCargando(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#060a10] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="Logo colegio"
              width={80}
              height={80}
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                const fallback = e.currentTarget.nextElementSibling as HTMLElement
                if (fallback) fallback.style.display = 'block'
              }}
            />
            <span className="text-blue-500 text-5xl hidden">◈</span>
          </div>
          <h1 className="text-slate-100 text-xl font-semibold">Control de Acceso</h1>
          <p className="text-slate-600 text-sm mt-1">Panel Administrador</p>
        </div>

        {/* Card */}
        <div className="bg-[#0d1520] border border-[#1a2a40] rounded-2xl p-7">
          <h2 className="text-slate-300 text-sm font-medium mb-6">Iniciar sesión</h2>

          <div className="space-y-4">
            <div>
              <label className="text-slate-600 text-xs block mb-1.5">Correo electrónico</label>
              <input
                className="input-dark"
                type="email"
                placeholder="admin@colegio.cl"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ingresar()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-slate-600 text-xs block mb-1.5">Contraseña</label>
              <input
                className="input-dark"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ingresar()}
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs mt-4 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={ingresar}
            disabled={cargando}
            className="btn-primary w-full mt-6"
          >
            {cargando ? 'Ingresando...' : 'Ingresar al panel'}
          </button>
        </div>

        <p className="text-slate-700 text-xs text-center mt-6">
          Sistema de Control de Acceso Escolar · v1.0
        </p>
      </div>
    </div>
  )
}