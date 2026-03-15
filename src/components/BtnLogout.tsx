'use client'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function BtnLogout() {
  const router = useRouter()

  async function cerrarSesion() {
    await supabase.auth.signOut()
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
