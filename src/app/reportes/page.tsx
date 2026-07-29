'use client'

import { useEffect, useMemo, useState } from 'react'
import { registrarEvento } from '@/lib/events'
import { formatDateTime, isOnline } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type ReportDef = { id: string; title: string; description: string; group: string; tone: string }
type ReportRow = Record<string, string | number | boolean | null | undefined>

const REPORTS: ReportDef[] = [
  { id: 'eventos', title: 'Auditoría completa', description: 'Todo lo registrado y realizado en la plataforma.', group: 'Auditoría', tone: 'blue' },
  { id: 'administracion', title: 'Acciones administrativas', description: 'Creaciones, cambios, eliminaciones, reportes y responsables.', group: 'Auditoría', tone: 'purple' },
  { id: 'accesos', title: 'Ingresos y sesiones', description: 'Fecha, hora, duración, usuario, equipo y resultado.', group: 'Operación', tone: 'green' },
  { id: 'fallidos', title: 'Accesos fallidos', description: 'Intentos rechazados y causas registradas.', group: 'Operación', tone: 'red' },
  { id: 'uso_curso', title: 'Uso por curso', description: 'Cantidad de accesos y tiempo acumulado por curso.', group: 'Operación', tone: 'cyan' },
  { id: 'uso_sala', title: 'Uso por sala', description: 'Actividad y tiempo de uso de cada sala.', group: 'Operación', tone: 'cyan' },
  { id: 'uso_notebook', title: 'Uso por notebook', description: 'Sesiones, usuarios y duración por equipo.', group: 'Operación', tone: 'cyan' },
  { id: 'incidencias', title: 'Incidencias de seguridad', description: 'Severidad, estado, responsable y resolución.', group: 'Seguridad', tone: 'amber' },
  { id: 'desbloqueos', title: 'Desbloqueos', description: 'Solicitudes aprobadas, rechazadas, duración y administrador.', group: 'Seguridad', tone: 'purple' },
  { id: 'comandos', title: 'Comandos remotos', description: 'Envío, recepción, ejecución, fallas y tiempos.', group: 'Seguridad', tone: 'blue' },
  { id: 'dispositivos', title: 'Inventario y estado', description: 'IP, agente, última señal, seguridad y datos técnicos.', group: 'Inventario', tone: 'green' },
  { id: 'examenes', title: 'Exámenes en sala', description: 'Inicio, cierre, sala, duración y responsable.', group: 'Evaluaciones', tone: 'blue' },
]

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0]
  const [params, setParams] = useState({ from: today, to: today, course: '', notebook: '', room: '', severity: '' })
  const [stats, setStats] = useState({ events: 0, incidents: 0, failures: 0, online: 0, offline: 0, commandsFailed: 0 })
  const [breakdown, setBreakdown] = useState<{ label: string; value: number }[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStats()
    const channel = supabase
      .channel('reportes_integrales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_sistema' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispositivos_estado' }, loadStats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [params.from, params.to, params.course, params.notebook, params.room, params.severity])

  async function loadStats() {
    const from = `${params.from}T00:00:00`
    const to = `${params.to}T23:59:59.999`
    let eventsQuery = supabase.from('eventos_sistema').select('categoria,severidad,notebook_id,sala,curso,fecha_hora')
      .gte('fecha_hora', from).lte('fecha_hora', to)
    if (params.notebook) eventsQuery = eventsQuery.ilike('notebook_id', `%${params.notebook}%`)
    if (params.room) eventsQuery = eventsQuery.ilike('sala', `%${params.room}%`)
    if (params.course) eventsQuery = eventsQuery.ilike('curso', `%${params.course}%`)
    if (params.severity) eventsQuery = eventsQuery.eq('severidad', params.severity)

    const [eventsResult, incidentsResult, failuresResult, deviceResult, commandResult] = await Promise.all([
      eventsQuery,
      supabase.from('incidencias').select('*', { count: 'exact', head: true }).gte('creada_en', from).lte('creada_en', to),
      supabase.from('accesos').select('*', { count: 'exact', head: true }).gte('timestamp_inicio', from).lte('timestamp_inicio', to).eq('resultado', 'fallido'),
      supabase.from('dispositivos_estado').select('online,ultima_senal'),
      supabase.from('comandos_remotos').select('*', { count: 'exact', head: true }).gte('creado_en', from).lte('creado_en', to).eq('estado', 'fallido'),
    ])

    if (eventsResult.error) {
      setError('Ejecuta la migración del centro de control: ' + eventsResult.error.message)
      return
    }
    setError('')
    const events = eventsResult.data || []
    const categories = new Map<string, number>()
    events.forEach(e => categories.set(e.categoria, (categories.get(e.categoria) || 0) + 1))
    setBreakdown([...categories.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })))
    const devices = deviceResult.data || []
    const online = devices.filter(d => isOnline(d.ultima_senal, d.online)).length
    setStats({
      events: events.length,
      incidents: incidentsResult.count || 0,
      failures: failuresResult.count || 0,
      online,
      offline: devices.length - online,
      commandsFailed: commandResult.count || 0,
    })
  }

  async function getReportData(id: string): Promise<ReportRow[]> {
    const from = `${params.from}T00:00:00`
    const to = `${params.to}T23:59:59.999`

    if (id === 'eventos' || id === 'administracion') {
      let query = supabase.from('eventos_sistema').select('*').gte('fecha_hora', from).lte('fecha_hora', to).order('fecha_hora', { ascending: false })
      if (id === 'administracion') query = query.in('categoria', ['administracion', 'reporte'])
      if (params.notebook) query = query.ilike('notebook_id', `%${params.notebook}%`)
      if (params.room) query = query.ilike('sala', `%${params.room}%`)
      if (params.course) query = query.ilike('curso', `%${params.course}%`)
      if (params.severity) query = query.eq('severidad', params.severity)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map(e => ({
        'Fecha y hora': formatDateTime(e.fecha_hora), Categoría: e.categoria, Evento: e.tipo_evento,
        Severidad: e.severidad, Resultado: e.resultado, Descripción: e.descripcion,
        Administrador: e.actor_nombre, RUT: e.rut_usuario, Usuario: e.nombre_usuario,
        Notebook: e.notebook_id, Sala: e.sala, Curso: e.curso, 'IP local': e.ip_local,
        'IP pública': e.ip_public, Origen: e.origen, Datos: JSON.stringify(e.datos || {}),
      }))
    }

    if (['accesos', 'fallidos', 'uso_curso', 'uso_sala', 'uso_notebook'].includes(id)) {
      let query = supabase.from('accesos').select('*').gte('timestamp_inicio', from).lte('timestamp_inicio', to).order('timestamp_inicio', { ascending: false })
      if (id === 'fallidos') query = query.eq('resultado', 'fallido')
      if (params.notebook) query = query.ilike('notebook_id', `%${params.notebook}%`)
      if (params.room) query = query.ilike('sala', `%${params.room}%`)
      if (params.course) query = query.ilike('curso', `%${params.course}%`)
      const { data, error } = await query
      if (error) throw error
      const rows = data || []
      if (id.startsWith('uso_')) {
        const key = id === 'uso_curso' ? 'curso' : id === 'uso_sala' ? 'sala' : 'notebook_id'
        const summary = new Map<string, { sessions: number; minutes: number; failures: number }>()
        rows.forEach(r => {
          const label = r[key] || 'Sin información'
          const current = summary.get(label) || { sessions: 0, minutes: 0, failures: 0 }
          current.sessions++
          current.minutes += Number(r.duracion_minutos || 0)
          if (r.resultado === 'fallido') current.failures++
          summary.set(label, current)
        })
        return [...summary.entries()].sort((a, b) => b[1].sessions - a[1].sessions).map(([label, value]) => ({
          [id === 'uso_curso' ? 'Curso' : id === 'uso_sala' ? 'Sala' : 'Notebook']: label,
          'Total registros': value.sessions, 'Minutos de uso': Math.round(value.minutes), 'Accesos fallidos': value.failures,
        }))
      }
      return rows.map(r => ({
        'Fecha inicio': formatDateTime(r.timestamp_inicio), 'Fecha fin': formatDateTime(r.timestamp_fin),
        'Duración (min)': r.duracion_minutos, Resultado: r.resultado, Evento: r.tipo_evento,
        RUT: r.rut, Nombre: r.nombre, Curso: r.curso, Notebook: r.notebook_id, Sala: r.sala,
      }))
    }

    if (id === 'incidencias') {
      let query = supabase.from('incidencias').select('*').gte('creada_en', from).lte('creada_en', to).order('creada_en', { ascending: false })
      if (params.notebook) query = query.ilike('notebook_id', `%${params.notebook}%`)
      if (params.room) query = query.ilike('sala', `%${params.room}%`)
      if (params.severity) query = query.eq('severidad', params.severity)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map(i => ({
        Creada: formatDateTime(i.creada_en), Actualizada: formatDateTime(i.actualizada_en), Resuelta: formatDateTime(i.resuelta_en),
        Título: i.titulo, Tipo: i.tipo, Severidad: i.severidad, Estado: i.estado, Descripción: i.descripcion,
        Notebook: i.notebook_id, RUT: i.rut, Sala: i.sala, Responsable: i.asignada_nombre,
        'Resuelta por': i.resuelta_por_nombre, Resolución: i.resolucion,
      }))
    }

    if (id === 'desbloqueos') {
      const { data, error } = await supabase.from('solicitudes_override').select('*').gte('creado_en', from).lte('creado_en', to).order('creado_en', { ascending: false })
      if (error) throw error
      return (data || []).map(r => ({
        Solicitado: formatDateTime(r.creado_en), Resuelto: formatDateTime(r.resuelto_en), Estado: r.estado,
        Notebook: r.notebook_id, RUT: r.rut_override, Nombre: r.nombre_override, Curso: r.curso_override,
        Motivo: r.motivo, 'Duración (min)': r.duracion_minutos, 'Resuelto por': r.resuelto_por,
      }))
    }

    if (id === 'comandos') {
      let query = supabase.from('comandos_remotos').select('*').gte('creado_en', from).lte('creado_en', to).order('creado_en', { ascending: false })
      if (params.notebook) query = query.ilike('notebook_id', `%${params.notebook}%`)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map(c => ({
        Creado: formatDateTime(c.creado_en), Enviado: formatDateTime(c.enviado_en), Recibido: formatDateTime(c.recibido_en),
        Ejecutado: formatDateTime(c.ejecutado_en), Notebook: c.notebook_id, Tipo: c.tipo, Estado: c.estado,
        Motivo: c.motivo, Solicitante: c.solicitado_por_nombre, Detalle: c.resultado_detalle, Intentos: c.intentos,
      }))
    }

    if (id === 'dispositivos') {
      const [{ data: notebooks, error: nError }, { data: states, error: sError }] = await Promise.all([
        supabase.from('notebooks').select('*').order('id'),
        supabase.from('dispositivos_estado').select('*'),
      ])
      if (nError || sError) throw nError || sError
      const stateMap = new Map((states || []).map(s => [s.notebook_id, s]))
      return (notebooks || []).filter(n => !params.notebook || n.id.toLowerCase().includes(params.notebook.toLowerCase())).map(n => {
        const s: any = stateMap.get(n.id)
        return {
          Notebook: n.id, Nombre: n.nombre, Sala: n.sala, Estado: n.estado, Seguridad: n.estado_seguridad,
          Online: isOnline(s?.ultima_senal, s?.online) ? 'Sí' : 'No', 'Última señal': formatDateTime(s?.ultima_senal),
          'IP local': s?.ip_local, 'IP pública': s?.ip_public, Hostname: s?.hostname || n.hostname,
          Red: s?.red, 'Sistema operativo': s?.sistema_operativo || n.sistema_operativo,
          'Versión agente': s?.version_agente || n.version_agente, Batería: s?.bateria,
          Serie: n.numero_serie, Marca: n.marca, Modelo: n.modelo, Responsable: n.responsable,
        }
      })
    }

    if (id === 'examenes') {
      const { data, error } = await supabase.from('examenes_kiosk').select('*').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(e => ({
        Inicio: formatDateTime(e.created_at), Cierre: formatDateTime(e.closed_at), Título: e.exam_title,
        Código: e.exam_code, Sala: e.sala, Estado: e.estado, 'Duración estimada': e.duracion_min,
        'Creado por': e.creado_por, URL: e.exam_url,
      }))
    }

    return []
  }

  async function exportReport(report: ReportDef, format: 'xlsx' | 'csv') {
    setGenerating(`${report.id}-${format}`)
    try {
      const rows = await getReportData(report.id)
      if (!rows.length) throw new Error('No hay datos para exportar con los filtros seleccionados.')
      const XLSX = await import('xlsx')
      const sheet = XLSX.utils.json_to_sheet(rows)
      const filename = `control_acceso_${report.id}_${params.from}_${params.to}`
      if (format === 'xlsx') {
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, report.title.slice(0, 30))
        XLSX.writeFile(book, `${filename}.xlsx`)
      } else {
        const csv = XLSX.utils.sheet_to_csv(sheet)
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `${filename}.csv`
        link.click()
        URL.revokeObjectURL(link.href)
      }
      await registrarEvento({ categoria: 'reporte', tipo_evento: 'reporte_exportado', resultado: 'exitoso', descripcion: `${report.title} exportado en ${format.toUpperCase()}`, datos: { report_id: report.id, format, filters: params, rows: rows.length } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible generar el reporte')
    } finally {
      setGenerating(null)
    }
  }

  const groups = useMemo(() => [...new Set(REPORTS.map(r => r.group))], [])
  const maxBreakdown = Math.max(1, ...breakdown.map(b => b.value))

  return (
    <div className="max-w-7xl mx-auto report-print-area">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Reportes integrales</h1>
          <p className="text-slate-600 text-sm mt-1">Incidencias, ingresos, uso, fallas, administración, dispositivos y exámenes con fecha y hora.</p>
        </div>
        <button className="btn-secondary no-print" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </header>

      {error && <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-300 text-sm no-print">{error}</div>}

      <section className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-6 no-print">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
          <Field label="Desde"><input type="date" className="input-dark" value={params.from} onChange={e => setParams(p => ({ ...p, from: e.target.value }))} /></Field>
          <Field label="Hasta"><input type="date" className="input-dark" value={params.to} onChange={e => setParams(p => ({ ...p, to: e.target.value }))} /></Field>
          <Field label="Curso"><input className="input-dark" placeholder="4° Medio A" value={params.course} onChange={e => setParams(p => ({ ...p, course: e.target.value }))} /></Field>
          <Field label="Notebook"><input className="input-dark" placeholder="NB-SALA-41" value={params.notebook} onChange={e => setParams(p => ({ ...p, notebook: e.target.value }))} /></Field>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Field label="Sala"><input className="input-dark" placeholder="Sala de Computación" value={params.room} onChange={e => setParams(p => ({ ...p, room: e.target.value }))} /></Field>
          <Field label="Severidad"><select className="input-dark" value={params.severity} onChange={e => setParams(p => ({ ...p, severity: e.target.value }))}><option value="">Todas</option>{['critica','alta','media','baja','informativa'].map(x => <option key={x}>{x}</option>)}</select></Field>
          <div className="xl:col-span-2 flex items-end"><button className="btn-primary" onClick={loadStats}>Actualizar estadísticas</button></div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-7">
        <Metric label="Eventos" value={stats.events} />
        <Metric label="Incidencias" value={stats.incidents} danger={stats.incidents > 0} />
        <Metric label="Accesos fallidos" value={stats.failures} danger={stats.failures > 0} />
        <Metric label="Equipos online" value={stats.online} />
        <Metric label="Equipos offline" value={stats.offline} danger={stats.offline > 0} />
        <Metric label="Comandos fallidos" value={stats.commandsFailed} danger={stats.commandsFailed > 0} />
      </section>

      <section className="grid xl:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-7 no-print">
          {groups.map(group => (
            <div key={group}>
              <h2 className="text-slate-300 font-semibold mb-3">{group}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {REPORTS.filter(r => r.group === group).map(report => (
                  <article key={report.id} className={`rounded-xl border bg-[#0d1520] p-5 ${toneBorder(report.tone)}`}>
                    <div className="text-slate-200 font-medium text-sm">{report.title}</div>
                    <p className="text-slate-600 text-xs mt-1 min-h-8">{report.description}</p>
                    <div className="flex gap-3 mt-4">
                      <button className="text-blue-500 text-xs hover:text-blue-300" disabled={!!generating} onClick={() => exportReport(report, 'xlsx')}>{generating === `${report.id}-xlsx` ? 'Generando...' : '↓ Excel'}</button>
                      <button className="text-slate-400 text-xs hover:text-slate-200" disabled={!!generating} onClick={() => exportReport(report, 'csv')}>{generating === `${report.id}-csv` ? 'Generando...' : '↓ CSV'}</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="rounded-xl border border-[#1a2a40] bg-[#0d1520] p-5 h-fit">
          <h2 className="text-slate-200 font-medium">Distribución de eventos</h2>
          <p className="text-slate-600 text-xs mt-1 mb-5">Período y filtros seleccionados.</p>
          {breakdown.length === 0 ? <div className="text-slate-600 text-xs py-10 text-center">Sin datos</div> : (
            <div className="space-y-4">
              {breakdown.map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-400 capitalize">{item.label}</span><span className="text-slate-500 font-mono">{item.value}</span></div>
                  <div className="h-2 rounded-full bg-[#09111c] overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.max(4, item.value / maxBreakdown * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </section>

      <section className="hidden print:block mt-8">
        <h2>Resumen del período</h2>
        <p>Desde {params.from} hasta {params.to}. Eventos: {stats.events}. Incidencias: {stats.incidents}. Accesos fallidos: {stats.failures}. Equipos online: {stats.online}. Equipos offline: {stats.offline}.</p>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="text-slate-600 text-xs block mb-1">{label}</label>{children}</div> }
function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) { return <div className={`rounded-xl border p-4 bg-[#0d1520] ${danger ? 'border-red-900/60' : 'border-[#1a2a40]'}`}><div className="text-slate-600 text-[10px] uppercase tracking-widest">{label}</div><div className={`text-2xl font-bold mt-2 ${danger ? 'text-red-400' : 'text-slate-200'}`}>{value}</div></div> }
function toneBorder(tone: string) { const map: Record<string, string> = { red: 'border-red-900/50', amber: 'border-amber-900/50', green: 'border-emerald-900/50', blue: 'border-blue-900/50', purple: 'border-purple-900/50', cyan: 'border-cyan-900/50' }; return map[tone] || 'border-[#1a2a40]' }
