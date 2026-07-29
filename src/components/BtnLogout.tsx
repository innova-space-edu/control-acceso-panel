'use client'
import { createSupabaseBrowser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { registrarEvento } from '@/lib/events'

export default function BtnLogout() {
  const router = useRouter()

  async function cerrarSesion() {
    const sb = createSupabaseBrowser()
    await registrarEvento({ categoria: 'administracion', tipo_evento: 'cierre_sesion_admin', resultado: 'exitoso', descripcion: 'Cierre de sesión administrativo' })
    await sb.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={cerrarSesion}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"
    >
      <span className="text-base w-5 text-center">⏻</span>
      Cerrar sesión
    </button>
  )
}