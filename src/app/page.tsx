'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase, type EventoSistema } from '@/lib/supabase'
import { formatDateTime, isOnline } from '@/lib/format'

type Stats = {
  accesosHoy: number
  accesosFallidosHoy: number
  sesionesActivas: number
  incidenciasAbiertas: number
  incidenciasCriticas: number
  overridesPendientes: number
  equiposOnline: number
  equiposOffline: number
  equiposRiesgo: number
  comandosFallidos: number
  examenesActivos: number
}

const emptyStats: Stats = {
  accesosHoy: 0,
  accesosFallidosHoy: 0,
  sesionesActivas: 0,
  incidenciasAbiertas: 0,
  incidenciasCriticas: 0,
  overridesPendientes: 0,
  equiposOnline: 0,
  equiposOffline: 0,
  equiposRiesgo: 0,
  comandosFallidos: 0,
  examenesActivos: 0,
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [events, setEvents] = useState<EventoSistema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('dashboard_control_central')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_sistema' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispositivos_estado' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_override' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandos_remotos' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_activas' }, load)
      .subscribe()
    const refresh = setInterval(load, 30_000)
    return () => {
      clearInterval(refresh)
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString()

    const [
      accessResult,
      failedResult,
      sessionsResult,
      incidentResult,
      criticalResult,
      overrideResult,
      notebookResult,
      deviceResult,
      commandsResult,
      examsResult,
      eventsResult,
    ] = await Promise.all([
      supabase.from('accesos').select('*', { count: 'exact', head: true }).gte('timestamp_inicio', todayIso),
      supabase.from('accesos').select('*', { count: 'exact', head: true }).gte('timestamp_inicio', todayIso).eq('resultado', 'fallido'),
      supabase.from('sesiones_activas').select('*', { count: 'exact', head: true }),
      supabase.from('incidencias').select('*', { count: 'exact', head: true }).not('estado', 'in', '(resuelta,falsa_alarma)'),
      supabase.from('incidencias').select('*', { count: 'exact', head: true }).eq('severidad', 'critica').not('estado', 'in', '(resuelta,falsa_alarma)'),
      supabase.from('solicitudes_override').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('notebooks').select('id, estado_seguridad'),
      supabase.from('dispositivos_estado').select('notebook_id, online, ultima_senal'),
      supabase.from('comandos_remotos').select('*', { count: 'exact', head: true }).eq('estado', 'fallido').gte('creado_en', todayIso),
      supabase.from('examenes_kiosk').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
      supabase.from('eventos_sistema').select('*').order('fecha_hora', { ascending: false }).limit(12),
    ])

    const firstError = [incidentResult.error, deviceResult.error, eventsResult.error].find(Boolean)
    if (firstError) {
      setError('Falta ejecutar la migración del centro de control en Supabase. ' + firstError.message)
    } else {
      setError('')
    }

    const devices = deviceResult.data || []
    const onlineIds = new Set(devices.filter(d => isOnline(d.ultima_senal, d.online)).map(d => d.notebook_id))
    const notebooks = notebookResult.data || []
    setStats({
      accesosHoy: accessResult.count || 0,
      accesosFallidosHoy: failedResult.count || 0,
      sesionesActivas: sessionsResult.count || 0,
      incidenciasAbiertas: incidentResult.count || 0,
      incidenciasCriticas: criticalResult.count || 0,
      overridesPendientes: overrideResult.count || 0,
      equiposOnline: onlineIds.size,
      equiposOffline: Math.max(0, notebooks.length - onlineIds.size),
      equiposRiesgo: notebooks.filter(n => ['perdido', 'robado'].includes(n.estado_seguridad || '')).length,
      comandosFallidos: commandsResult.count || 0,
      examenesActivos: examsResult.count || 0,
    })
    setEvents((eventsResult.data || []) as EventoSistema[])
    setLoading(false)
  }

  const dateLabel = useMemo(() => now.toLocaleDateString('es-CL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }), [now])

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-slate-600 text-xs uppercase tracking-[0.18em] capitalize mb-1">{dateLabel}</div>
          <h1 className="text-2xl font-semibold text-slate-100">Centro de control</h1>
          <p className="text-slate-600 text-sm mt-1">Operación, seguridad, dispositivos y auditoría en una sola vista.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#1a2a40] bg-[#0d1520] px-4 py-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-slate-500 text-xs">Tiempo real</span>
          <span className="font-mono text-sm text-slate-300">{now.toLocaleTimeString('es-CL')}</span>
        </div>
      </header>

      {error && (
        <div className="mb-5 rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-slate-600 text-sm">Cargando centro de control...</div>
      ) : (
        <>
          <section className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-7">
            <Stat label="Accesos hoy" value={stats.accesosHoy} detail={`${stats.accesosFallidosHoy} fallidos`} tone="blue" href="/historial" />
            <Stat label="Equipos en línea" value={stats.equiposOnline} detail={`${stats.equiposOffline} sin señal`} tone="green" href="/monitor" />
            <Stat label="Incidencias abiertas" value={stats.incidenciasAbiertas} detail={`${stats.incidenciasCriticas} críticas`} tone={stats.incidenciasCriticas ? 'red' : 'amber'} href="/alertas" />
            <Stat label="Desbloqueos" value={stats.overridesPendientes} detail="pendientes" tone="purple" href="/override" />
            <Stat label="Equipos en riesgo" value={stats.equiposRiesgo} detail="perdidos o robados" tone={stats.equiposRiesgo ? 'red' : 'gray'} href="/gestion" />
          </section>

          <section className="grid lg:grid-cols-3 gap-4 mb-7">
            <QuickCard title="Sesiones activas" value={stats.sesionesActivas} href="/monitor" detail="Usuarios trabajando ahora" />
            <QuickCard title="Exámenes activos" value={stats.examenesActivos} href="/examenes" detail="Sesiones de evaluación vigentes" />
            <QuickCard title="Comandos fallidos hoy" value={stats.comandosFallidos} href="/reportes" detail="Acciones remotas que requieren revisión" danger={stats.comandosFallidos > 0} />
          </section>

          <section className="grid xl:grid-cols-[1fr_320px] gap-5">
            <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2a40]">
                <div>
                  <h2 className="text-slate-200 font-medium">Actividad reciente</h2>
                  <p className="text-slate-600 text-xs mt-0.5">Todo lo que registra y ejecuta la plataforma</p>
                </div>
                <Link href="/historial" className="text-blue-500 text-xs hover:text-blue-300">Abrir auditoría →</Link>
              </div>
              <div className="divide-y divide-[#111c2d]">
                {events.length === 0 ? (
                  <div className="py-12 text-center text-slate-600 text-sm">Sin eventos registrados.</div>
                ) : events.map(event => (
                  <div key={event.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-[#101a29]">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${severityDot(event.severidad)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-x-2 gap-y-1 items-center">
                        <span className="text-slate-300 text-sm font-medium">{event.tipo_evento.replaceAll('_', ' ')}</span>
                        <span className="badge badge-gray">{event.categoria}</span>
                        <span className="text-slate-600 text-xs font-mono">{event.notebook_id || event.rut_usuario || ''}</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1 truncate">{event.descripcion || event.resultado}</p>
                    </div>
                    <time className="text-slate-600 text-[11px] whitespace-nowrap">{formatDateTime(event.fecha_hora)}</time>
                  </div>
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <ActionLink href="/monitor" title="Control de dispositivos" detail="Ver IP, estado, batería, usuario y última señal." />
              <ActionLink href="/alertas" title="Centro de incidencias" detail="Asignar, investigar y documentar resoluciones." />
              <ActionLink href="/reportes" title="Reportes integrales" detail="Exportar accesos, fallas, auditoría y seguridad." />
            </aside>
          </section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, detail, tone, href }: { label: string; value: number; detail: string; tone: string; href: string }) {
  const styles: Record<string, string> = {
    blue: 'border-blue-900/70 bg-blue-950/20 text-blue-400',
    green: 'border-emerald-900/70 bg-emerald-950/20 text-emerald-400',
    red: 'border-red-900/70 bg-red-950/20 text-red-400',
    amber: 'border-amber-900/70 bg-amber-950/20 text-amber-400',
    purple: 'border-purple-900/70 bg-purple-950/20 text-purple-400',
    gray: 'border-[#1a2a40] bg-[#0d1520] text-slate-500',
  }
  return (
    <Link href={href} className={`rounded-xl border p-4 hover:-translate-y-0.5 transition-transform ${styles[tone]}`}>
      <div className="text-slate-500 text-[11px] uppercase tracking-widest mb-2">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-slate-600 text-xs mt-1">{detail}</div>
    </Link>
  )
}

function QuickCard({ title, value, href, detail, danger }: { title: string; value: number; href: string; detail: string; danger?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border p-5 bg-[#0d1520] hover:border-blue-800 transition-colors ${danger ? 'border-red-900/70' : 'border-[#1a2a40]'}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-slate-300 text-sm font-medium">{title}</div>
          <div className="text-slate-600 text-xs mt-1">{detail}</div>
        </div>
        <div className={`text-3xl font-bold ${danger ? 'text-red-400' : 'text-slate-300'}`}>{value}</div>
      </div>
    </Link>
  )
}

function ActionLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-[#1a2a40] bg-[#0d1520] p-5 hover:border-blue-800 transition-colors">
      <div className="text-slate-200 text-sm font-medium mb-1">{title}</div>
      <p className="text-slate-600 text-xs leading-relaxed">{detail}</p>
      <div className="text-blue-500 text-xs mt-4">Abrir →</div>
    </Link>
  )
}

function severityDot(severity: string) {
  if (severity === 'critica') return 'bg-red-500 shadow-[0_0_8px_#ef4444]'
  if (severity === 'alta') return 'bg-orange-500'
  if (severity === 'media') return 'bg-amber-500'
  if (severity === 'baja') return 'bg-blue-500'
  return 'bg-emerald-500'
}
