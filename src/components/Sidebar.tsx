'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BtnLogout from '@/components/BtnLogout'

const nav = [
  { href: '/',          icon: '⬡', label: 'Dashboard'   },
  { href: '/monitor',   icon: '◉', label: 'Monitor'     },
  { href: '/alertas',   icon: '⚠', label: 'Alertas'     },
  { href: '/override',  icon: '⊕', label: 'Override'    },
  { href: '/examenes',  icon: '✎', label: 'Exámenes'    },
  { href: '/historial', icon: '≡', label: 'Historial'   },
  { href: '/gestion',   icon: '✦', label: 'Gestión'     },
  { href: '/reportes',  icon: '↓', label: 'Reportes'    },
]

function Logo() {
  const [error, setError] = useState(false)

  if (error) {
    return <div className="text-blue-500 text-2xl mb-1">◈</div>
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt="Logo colegio"
      width={48}
      height={48}
      className="object-contain mb-2"
      onError={() => setError(true)}
    />
  )
}

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-[#0d1520] border-r border-[#1a2a40] flex flex-col z-50">
      <div className="px-5 py-6 border-b border-[#1a2a40]">
        <Logo />
        <div className="text-slate-200 font-semibold text-sm leading-tight">Control de Acceso</div>
        <div className="text-slate-600 text-xs mt-0.5">Panel Administrador</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, icon, label }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-blue-900/40 text-blue-400 font-medium'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-[#111c2d]'
              }`}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
              {href === '/alertas'   && <AlertBadge />}
              {href === '/override'  && <OverrideBadge />}
              {href === '/examenes'  && <ExamenesBadge />}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[#1a2a40] space-y-1">
        <BtnLogout />
        <div className="text-slate-700 text-xs px-3">v1.0 · 2026</div>
      </div>
    </aside>
  )
}

function AlertBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { count: c } = await supabase
        .from('alertas')
        .select('*', { count: 'exact', head: true })
        .eq('resuelta', false)
      setCount(c || 0)
    }
    load()
    const iv = setInterval(load, 10000)
    return () => clearInterval(iv)
  }, [])

  if (!count) return null
  return (
    <span className="ml-auto bg-red-900 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function OverrideBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { count: c } = await supabase
        .from('solicitudes_override')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
      setCount(c || 0)
    }
    load()
    const iv = setInterval(load, 4000)
    return () => clearInterval(iv)
  }, [])

  if (!count) return null
  return (
    <span className="ml-auto bg-purple-900 text-purple-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full ping-slow">
      {count}
    </span>
  )
}

function ExamenesBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { count: c } = await supabase
        .from('examenes_kiosk')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'activo')
      setCount(c || 0)
    }
    load()
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [])

  if (!count) return null
  return (
    <span className="ml-auto bg-blue-900 text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
      {count}
    </span>
  )
}
