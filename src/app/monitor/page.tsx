'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminAction } from '@/lib/admin-api'
import { formatElapsed, formatDateTime, isOnline } from '@/lib/format'
import { supabase, type DispositivoEstado, type Notebook } from '@/lib/supabase'

type MonitorRow = Notebook & {
  state?: DispositivoEstado
  session?: { rut: string; inicio: string; nombre: string; detalle: string; rol: string }
}

type CommandModal = { type: string; notebookIds: string[]; title: string } | null

export default function MonitorPage() {
  const [rows, setRows] = useState<MonitorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(new Date())
  const [modal, setModal] = useState<CommandModal>(null)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [token, setToken] = useState<{ notebook: string; value: string } | null>(null)

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('monitor_integral')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispositivos_estado' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_activas' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks' }, load)
      .subscribe()
    const refresh = setInterval(load, 30_000)
    return () => {
      clearInterval(refresh)
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    const [notebooksResult, statesResult, sessionsResult] = await Promise.all([
      supabase.from('notebooks').select('*').order('id'),
      supabase.from('dispositivos_estado').select('*'),
      supabase.from('sesiones_activas').select('notebook_id, rut, inicio'),
    ])

    if (notebooksResult.error) {
      setError(notebooksResult.error.message)
      setLoading(false)
      return
    }
    if (statesResult.error) {
      setError('Ejecuta la migración del centro de control: ' + statesResult.error.message)
    } else {
      setError('')
    }

    const sessions = sessionsResult.data || []
    const ruts = [...new Set(sessions.map(s => s.rut).filter(Boolean))]
    const [studentsResult, teachersResult] = ruts.length
      ? await Promise.all([
          supabase.from('estudiantes').select('rut,nombre,curso').in('rut', ruts),
          supabase.from('docentes').select('rut,nombre,especialidad').in('rut', ruts),
        ])
      : [{ data: [] }, { data: [] }] as any

    const students = new Map((studentsResult.data || []).map((p: any) => [p.rut, p]))
    const teachers = new Map((teachersResult.data || []).map((p: any) => [p.rut, p]))
    const states = new Map((statesResult.data || []).map(s => [s.notebook_id, s as DispositivoEstado]))
    const sessionMap = new Map(sessions.map(s => {
      const student: any = students.get(s.rut)
      const teacher: any = teachers.get(s.rut)
      return [s.notebook_id, {
        rut: s.rut,
        inicio: s.inicio,
        nombre: student?.nombre || teacher?.nombre || s.rut,
        detalle: student?.curso || teacher?.especialidad || 'Sin información',
        rol: student ? 'Estudiante' : teacher ? 'Docente' : 'Desconocido',
      }]
    }))

    setRows((notebooksResult.data || []).map(n => ({
      ...(n as Notebook),
      state: states.get(n.id),
      session: sessionMap.get(n.id),
    })))
    setLoading(false)
  }

  const filtered = useMemo(() => rows.filter(row => {
    const online = isOnline(row.state?.ultima_senal, row.state?.online)
    const matchesFilter = filter === 'todos'
      || (filter === 'online' && online)
      || (filter === 'offline' && !online)
      || (filter === 'uso' && !!row.session)
      || (filter === 'riesgo' && ['perdido', 'robado'].includes(row.estado_seguridad || ''))
      || (filter === 'sin_agente' && !row.agente_activo)
    const haystack = [row.id, row.nombre, row.sala, row.hostname, row.numero_serie, row.state?.ip_local, row.state?.ip_public, row.session?.nombre]
      .filter(Boolean).join(' ').toLowerCase()
    return matchesFilter && haystack.includes(query.toLowerCase())
  }), [rows, filter, query])

  const onlineCount = rows.filter(r => isOnline(r.state?.ultima_senal, r.state?.online)).length
  const riskCount = rows.filter(r => ['perdido', 'robado'].includes(r.estado_seguridad || '')).length

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCommand(type: string, notebookIds: string[], title: string) {
    setReason('')
    setModal({ type, notebookIds, title })
  }

  async function sendCommand() {
    if (!modal || !reason.trim()) return
    setSending(true)
    try {
      await adminAction({
        action: 'command',
        notebook_ids: modal.notebookIds,
        type: modal.type,
        reason,
        expiry_minutes: 15,
      })
      setModal(null)
      setSelected(new Set())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar comando')
    } finally {
      setSending(false)
    }
  }

  async function rotateToken(notebookId: string) {
    if (!confirm(`¿Generar una nueva credencial para el agente de ${notebookId}? La credencial anterior dejará de funcionar.`)) return
    try {
      const result = await adminAction<{ token: string }>({ action: 'rotate_device_token', notebook_id: notebookId })
      setToken({ notebook: notebookId, value: result.token })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible generar la credencial')
    }
  }

  return (
    <div className="max-w-[1500px] mx-auto">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-semibold text-slate-100">Monitor de dispositivos</h1>
          </div>
          <p className="text-slate-600 text-sm mt-1">Estado, sesión, red, inventario y seguridad de todos los notebooks.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="badge badge-green">{onlineCount} en línea</span>
          <span className="badge badge-gray">{rows.length - onlineCount} sin señal</span>
          {riskCount > 0 && <span className="badge badge-red">{riskCount} en riesgo</span>}
        </div>
      </header>

      {error && <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-red-300 text-sm">{error}</div>}

      <section className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input className="input-dark flex-1 min-w-[260px]" placeholder="Buscar por notebook, IP, serie, sala o usuario..." value={query} onChange={e => setQuery(e.target.value)} />
          <select className="input-dark !w-auto min-w-[170px]" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="online">En línea</option>
            <option value="offline">Sin señal</option>
            <option value="uso">Con sesión activa</option>
            <option value="riesgo">Perdidos o robados</option>
            <option value="sin_agente">Sin agente configurado</option>
          </select>
          <button className="btn-secondary" onClick={load}>Actualizar</button>
        </div>
        {selected.size > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1a2a40] flex flex-wrap items-center gap-2">
            <span className="text-slate-500 text-xs mr-2">{selected.size} seleccionados</span>
            <button className="btn-primary text-xs" onClick={() => openCommand('desbloquear', [...selected], 'Desbloquear equipos seleccionados')}>Desbloquear</button>
            <button className="btn-secondary text-xs" onClick={() => openCommand('bloquear', [...selected], 'Bloquear equipos seleccionados')}>Bloquear</button>
            <button className="btn-secondary text-xs" onClick={() => openCommand('cerrar_sesion', [...selected], 'Cerrar sesiones seleccionadas')}>Cerrar sesión</button>
            <button className="btn-danger text-xs" onClick={() => openCommand('reiniciar_agente', [...selected], 'Reiniciar agentes seleccionados')}>Reiniciar agente</button>
          </div>
        )}
      </section>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-x-auto">
        <table className="tabla min-w-[1450px] w-full">
          <thead>
            <tr>
              <th><input type="checkbox" checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())} /></th>
              <th>Notebook / seguridad</th>
              <th>Conexión</th>
              <th>Usuario actual</th>
              <th>Red e IP</th>
              <th>Sistema</th>
              <th>Energía</th>
              <th>Última señal</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center text-slate-600 py-12">Cargando equipos...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-slate-600 py-12">No hay notebooks que coincidan con los filtros.</td></tr>
            ) : filtered.map(row => {
              const online = isOnline(row.state?.ultima_senal, row.state?.online)
              return (
                <tr key={row.id} className={row.estado_seguridad === 'robado' ? 'bg-red-950/10' : ''}>
                  <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
                  <td>
                    <div className="font-mono text-xs text-slate-200">{row.id}</div>
                    <div className="text-slate-500 text-xs mt-1">{row.nombre} · {row.sala}</div>
                    <div className="mt-1"><SecurityBadge value={row.estado_seguridad || 'normal'} /></div>
                  </td>
                  <td>
                    <span className={`badge ${online ? 'badge-green' : 'badge-gray'}`}>{online ? '● En línea' : '○ Sin señal'}</span>
                    <div className="text-slate-600 text-[11px] mt-1">Agente {row.version_agente || row.state?.version_agente || 'sin versión'}</div>
                  </td>
                  <td>
                    {row.session ? (
                      <>
                        <div className="text-slate-300 text-xs font-medium">{row.session.nombre}</div>
                        <div className="text-slate-500 text-[11px]">{row.session.rol} · {row.session.detalle}</div>
                        <div className="text-emerald-500 text-[11px] font-mono mt-1">{formatElapsed(row.session.inicio, now)}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-slate-500 text-xs">Sin sesión</div>
                        {row.state?.usuario_sistema && <div className="text-slate-600 text-[11px] mt-1">Windows: {row.state.usuario_sistema}</div>}
                      </>
                    )}
                  </td>
                  <td>
                    <div className="font-mono text-[11px] text-slate-400">Local: {row.state?.ip_local || '—'}</div>
                    <div className="font-mono text-[11px] text-slate-500 mt-1">Pública: {row.state?.ip_public || '—'}</div>
                    <div className="text-slate-600 text-[11px] mt-1 truncate max-w-[180px]" title={row.state?.red || ''}>{row.state?.red || 'Red no informada'}</div>
                  </td>
                  <td>
                    <div className="text-slate-400 text-xs">{row.state?.hostname || row.hostname || '—'}</div>
                    <div className="text-slate-600 text-[11px] mt-1">{row.state?.sistema_operativo || row.sistema_operativo || 'SO no informado'}</div>
                    <div className="text-slate-600 text-[11px] mt-1">Serie: {row.numero_serie || '—'}</div>
                  </td>
                  <td>
                    <div className="text-slate-400 text-xs">{row.state?.bateria != null ? `${row.state.bateria}%` : '—'}</div>
                    <div className="text-slate-600 text-[11px] mt-1">{row.state?.conectado_corriente == null ? 'Sin dato' : row.state.conectado_corriente ? 'Con cargador' : 'Batería'}</div>
                  </td>
                  <td>
                    <div className="text-slate-400 text-xs">{row.state?.ultima_senal ? formatElapsed(row.state.ultima_senal, now) : 'Nunca'}</div>
                    <div className="text-slate-600 text-[11px] mt-1">{formatDateTime(row.state?.ultima_senal)}</div>
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1.5">
                      <button className="text-blue-500 text-xs hover:text-blue-300" onClick={() => openCommand('desbloquear', [row.id], `Desbloquear ${row.id}`)}>Desbloquear</button>
                      <button className="text-amber-500 text-xs hover:text-amber-300" onClick={() => openCommand('bloquear', [row.id], `Bloquear ${row.id}`)}>Bloquear</button>
                      {row.session && <button className="text-slate-400 text-xs hover:text-slate-200" onClick={() => openCommand('cerrar_sesion', [row.id], `Cerrar sesión de ${row.id}`)}>Cerrar sesión</button>}
                      <button className="text-purple-400 text-xs hover:text-purple-300" onClick={() => rotateToken(row.id)}>Credencial agente</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-card max-w-lg">
            <h2 className="text-slate-100 text-lg font-semibold">{modal.title}</h2>
            <p className="text-slate-500 text-sm mt-2">La acción se enviará a {modal.notebookIds.length} equipo{modal.notebookIds.length !== 1 ? 's' : ''} y quedará registrada en auditoría.</p>
            <label className="text-slate-500 text-xs block mt-5 mb-1.5">Motivo obligatorio</label>
            <textarea className="input-dark min-h-24" placeholder="Ej.: cierre solicitado por inspectoría..." value={reason} onChange={e => setReason(e.target.value)} />
            <div className="flex gap-3 mt-6">
              <button className="btn-primary flex-1" disabled={!reason.trim() || sending} onClick={sendCommand}>{sending ? 'Enviando...' : 'Confirmar acción'}</button>
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {token && (
        <div className="modal-backdrop">
          <div className="modal-card max-w-xl">
            <h2 className="text-slate-100 text-lg font-semibold">Credencial nueva: {token.notebook}</h2>
            <p className="text-amber-300 text-xs mt-2">Se muestra una sola vez. Copia el token al archivo de configuración del agente.</p>
            <textarea readOnly className="input-dark min-h-28 mt-4 font-mono text-xs" value={token.value} />
            <div className="flex gap-3 mt-5">
              <button className="btn-primary" onClick={() => navigator.clipboard.writeText(token.value)}>Copiar token</button>
              <button className="btn-secondary" onClick={() => setToken(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SecurityBadge({ value }: { value: string }) {
  const map: Record<string, string> = { normal: 'badge-green', observacion: 'badge-amber', perdido: 'badge-red', robado: 'badge-red' }
  return <span className={`badge ${map[value] || 'badge-gray'}`}>{value}</span>
}
