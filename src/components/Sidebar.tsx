'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import BtnLogout from '@/components/BtnLogout'
import { supabase } from '@/lib/supabase'

const nav = [
  { href: '/', icon: '⬡', label: 'Centro de control' },
  { href: '/monitor', icon: '◉', label: 'Dispositivos' },
  { href: '/alertas', icon: '⚠', label: 'Incidencias' },
  { href: '/override', icon: '⊕', label: 'Desbloqueo' },
  { href: '/examenes', icon: '✎', label: 'Exámenes' },
  { href: '/historial', icon: '≡', label: 'Auditoría' },
  { href: '/gestion', icon: '✦', label: 'Gestión' },
  { href: '/reportes', icon: '↓', label: 'Reportes' },
]

export default function Sidebar() {
  const path = usePathname()
  const [incidents, setIncidents] = useState(0)
  const [overrides, setOverrides] = useState(0)
  const [exams, setExams] = useState(0)
  const [profile, setProfile] = useState<{ nombre?: string; rol?: string } | null>(null)

  useEffect(() => {
    load()
    const channel = supabase.channel('sidebar_global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_override' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'examenes_kiosk' }, load)
      .subscribe()
    const interval = setInterval(load, 30_000)
    return () => { clearInterval(interval); supabase.removeChannel(channel) }
  }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const [incidentResult, overrideResult, examResult, profileResult] = await Promise.all([
      supabase.from('incidencias').select('*', { count: 'exact', head: true }).not('estado', 'in', '(resuelta,falsa_alarma)'),
      supabase.from('solicitudes_override').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('examenes_kiosk').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
      user ? supabase.from('admin_profiles').select('nombre,rol').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null } as any),
    ])
    setIncidents(incidentResult.count || 0)
    setOverrides(overrideResult.count || 0)
    setExams(examResult.count || 0)
    setProfile(profileResult.data)
  }

  const badges: Record<string, number> = { '/alertas': incidents, '/override': overrides, '/examenes': exams }

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-[#0d1520] border-r border-[#1a2a40] flex flex-col z-50">
      <div className="px-5 py-5 border-b border-[#1a2a40]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Logo Colegio Providencia" width={46} height={46} className="object-contain mb-2" />
        <div className="text-slate-200 font-semibold text-sm leading-tight">Control de Acceso</div>
        <div className="text-slate-600 text-xs mt-0.5">Centro administrativo</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(item => {
          const active = path === item.href
          const badge = badges[item.href] || 0
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? 'bg-blue-900/40 text-blue-400 font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-[#111c2d]'}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {badge > 0 && <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.href === '/alertas' ? 'bg-red-900 text-red-300' : item.href === '/override' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'}`}>{badge > 99 ? '99+' : badge}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[#1a2a40] space-y-2">
        {profile && <div className="px-3 py-2 rounded-lg bg-[#09111c] border border-[#1a2a40]"><div className="text-slate-300 text-xs truncate">{profile.nombre}</div><div className="text-slate-600 text-[10px] uppercase mt-0.5">{profile.rol}</div></div>}
        <BtnLogout />
        <div className="text-slate-700 text-xs px-3">v2.0 · 2026</div>
      </div>
    </aside>
  )
}
