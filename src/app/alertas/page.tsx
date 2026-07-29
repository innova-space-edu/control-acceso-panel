'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminAction } from '@/lib/admin-api'
import { formatDateTime } from '@/lib/format'
import { supabase, type EstadoIncidencia, type Incidencia, type Severidad } from '@/lib/supabase'

const STATE_LABEL: Record<string, string> = {
  nueva: 'Nueva', en_revision: 'En revisión', asignada: 'Asignada',
  accion_ejecutada: 'Acción ejecutada', resuelta: 'Resuelta', falsa_alarma: 'Falsa alarma',
}

export default function IncidentsPage() {
  const [items, setItems] = useState<Incidencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ state: 'abiertas', severity: '', query: '' })
  const [selected, setSelected] = useState<Incidencia | null>(null)
  const [newState, setNewState] = useState<EstadoIncidencia>('en_revision')
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    const channel = supabase
      .channel('incidencias_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function load() {
    const { data, error: loadError } = await supabase
      .from('incidencias')
      .select('*')
      .order('creada_en', { ascending: false })
      .limit(500)
    if (loadError) setError('Ejecuta la migración del centro de control: ' + loadError.message)
    else {
      setItems((data || []) as Incidencia[])
      setError('')
    }
    setLoading(false)
  }

  const filtered = useMemo(() => items.filter(item => {
    const stateOk = filters.state === 'todas'
      || (filters.state === 'abiertas' && !['resuelta', 'falsa_alarma'].includes(item.estado))
      || item.estado === filters.state
    const severityOk = !filters.severity || item.severidad === filters.severity
    const text = [item.titulo, item.descripcion, item.tipo, item.notebook_id, item.rut, item.sala].filter(Boolean).join(' ').toLowerCase()
    return stateOk && severityOk && text.includes(filters.query.toLowerCase())
  }), [items, filters])

  const counts = useMemo(() => ({
    open: items.filter(i => !['resuelta', 'falsa_alarma'].includes(i.estado)).length,
    critical: items.filter(i => i.severidad === 'critica' && !['resuelta', 'falsa_alarma'].includes(i.estado)).length,
    reviewing: items.filter(i => i.estado === 'en_revision').length,
  }), [items])

  function openIncident(incident: Incidencia) {
    setSelected(incident)
    setNewState(incident.estado === 'nueva' ? 'en_revision' : incident.estado)
    setResolution(incident.resolucion || '')
  }

  async function saveIncident() {
    if (!selected) return
    if (['resuelta', 'falsa_alarma'].includes(newState) && !resolution.trim()) return
    setSaving(true)
    try {
      await adminAction({
        action: 'incident',
        incident_id: selected.id,
        state: newState,
        resolution,
      })
      setSelected(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible actualizar la incidencia')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Centro de incidencias</h1>
          <p className="text-slate-600 text-sm mt-1">Alertas, investigación, acciones, responsables y resolución documentada.</p>
        </div>
        <div className="flex gap-2">
          <span className="badge badge-red">{counts.critical} críticas</span>
          <span className="badge badge-amber">{counts.open} abiertas</span>
          <span className="badge badge-blue">{counts.reviewing} en revisión</span>
        </div>
      </header>

      {error && <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-300 text-sm">{error}</div>}

      <section className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-4 mb-4 grid md:grid-cols-[1fr_190px_190px_auto] gap-3">
        <input className="input-dark" placeholder="Buscar notebook, RUT, tipo o descripción..." value={filters.query} onChange={e => setFilters(f => ({ ...f, query: e.target.value }))} />
        <select className="input-dark" value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}>
          <option value="abiertas">Todas las abiertas</option>
          <option value="todas">Todos los estados</option>
          {Object.entries(STATE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="input-dark" value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
          <option value="">Toda severidad</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
          <option value="informativa">Informativa</option>
        </select>
        <button className="btn-secondary" onClick={load}>Actualizar</button>
      </section>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-x-auto">
        <table className="tabla min-w-[1150px] w-full">
          <thead>
            <tr>
              <th>Severidad</th>
              <th>Estado</th>
              <th>Incidencia</th>
              <th>Notebook</th>
              <th>RUT / sala</th>
              <th>Creada</th>
              <th>Responsable</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-slate-600 py-12">Cargando incidencias...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16"><div className="text-3xl opacity-20 mb-2">✓</div><div className="text-slate-600 text-sm">Sin incidencias para estos filtros</div></td></tr>
            ) : filtered.map(item => (
              <tr key={item.id} className={item.severidad === 'critica' && !['resuelta', 'falsa_alarma'].includes(item.estado) ? 'bg-red-950/10' : ''}>
                <td><SeverityBadge value={item.severidad} /></td>
                <td><StateBadge value={item.estado} /></td>
                <td className="max-w-[330px]">
                  <div className="text-slate-200 text-sm font-medium">{item.titulo}</div>
                  <div className="text-slate-500 text-xs mt-1 line-clamp-2">{item.descripcion || 'Sin descripción'}</div>
                  <div className="text-slate-700 text-[11px] mt-1">{item.tipo}</div>
                </td>
                <td className="font-mono text-xs">{item.notebook_id || '—'}</td>
                <td>
                  <div className="font-mono text-xs">{item.rut || '—'}</div>
                  <div className="text-slate-600 text-[11px] mt-1">{item.sala || '—'}</div>
                </td>
                <td className="text-xs">{formatDateTime(item.creada_en)}</td>
                <td className="text-xs">{item.asignada_nombre || item.resuelta_por_nombre || 'Sin asignar'}</td>
                <td><button className="text-blue-500 text-xs hover:text-blue-300" onClick={() => openIncident(item)}>Abrir incidencia</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="modal-backdrop">
          <div className="modal-card max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex gap-2 mb-2"><SeverityBadge value={selected.severidad} /><StateBadge value={selected.estado} /></div>
                <h2 className="text-slate-100 text-xl font-semibold">{selected.titulo}</h2>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{selected.descripcion || 'Sin descripción'}</p>
              </div>
              <button className="text-slate-500 hover:text-slate-200" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5 text-xs">
              <Info label="Notebook" value={selected.notebook_id || '—'} />
              <Info label="RUT" value={selected.rut || '—'} />
              <Info label="Sala" value={selected.sala || '—'} />
              <Info label="Creada" value={formatDateTime(selected.creada_en)} />
              <Info label="Tipo" value={selected.tipo} />
              <Info label="Responsable" value={selected.asignada_nombre || selected.resuelta_por_nombre || 'Sin asignar'} />
            </div>

            <div className="border-t border-[#1a2a40] mt-6 pt-5">
              <label className="text-slate-500 text-xs block mb-1.5">Nuevo estado</label>
              <select className="input-dark" value={newState} onChange={e => setNewState(e.target.value as EstadoIncidencia)}>
                {Object.entries(STATE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="text-slate-500 text-xs block mt-4 mb-1.5">Comentario o resolución {['resuelta', 'falsa_alarma'].includes(newState) ? '(obligatorio)' : ''}</label>
              <textarea className="input-dark min-h-28" value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe lo investigado, la acción realizada y el resultado..." />
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button className="btn-primary" disabled={saving || (['resuelta', 'falsa_alarma'].includes(newState) && !resolution.trim())} onClick={saveIncident}>{saving ? 'Guardando...' : 'Guardar seguimiento'}</button>
              {selected.notebook_id && (
                <button className="btn-secondary" onClick={() => adminAction({ action: 'command', notebook_ids: [selected.notebook_id], type: 'bloquear', reason: `Acción desde incidencia ${selected.id}`, expiry_minutes: 15 })}>Bloquear equipo</button>
              )}
              <button className="btn-secondary" onClick={() => setSelected(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SeverityBadge({ value }: { value: Severidad }) {
  const map: Record<Severidad, string> = { critica: 'badge-red', alta: 'badge-red', media: 'badge-amber', baja: 'badge-blue', informativa: 'badge-gray' }
  return <span className={`badge ${map[value]}`}>{value}</span>
}

function StateBadge({ value }: { value: string }) {
  const map: Record<string, string> = { nueva: 'badge-red', en_revision: 'badge-amber', asignada: 'badge-blue', accion_ejecutada: 'badge-purple', resuelta: 'badge-green', falsa_alarma: 'badge-gray' }
  return <span className={`badge ${map[value] || 'badge-gray'}`}>{STATE_LABEL[value] || value}</span>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[#09111c] border border-[#1a2a40] p-3"><div className="text-slate-600 uppercase tracking-wider text-[10px]">{label}</div><div className="text-slate-300 mt-1 break-all">{value}</div></div>
}
