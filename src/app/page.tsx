'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Stats {
  accesos_hoy: number
  sesiones_activas: number
  alertas_pendientes: number
  overrides_pendientes: number
  accesos_exitosos_hoy: number
  accesos_fallidos_hoy: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [ultimosAccesos, setUltimosAccesos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hora, setHora] = useState('')

  useEffect(() => {
    setHora(new Date().toLocaleTimeString('es-CL'))
    const iv = setInterval(() => setHora(new Date().toLocaleTimeString('es-CL')), 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    cargar()
    const iv = setInterval(cargar, 15000)
    return () => clearInterval(iv)
  }, [])

  async function cargar() {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const hoyISO = hoy.toISOString()

    const [
      { count: accesos_hoy },
      { count: exitosos },
      { count: fallidos },
      { count: sesiones },
      { count: alertas },
      { count: overrides },
      { data: ultimos },
    ] = await Promise.all([
      supabase.from('accesos').select('*', { count: 'exact', head: true }).gte('timestamp_inicio', hoyISO),
      supabase.from('accesos').select('*', { count: 'exact', head: true }).gte('timestamp_inicio', hoyISO).eq('resultado', 'exitoso'),
      supabase.from('accesos').select('*', { count: 'exact', head: true }).gte('timestamp_inicio', hoyISO).eq('resultado', 'fallido'),
      supabase.from('sesiones_activas').select('*', { count: 'exact', head: true }),
      supabase.from('alertas').select('*', { count: 'exact', head: true }).eq('resuelta', false),
      supabase.from('solicitudes_override').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('accesos').select('*').order('timestamp_inicio', { ascending: false }).limit(6),
    ])

    setStats({
      accesos_hoy: accesos_hoy || 0,
      sesiones_activas: sesiones || 0,
      alertas_pendientes: alertas || 0,
      overrides_pendientes: overrides || 0,
      accesos_exitosos_hoy: exitosos || 0,
      accesos_fallidos_hoy: fallidos || 0,
    })
    setUltimosAccesos(ultimos || [])
    setLoading(false)
  }

  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="text-slate-600 text-xs uppercase tracking-widest mb-1">{fecha}</div>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
          <div className="text-slate-500 text-sm font-mono">{hora}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-600 text-sm">Cargando estadísticas...</div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatCard
              label="Accesos hoy"
              value={stats!.accesos_hoy}
              sub={`${stats!.accesos_exitosos_hoy} exitosos · ${stats!.accesos_fallidos_hoy} fallidos`}
              color="blue"
            />
            <StatCard
              label="Sesiones activas ahora"
              value={stats!.sesiones_activas}
              sub="equipos en uso en este momento"
              color="green"
              href="/monitor"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatCard
              label="Alertas sin resolver"
              value={stats!.alertas_pendientes}
              sub="requieren atención"
              color={stats!.alertas_pendientes > 0 ? 'red' : 'gray'}
              href="/alertas"
            />
            <StatCard
              label="Overrides pendientes"
              value={stats!.overrides_pendientes}
              sub="alumnos esperando validación"
              color={stats!.overrides_pendientes > 0 ? 'purple' : 'gray'}
              href="/override"
            />
          </div>

          {/* Últimos accesos */}
          <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2a40]">
              <span className="text-slate-300 text-sm font-medium">Últimos accesos</span>
              <Link href="/historial" className="text-blue-500 text-xs hover:text-blue-400">Ver todo →</Link>
            </div>
            <table className="tabla w-full">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Notebook</th>
                  <th>Hora</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ultimosAccesos.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-slate-600 py-8">Sin accesos registrados hoy</td></tr>
                ) : ultimosAccesos.map(a => (
                  <tr key={a.id}>
                    <td className="text-slate-300">{a.nombre || <span className="text-slate-600">—</span>}</td>
                    <td>{a.notebook_id || '—'}</td>
                    <td className="font-mono text-xs">{new Date(a.timestamp_inicio).toLocaleTimeString('es-CL')}</td>
                    <td><BadgeResultado resultado={a.resultado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color, href }: {
  label: string; value: number; sub: string; color: string; href?: string
}) {
  const colors: Record<string, string> = {
    blue:   'border-blue-900 bg-blue-950/20',
    green:  'border-emerald-900 bg-emerald-950/20',
    red:    'border-red-900 bg-red-950/20',
    purple: 'border-purple-900 bg-purple-950/20',
    gray:   'border-[#1a2a40] bg-[#0d1520]',
  }
  const valColors: Record<string, string> = {
    blue: 'text-blue-400', green: 'text-emerald-400',
    red: 'text-red-400', purple: 'text-purple-400', gray: 'text-slate-500',
  }

  const inner = (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">{label}</div>
      <div className={`text-4xl font-bold mb-1 ${valColors[color]}`}>{value}</div>
      <div className="text-slate-600 text-xs">{sub}</div>
    </div>
  )

  if (href) return <Link href={href} className="block hover:opacity-80 transition-opacity">{inner}</Link>
  return inner
}

function BadgeResultado({ resultado }: { resultado: string }) {
  if (resultado === 'exitoso') return <span className="badge badge-green">✓ Exitoso</span>
  if (resultado === 'override') return <span className="badge badge-purple">⊕ Override</span>
  return <span className="badge badge-red">✗ Fallido</span>
}