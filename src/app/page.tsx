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
  const [stats, setStats]               = useState<Stats | null>(null)
  const [ultimosAccesos, setUltimosAccesos] = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [hora, setHora]                 = useState('')
  const [ahora, setAhora]               = useState(new Date())

  // Reloj en tiempo real
  useEffect(() => {
    const iv = setInterval(() => {
      const n = new Date()
      setHora(n.toLocaleTimeString('es-CL'))
      setAhora(n)
    }, 1000)
    setHora(new Date().toLocaleTimeString('es-CL'))
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    cargar()

    // Realtime en accesos y sesiones_activas
    const canal = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accesos' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_activas' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_override' }, cargar)
      .subscribe()

    return () => { supabase.removeChannel(canal) }
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
      supabase.from('accesos').select('*').order('timestamp_inicio', { ascending: false }).limit(8),
    ])

    setStats({
      accesos_hoy:           accesos_hoy  || 0,
      sesiones_activas:      sesiones     || 0,
      alertas_pendientes:    alertas      || 0,
      overrides_pendientes:  overrides    || 0,
      accesos_exitosos_hoy:  exitosos     || 0,
      accesos_fallidos_hoy:  fallidos     || 0,
    })
    setUltimosAccesos(ultimos || [])
    setLoading(false)
  }

  function formatFecha(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function formatHora(iso: string) {
    return new Date(iso).toLocaleTimeString('es-CL')
  }

  function duracion(inicio: string, fin: string | null) {
    const end = fin ? new Date(fin) : ahora
    const diff = Math.floor((end.getTime() - new Date(inicio).getTime()) / 1000)
    if (diff < 0) return '—'
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  const fecha = new Date().toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="text-slate-600 text-xs uppercase tracking-widest mb-1 capitalize">{fecha}</div>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span className="text-slate-500 text-xs">Tiempo real</span>
            <div className="text-slate-400 text-sm font-mono">{hora}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-600 text-sm">Cargando estadísticas...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatCard label="Accesos hoy" value={stats!.accesos_hoy}
              sub={`${stats!.accesos_exitosos_hoy} exitosos · ${stats!.accesos_fallidos_hoy} fallidos`}
              color="blue" />
            <StatCard label="Sesiones activas ahora" value={stats!.sesiones_activas}
              sub="equipos en uso en este momento" color="green" href="/monitor" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatCard label="Alertas sin resolver" value={stats!.alertas_pendientes}
              sub="requieren atención"
              color={stats!.alertas_pendientes > 0 ? 'red' : 'gray'} href="/alertas" />
            <StatCard label="Overrides pendientes" value={stats!.overrides_pendientes}
              sub="alumnos esperando validación"
              color={stats!.overrides_pendientes > 0 ? 'purple' : 'gray'} href="/override" />
          </div>

          {/* Últimos accesos */}
          <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2a40]">
              <div className="flex items-center gap-2">
                <span className="text-slate-300 text-sm font-medium">Últimos accesos</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <Link href="/historial" className="text-blue-500 text-xs hover:text-blue-400">Ver todo →</Link>
            </div>
            <table className="tabla w-full">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Notebook</th>
                  <th>Fecha</th>
                  <th>Hora inicio</th>
                  <th>Duración</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ultimosAccesos.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-slate-600 py-8">Sin accesos registrados hoy</td></tr>
                ) : ultimosAccesos.map(a => (
                  <tr key={a.id}>
                    <td className="text-slate-300">{a.nombre || <span className="text-slate-600">—</span>}</td>
                    <td className="font-mono text-xs">{a.notebook_id || '—'}</td>
                    <td className="text-xs">{formatFecha(a.timestamp_inicio)}</td>
                    <td className="font-mono text-xs">{formatHora(a.timestamp_inicio)}</td>
                    <td className="font-mono text-xs text-emerald-500">
                      {duracion(a.timestamp_inicio, a.timestamp_fin)}
                    </td>
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
  if (resultado === 'exitoso')  return <span className="badge badge-green">✓ Exitoso</span>
  if (resultado === 'override') return <span className="badge badge-purple">⊕ Override</span>
  return <span className="badge badge-red">✗ Fallido</span>
}
