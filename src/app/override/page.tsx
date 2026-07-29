'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminAction } from '@/lib/admin-api'
import { formatDateTime } from '@/lib/format'
import { supabase, type SolicitudOverride } from '@/lib/supabase'

type DecisionModal = {
  ids: string[]
  decision: 'aprobado' | 'rechazado'
  single?: SolicitudOverride
} | null

export default function OverridePage() {
  const [items, setItems] = useState<SolicitudOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filter, setFilter] = useState('pendiente')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<DecisionModal>(null)
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState(60)
  const [saving, setSaving] = useState(false)
  const [person, setPerson] = useState({ rut: '', nombre: '', detalle: '', rol: 'estudiante' })
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    load()
    const channel = supabase
      .channel('override_control_masivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_override' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandos_remotos' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function load() {
    const { data, error: loadError } = await supabase
      .from('solicitudes_override')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(500)
    if (loadError) setError(loadError.message)
    else {
      setItems((data || []) as SolicitudOverride[])
      setError('')
    }
    setLoading(false)
  }

  const filtered = useMemo(() => filter === 'todos' ? items : items.filter(i => i.estado === filter), [items, filter])
  const pending = items.filter(i => i.estado === 'pendiente')

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openModal(ids: string[], decision: 'aprobado' | 'rechazado', single?: SolicitudOverride) {
    setReason('')
    setDuration(60)
    setPerson({ rut: '', nombre: '', detalle: '', rol: 'estudiante' })
    setModal({ ids, decision, single })
  }

  async function searchRut() {
    const rut = person.rut.trim()
    if (!rut) return
    setSearching(true)
    setError('')
    const [{ data: student }, { data: teacher }] = await Promise.all([
      supabase.from('estudiantes').select('nombre,curso').eq('rut', rut).maybeSingle(),
      supabase.from('docentes').select('nombre,especialidad').eq('rut', rut).maybeSingle(),
    ])
    if (student) setPerson(p => ({ ...p, nombre: student.nombre, detalle: student.curso, rol: 'estudiante' }))
    else if (teacher) setPerson(p => ({ ...p, nombre: teacher.nombre, detalle: teacher.especialidad || 'Docente', rol: 'docente' }))
    else setError('RUT no encontrado. Puedes ingresar los datos manualmente si corresponde.')
    setSearching(false)
  }

  async function submit() {
    if (!modal || !reason.trim()) return
    setSaving(true)
    setError('')
    try {
      await adminAction({
        action: 'bulk_override',
        request_ids: modal.ids,
        decision: modal.decision,
        reason,
        duration_minutes: duration,
        person: modal.ids.length === 1 ? person : undefined,
      })
      setSuccess(`${modal.ids.length} solicitud${modal.ids.length === 1 ? '' : 'es'} ${modal.decision === 'aprobado' ? 'aprobada(s)' : 'rechazada(s)'}.`)
      setTimeout(() => setSuccess(''), 4000)
      setSelected(new Set())
      setModal(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible procesar las solicitudes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-100">Desbloqueo y autorizaciones</h1>
            {pending.length > 0 && <span className="badge badge-purple ping-slow">{pending.length} pendientes</span>}
          </div>
          <p className="text-slate-600 text-sm mt-1">Autoriza de forma individual, por selección o todas las solicitudes pendientes.</p>
        </div>
        {pending.length > 0 && (
          <button className="btn-primary" onClick={() => openModal(pending.map(i => i.id), 'aprobado')}>Desbloquear todos los pendientes</button>
        )}
      </header>

      {error && <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-300 text-sm">{error}</div>}
      {success && <div className="mb-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-emerald-300 text-sm">✓ {success}</div>}

      <section className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg overflow-hidden border border-[#1a2a40]">
          {['pendiente', 'aprobado', 'rechazado', 'todos'].map(value => (
            <button key={value} onClick={() => setFilter(value)} className={`px-4 py-2 text-xs capitalize ${filter === value ? 'bg-blue-900/40 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>{value}</button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">{selected.size} seleccionadas</span>
            <button className="btn-primary text-xs" onClick={() => openModal([...selected], 'aprobado')}>Desbloquear seleccionadas</button>
            <button className="btn-danger text-xs" onClick={() => openModal([...selected], 'rechazado')}>Rechazar seleccionadas</button>
          </div>
        )}
      </section>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-x-auto">
        <table className="tabla min-w-[1050px] w-full">
          <thead>
            <tr>
              <th><input type="checkbox" checked={filtered.filter(i => i.estado === 'pendiente').length > 0 && filtered.filter(i => i.estado === 'pendiente').every(i => selected.has(i.id))} onChange={e => setSelected(e.target.checked ? new Set(filtered.filter(i => i.estado === 'pendiente').map(i => i.id)) : new Set())} /></th>
              <th>Estado</th>
              <th>Notebook</th>
              <th>Solicitado</th>
              <th>Autorizado para</th>
              <th>Motivo / duración</th>
              <th>Resuelto por</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-slate-600 py-12">Cargando solicitudes...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-slate-600 py-14">Sin solicitudes en este estado.</td></tr>
            ) : filtered.map(item => (
              <tr key={item.id} className={item.estado !== 'pendiente' ? 'opacity-60' : ''}>
                <td>{item.estado === 'pendiente' ? <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} /> : null}</td>
                <td><StatusBadge value={item.estado} /></td>
                <td className="font-mono text-xs text-slate-300">{item.notebook_id}</td>
                <td className="text-xs">{formatDateTime(item.creado_en)}</td>
                <td>
                  {item.nombre_override ? (
                    <><div className="text-slate-300 text-xs">{item.nombre_override}</div><div className="text-slate-600 font-mono text-[11px]">{item.rut_override} · {item.curso_override}</div></>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td>
                  <div className="text-slate-500 text-xs max-w-[220px] truncate" title={item.motivo || ''}>{item.motivo || '—'}</div>
                  {item.duracion_minutos && <div className="text-slate-700 text-[11px] mt-1">{item.duracion_minutos} min</div>}
                </td>
                <td className="text-xs">{item.resuelto_por || '—'}</td>
                <td>
                  {item.estado === 'pendiente' ? (
                    <div className="flex gap-3">
                      <button className="text-blue-500 text-xs hover:text-blue-300" onClick={() => openModal([item.id], 'aprobado', item)}>Aprobar individual</button>
                      <button className="text-red-500 text-xs hover:text-red-300" onClick={() => openModal([item.id], 'rechazado', item)}>Rechazar</button>
                    </div>
                  ) : <span className="text-slate-700 text-xs">Finalizada</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-card max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-slate-100 text-xl font-semibold">{modal.decision === 'aprobado' ? 'Confirmar desbloqueo' : 'Confirmar rechazo'}</h2>
            <p className="text-slate-500 text-sm mt-2">Se procesarán {modal.ids.length} solicitud{modal.ids.length === 1 ? '' : 'es'}. La operación quedará registrada con administrador, fecha y hora.</p>

            {modal.decision === 'aprobado' && modal.ids.length === 1 && (
              <div className="mt-5 rounded-xl border border-[#1a2a40] bg-[#09111c] p-4">
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-3">Persona autorizada (opcional)</div>
                <div className="grid md:grid-cols-[1fr_auto] gap-2">
                  <input className="input-dark font-mono" placeholder="RUT" value={person.rut} onChange={e => setPerson(p => ({ ...p, rut: e.target.value }))} />
                  <button className="btn-secondary" onClick={searchRut} disabled={searching}>{searching ? 'Buscando...' : 'Buscar RUT'}</button>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  <input className="input-dark" placeholder="Nombre completo" value={person.nombre} onChange={e => setPerson(p => ({ ...p, nombre: e.target.value }))} />
                  <input className="input-dark" placeholder="Curso o especialidad" value={person.detalle} onChange={e => setPerson(p => ({ ...p, detalle: e.target.value }))} />
                </div>
              </div>
            )}

            <label className="text-slate-500 text-xs block mt-5 mb-1.5">Motivo obligatorio</label>
            <textarea className="input-dark min-h-24" placeholder="Describe por qué se aprueba o rechaza..." value={reason} onChange={e => setReason(e.target.value)} />

            {modal.decision === 'aprobado' && (
              <div className="mt-4">
                <label className="text-slate-500 text-xs block mb-1.5">Duración de la autorización</label>
                <select className="input-dark" value={duration} onChange={e => setDuration(Number(e.target.value))}>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={120}>2 horas</option>
                  <option value={480}>Jornada de 8 horas</option>
                </select>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button className={modal.decision === 'aprobado' ? 'btn-primary flex-1' : 'btn-danger flex-1'} disabled={!reason.trim() || saving} onClick={submit}>{saving ? 'Procesando...' : modal.decision === 'aprobado' ? 'Confirmar y desbloquear' : 'Confirmar rechazo'}</button>
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = { pendiente: 'badge-purple', aprobado: 'badge-green', rechazado: 'badge-red' }
  return <span className={`badge ${map[value] || 'badge-gray'}`}>{value}</span>
}
