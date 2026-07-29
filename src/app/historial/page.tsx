'use client'

import { useEffect, useState } from 'react'
import { formatDateTime } from '@/lib/format'
import { supabase, type EventoSistema, type Severidad } from '@/lib/supabase'

const PAGE_SIZE = 50

export default function AuditPage() {
  const today = new Date().toISOString().split('T')[0]
  const [events, setEvents] = useState<EventoSistema[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    from: today,
    to: today,
    category: '',
    severity: '',
    result: '',
    notebook: '',
    text: '',
  })

  useEffect(() => { load() }, [page])

  useEffect(() => {
    const channel = supabase
      .channel('auditoria_global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_sistema' }, () => page === 0 && load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [page, filters])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('eventos_sistema')
      .select('*', { count: 'exact' })
      .order('fecha_hora', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filters.from) query = query.gte('fecha_hora', `${filters.from}T00:00:00`)
    if (filters.to) query = query.lte('fecha_hora', `${filters.to}T23:59:59.999`)
    if (filters.category) query = query.eq('categoria', filters.category)
    if (filters.severity) query = query.eq('severidad', filters.severity)
    if (filters.result) query = query.eq('resultado', filters.result)
    if (filters.notebook) query = query.ilike('notebook_id', `%${filters.notebook.replaceAll(',', '')}%`)
    if (filters.text) {
      const safe = filters.text.replaceAll(',', ' ').trim()
      query = query.or(`descripcion.ilike.%${safe}%,tipo_evento.ilike.%${safe}%,actor_nombre.ilike.%${safe}%,rut_usuario.ilike.%${safe}%,nombre_usuario.ilike.%${safe}%`)
    }

    const { data, count, error: loadError } = await query
    if (loadError) {
      setError('Ejecuta la migración del centro de control: ' + loadError.message)
      setEvents([])
      setTotal(0)
    } else {
      setEvents((data || []) as EventoSistema[])
      setTotal(count || 0)
      setError('')
    }
    setLoading(false)
  }

  function applyFilters() {
    if (page === 0) load()
    else setPage(0)
  }

  return (
    <div className="max-w-[1500px] mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Actividad y auditoría</h1>
          <p className="text-slate-600 text-sm mt-1">Registro cronológico de accesos, seguridad, exámenes, administración, dispositivos y reportes.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />Inmutable · tiempo real</div>
      </header>

      {error && <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-300 text-sm">{error}</div>}

      <section className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
          <Field label="Desde"><input type="date" className="input-dark" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></Field>
          <Field label="Hasta"><input type="date" className="input-dark" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></Field>
          <Field label="Categoría"><select className="input-dark" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}><option value="">Todas</option>{['acceso','sesion','seguridad','incidencia','desbloqueo','examen','administracion','dispositivo','reporte'].map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Severidad"><select className="input-dark" value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}><option value="">Todas</option>{['critica','alta','media','baja','informativa'].map(x => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-[190px_220px_1fr_auto] gap-3 items-end">
          <Field label="Resultado"><input className="input-dark" placeholder="exitoso, fallido..." value={filters.result} onChange={e => setFilters(f => ({ ...f, result: e.target.value }))} /></Field>
          <Field label="Notebook"><input className="input-dark" placeholder="NB-SALA-41" value={filters.notebook} onChange={e => setFilters(f => ({ ...f, notebook: e.target.value }))} /></Field>
          <Field label="Buscar"><input className="input-dark" placeholder="Nombre, RUT, administrador, evento o descripción..." value={filters.text} onChange={e => setFilters(f => ({ ...f, text: e.target.value }))} onKeyDown={e => e.key === 'Enter' && applyFilters()} /></Field>
          <button className="btn-primary h-[38px]" onClick={applyFilters}>Aplicar filtros</button>
        </div>
        <div className="text-slate-600 text-xs mt-4">{total.toLocaleString('es-CL')} eventos encontrados</div>
      </section>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-x-auto">
        <table className="tabla min-w-[1350px] w-full">
          <thead><tr><th>Fecha y hora</th><th>Categoría</th><th>Evento</th><th>Severidad</th><th>Resultado</th><th>Actor</th><th>Usuario / RUT</th><th>Notebook / sala</th><th>Descripción</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center text-slate-600 py-12">Cargando auditoría...</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-slate-600 py-12">Sin eventos para los filtros seleccionados.</td></tr>
            ) : events.map(event => (
              <FragmentRow key={event.id} event={event} expanded={expanded === event.id} onToggle={() => setExpanded(expanded === event.id ? null : event.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <button className="btn-secondary" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Anterior</button>
          <span className="text-slate-600 text-xs">Página {page + 1} de {Math.ceil(total / PAGE_SIZE)}</span>
          <button className="btn-secondary" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  )
}

function FragmentRow({ event, expanded, onToggle }: { event: EventoSistema; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className={event.severidad === 'critica' ? 'bg-red-950/10' : ''}>
        <td className="text-xs whitespace-nowrap">{formatDateTime(event.fecha_hora)}</td>
        <td><span className="badge badge-gray">{event.categoria}</span></td>
        <td className="text-slate-300 text-xs">{event.tipo_evento.replaceAll('_', ' ')}</td>
        <td><SeverityBadge value={event.severidad} /></td>
        <td className="text-xs">{event.resultado}</td>
        <td className="text-xs">{event.actor_nombre || event.origen}</td>
        <td><div className="text-xs text-slate-300">{event.nombre_usuario || '—'}</div><div className="text-[11px] font-mono text-slate-600">{event.rut_usuario || '—'}</div></td>
        <td><div className="font-mono text-xs">{event.notebook_id || '—'}</div><div className="text-[11px] text-slate-600">{event.sala || '—'}</div></td>
        <td className="text-xs max-w-[320px] truncate" title={event.descripcion || ''}>{event.descripcion || '—'}</td>
        <td><button className="text-blue-500 text-xs hover:text-blue-300" onClick={onToggle}>{expanded ? 'Ocultar' : 'Detalle'}</button></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} className="!p-0">
            <div className="bg-[#08101a] border-y border-[#1a2a40] p-5 grid xl:grid-cols-[1fr_1.3fr] gap-5">
              <div className="space-y-2 text-xs">
                <Detail label="ID" value={event.id} />
                <Detail label="Origen" value={event.origen} />
                <Detail label="Correlation ID" value={event.correlation_id || '—'} />
                <Detail label="IP local" value={event.ip_local || '—'} />
                <Detail label="IP pública" value={event.ip_public || '—'} />
                <Detail label="Fecha dispositivo" value={formatDateTime(event.fecha_hora_dispositivo)} />
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-2">Datos completos</div>
                <pre className="text-[11px] leading-relaxed text-slate-400 bg-[#050a10] border border-[#1a2a40] rounded-lg p-4 overflow-auto max-h-72">{JSON.stringify(event.datos || {}, null, 2)}</pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-slate-600 text-xs block mb-1">{label}</label>{children}</div>
}

function SeverityBadge({ value }: { value: Severidad }) {
  const map: Record<Severidad, string> = { critica: 'badge-red', alta: 'badge-red', media: 'badge-amber', baja: 'badge-blue', informativa: 'badge-gray' }
  return <span className={`badge ${map[value]}`}>{value}</span>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-3"><span className="text-slate-600 w-28 flex-none">{label}</span><span className="text-slate-300 font-mono break-all">{value}</span></div>
}
