'use client'
import { useEffect, useState } from 'react'
import { supabase, type Estudiante, type Docente, type Notebook } from '@/lib/supabase'
import { adminAction } from '@/lib/admin-api'
import { formatDateTime } from '@/lib/format'

type Tab = 'estudiantes' | 'docentes' | 'notebooks'

export default function GestionPage() {
  const [tab, setTab] = useState<Tab>('estudiantes')
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-slate-100 mb-1">Gestión</h1>
        <p className="text-slate-600 text-sm">Administrar estudiantes, docentes y notebooks</p>
      </div>
      <div className="flex gap-1 bg-[#0d1520] border border-[#1a2a40] rounded-xl p-1 mb-6 w-fit">
        {(['estudiantes', 'docentes', 'notebooks'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-blue-900/50 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'estudiantes' && <TablaEstudiantes />}
      {tab === 'docentes'    && <TablaDocentes />}
      {tab === 'notebooks'   && <TablaNotebooks />}
    </div>
  )
}

function ModalEliminar({ nombre, onConfirmar, onCancelar, eliminando }: {
  nombre: string; onConfirmar: () => void; onCancelar: () => void; eliminando: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d1520] border border-red-900/50 rounded-2xl p-7 w-full max-w-sm">
        <div className="text-red-400 text-3xl mb-4 text-center">⚠</div>
        <h2 className="text-slate-100 font-semibold text-lg mb-2 text-center">¿Eliminar registro?</h2>
        <p className="text-slate-500 text-sm text-center mb-6">
          Se eliminará <span className="text-slate-300 font-medium">{nombre}</span>. Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-3">
          <button onClick={onConfirmar} disabled={eliminando}
            className="flex-1 bg-red-900 hover:bg-red-800 text-red-300 font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50">
            {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
          <button onClick={onCancelar}
            className="flex-1 border border-[#1e3a5f] text-slate-400 hover:text-slate-200 text-sm py-2.5 rounded-lg transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function TablaEstudiantes() {
  const [items, setItems]       = useState<Estudiante[]>([])
  const [loading, setLoading]   = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState('')
  const [exito, setExito]       = useState('')
  const [editando, setEditando] = useState<Estudiante | null>(null)
  const [form, setForm]         = useState({ rut: '', nombre: '', curso: '', observacion: '' })
  const [modoEdicion, setModoEdicion] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<Estudiante | null>(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('estudiantes').select('*').order('nombre')
    setItems(data || [])
    setLoading(false)
  }

  function iniciarEdicion(e: Estudiante) {
    setEditando(e)
    setForm({ rut: e.rut, nombre: e.nombre, curso: e.curso, observacion: e.observacion || '' })
    setModoEdicion(true)
    setError(''); setExito('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicion() {
    setEditando(null)
    setForm({ rut: '', nombre: '', curso: '', observacion: '' })
    setModoEdicion(false); setError('')
  }

  async function guardar() {
    if (!form.rut || !form.nombre || !form.curso) { setError('RUT, nombre y curso son obligatorios'); return }
    setGuardando(true); setError(''); setExito('')
    const { error: err } = await supabase.from('estudiantes').upsert({
      rut: form.rut.trim(), nombre: form.nombre.trim(),
      curso: form.curso.trim(), observacion: form.observacion.trim() || null,
    })
    if (err) { setError(err.message) } else {
      setExito(`"${form.nombre}" ${modoEdicion ? 'actualizado' : 'agregado'} correctamente.`)
      cancelarEdicion(); await cargar()
    }
    setGuardando(false)
  }

  async function toggleActivo(rut: string, activo: boolean) {
    await supabase.from('estudiantes').update({ activo: !activo }).eq('rut', rut)
    await cargar()
  }

  async function eliminar() {
    if (!confirmEliminar) return
    setEliminando(true)
    await supabase.from('estudiantes').delete().eq('rut', confirmEliminar.rut)
    setConfirmEliminar(null); setEliminando(false); await cargar()
  }

  const filtrados = items.filter(e =>
    e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.rut.includes(busqueda) ||
    e.curso.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div>
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-400 text-xs uppercase tracking-widest">
            {modoEdicion ? `✎ Editando: ${editando?.nombre}` : 'Agregar estudiante'}
          </h3>
          {modoEdicion && (
            <button onClick={cancelarEdicion} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">✕ Cancelar edición</button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">RUT</label>
            <input className="input-dark" placeholder="12.345.678-9" value={form.rut} disabled={modoEdicion}
              onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Nombre completo</label>
            <input className="input-dark" placeholder="Juan Pérez González" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Curso</label>
            <input className="input-dark" placeholder="3° A Medio" value={form.curso}
              onChange={e => setForm(f => ({ ...f, curso: e.target.value }))} />
          </div>
        </div>
        <div className="mb-3">
          <label className="text-slate-600 text-xs block mb-1">Observación (opcional)</label>
          <input className="input-dark" placeholder="Notas adicionales..." value={form.observacion}
            onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))} />
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        {exito && <p className="text-emerald-400 text-xs mb-3">✓ {exito}</p>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">
          {guardando ? 'Guardando...' : modoEdicion ? '💾 Guardar cambios' : 'Agregar estudiante'}
        </button>
      </div>

      <div className="mb-3">
        <input className="input-dark" placeholder="Buscar por nombre, RUT o curso..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2a40] text-slate-600 text-xs">
          {filtrados.length} estudiante{filtrados.length !== 1 ? 's' : ''}
        </div>
        <table className="tabla w-full">
          <thead><tr><th>RUT</th><th>Nombre</th><th>Curso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-slate-600 py-8">Cargando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-slate-600 py-8">Sin resultados</td></tr>
            ) : filtrados.map(e => (
              <tr key={e.rut} className={editando?.rut === e.rut ? 'bg-blue-950/20' : ''}>
                <td className="font-mono text-xs">{e.rut}</td>
                <td className="text-slate-300">{e.nombre}</td>
                <td>{e.curso}</td>
                <td>
                  <button onClick={() => toggleActivo(e.rut, e.activo)}
                    className={`badge cursor-pointer hover:opacity-80 transition-opacity ${e.activo ? 'badge-green' : 'badge-gray'}`}>
                    {e.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <button onClick={() => iniciarEdicion(e)} className="text-xs text-blue-500 hover:text-blue-300 transition-colors">✎ Editar</button>
                    <button onClick={() => setConfirmEliminar(e)} className="text-xs text-red-600 hover:text-red-400 transition-colors">✕ Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmEliminar && <ModalEliminar nombre={confirmEliminar.nombre} onConfirmar={eliminar} onCancelar={() => setConfirmEliminar(null)} eliminando={eliminando} />}
    </div>
  )
}

function TablaDocentes() {
  const [items, setItems]       = useState<Docente[]>([])
  const [loading, setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState('')
  const [exito, setExito]       = useState('')
  const [editando, setEditando] = useState<Docente | null>(null)
  const [form, setForm]         = useState({ rut: '', nombre: '', especialidad: '' })
  const [modoEdicion, setModoEdicion] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<Docente | null>(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('docentes').select('*').order('nombre')
    setItems(data || []); setLoading(false)
  }

  function iniciarEdicion(d: Docente) {
    setEditando(d)
    setForm({ rut: d.rut, nombre: d.nombre, especialidad: d.especialidad || '' })
    setModoEdicion(true); setError(''); setExito('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicion() {
    setEditando(null); setForm({ rut: '', nombre: '', especialidad: '' })
    setModoEdicion(false); setError('')
  }

  async function guardar() {
    if (!form.rut || !form.nombre) { setError('RUT y nombre son obligatorios'); return }
    setGuardando(true); setError(''); setExito('')
    const { error: err } = await supabase.from('docentes').upsert({
      rut: form.rut.trim(), nombre: form.nombre.trim(), especialidad: form.especialidad.trim() || null,
    })
    if (err) { setError(err.message) } else {
      setExito(`"${form.nombre}" ${modoEdicion ? 'actualizado' : 'agregado'} correctamente.`)
      cancelarEdicion(); await cargar()
    }
    setGuardando(false)
  }

  async function toggleActivo(rut: string, activo: boolean) {
    await supabase.from('docentes').update({ activo: !activo }).eq('rut', rut)
    await cargar()
  }

  async function eliminar() {
    if (!confirmEliminar) return
    setEliminando(true)
    await supabase.from('docentes').delete().eq('rut', confirmEliminar.rut)
    setConfirmEliminar(null); setEliminando(false); await cargar()
  }

  return (
    <div>
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-400 text-xs uppercase tracking-widest">
            {modoEdicion ? `✎ Editando: ${editando?.nombre}` : 'Agregar docente'}
          </h3>
          {modoEdicion && (
            <button onClick={cancelarEdicion} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">✕ Cancelar edición</button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">RUT</label>
            <input className="input-dark" placeholder="18.324.719-0" value={form.rut} disabled={modoEdicion}
              onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Nombre completo</label>
            <input className="input-dark" placeholder="Nombre Apellido" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Especialidad (opcional)</label>
            <input className="input-dark" placeholder="Matemáticas" value={form.especialidad}
              onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))} />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        {exito && <p className="text-emerald-400 text-xs mb-3">✓ {exito}</p>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">
          {guardando ? 'Guardando...' : modoEdicion ? '💾 Guardar cambios' : 'Agregar docente'}
        </button>
      </div>
      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead><tr><th>RUT</th><th>Nombre</th><th>Especialidad</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-slate-600 py-8">Cargando...</td></tr>
            ) : items.map(d => (
              <tr key={d.rut} className={editando?.rut === d.rut ? 'bg-blue-950/20' : ''}>
                <td className="font-mono text-xs">{d.rut}</td>
                <td className="text-slate-300">{d.nombre}</td>
                <td>{d.especialidad || <span className="text-slate-600">—</span>}</td>
                <td>
                  <button onClick={() => toggleActivo(d.rut, d.activo)}
                    className={`badge cursor-pointer hover:opacity-80 transition-opacity ${d.activo ? 'badge-green' : 'badge-gray'}`}>
                    {d.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <button onClick={() => iniciarEdicion(d)} className="text-xs text-blue-500 hover:text-blue-300 transition-colors">✎ Editar</button>
                    <button onClick={() => setConfirmEliminar(d)} className="text-xs text-red-600 hover:text-red-400 transition-colors">✕ Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmEliminar && <ModalEliminar nombre={confirmEliminar.nombre} onConfirmar={eliminar} onCancelar={() => setConfirmEliminar(null)} eliminando={eliminando} />}
    </div>
  )
}

function TablaNotebooks() {
  const emptyForm = {
    id: '', nombre: '', sala: '', estado: 'activo', codigo_inventario: '', numero_serie: '',
    marca: '', modelo: '', hostname: '', sistema_operativo: '', version_agente: '', mac_address: '',
    responsable: '', observacion: '', fecha_ultima_mantencion: '', estado_seguridad: 'normal',
  }
  const [items, setItems] = useState<Notebook[]>([])
  const [states, setStates] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [editando, setEditando] = useState<Notebook | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [confirmEliminar, setConfirmEliminar] = useState<Notebook | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [securityModal, setSecurityModal] = useState<Notebook | null>(null)
  const [securityState, setSecurityState] = useState('observacion')
  const [securityReason, setSecurityReason] = useState('')
  const [token, setToken] = useState<{ notebook: string; value: string } | null>(null)

  useEffect(() => {
    cargar()
    const channel = supabase.channel('gestion_notebooks_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks' }, cargar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispositivos_estado' }, cargar)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function cargar() {
    const [{ data, error: notebookError }, { data: deviceStates }] = await Promise.all([
      supabase.from('notebooks').select('*').order('id'),
      supabase.from('dispositivos_estado').select('*'),
    ])
    if (notebookError) setError(notebookError.message)
    setItems((data || []) as Notebook[])
    setStates(Object.fromEntries((deviceStates || []).map((s: any) => [s.notebook_id, s])))
    setLoading(false)
  }

  function iniciarEdicion(n: Notebook) {
    setEditando(n)
    setForm({
      id: n.id, nombre: n.nombre || '', sala: n.sala || '', estado: n.estado || 'activo',
      codigo_inventario: n.codigo_inventario || '', numero_serie: n.numero_serie || '', marca: n.marca || '',
      modelo: n.modelo || '', hostname: n.hostname || '', sistema_operativo: n.sistema_operativo || '',
      version_agente: n.version_agente || '', mac_address: n.mac_address || '', responsable: n.responsable || '',
      observacion: n.observacion || '', fecha_ultima_mantencion: n.fecha_ultima_mantencion || '',
      estado_seguridad: n.estado_seguridad || 'normal',
    })
    setError(''); setExito('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicion() {
    setEditando(null)
    setForm(emptyForm)
    setError('')
  }

  async function guardar() {
    if (!form.id || !form.nombre || !form.sala) { setError('ID, nombre y sala son obligatorios'); return }
    setGuardando(true); setError(''); setExito('')
    const payload = {
      id: form.id.trim().toUpperCase(), nombre: form.nombre.trim(), sala: form.sala.trim(), estado: form.estado,
      codigo_inventario: form.codigo_inventario.trim() || null, numero_serie: form.numero_serie.trim() || null,
      marca: form.marca.trim() || null, modelo: form.modelo.trim() || null, hostname: form.hostname.trim() || null,
      sistema_operativo: form.sistema_operativo.trim() || null, version_agente: form.version_agente.trim() || null,
      mac_address: form.mac_address.trim() || null, responsable: form.responsable.trim() || null,
      observacion: form.observacion.trim() || null, fecha_ultima_mantencion: form.fecha_ultima_mantencion || null,
      estado_seguridad: form.estado_seguridad,
    }
    const { error: saveError } = await supabase.from('notebooks').upsert(payload)
    if (saveError) setError(saveError.message)
    else {
      setExito(`Notebook ${payload.id} ${editando ? 'actualizado' : 'registrado'} correctamente.`)
      cancelarEdicion()
      await cargar()
    }
    setGuardando(false)
  }

  async function eliminar() {
    if (!confirmEliminar) return
    setEliminando(true)
    const { error: deleteError } = await supabase.from('notebooks').delete().eq('id', confirmEliminar.id)
    if (deleteError) setError(deleteError.message)
    setConfirmEliminar(null); setEliminando(false); await cargar()
  }

  async function cambiarSeguridad() {
    if (!securityModal) return
    try {
      await adminAction({ action: 'mark_security', notebook_id: securityModal.id, state: securityState, reason: securityReason })
      setSecurityModal(null); setSecurityReason('')
      setExito(`Estado de seguridad de ${securityModal.id} actualizado.`)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cambiar el estado de seguridad')
    }
  }

  async function generarToken(n: Notebook) {
    if (!confirm(`Se invalidará la credencial anterior de ${n.id}. ¿Continuar?`)) return
    try {
      const response = await adminAction<{ token: string }>({ action: 'rotate_device_token', notebook_id: n.id })
      setToken({ notebook: n.id, value: response.token })
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible generar la credencial')
    }
  }

  const filtrados = items.filter(n => [n.id, n.nombre, n.sala, n.numero_serie, n.codigo_inventario, n.responsable]
    .filter(Boolean).join(' ').toLowerCase().includes(busqueda.toLowerCase()))
  const estados: Record<string, string> = { activo: 'badge-green', inactivo: 'badge-gray', mantencion: 'badge-amber' }

  return (
    <div>
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-300 text-sm font-medium">{editando ? `Editando ${editando.id}` : 'Registrar notebook e inventario'}</h3>
            <p className="text-slate-600 text-xs mt-1">Datos físicos, técnicos, agente, responsable y seguridad.</p>
          </div>
          {editando && <button className="text-slate-500 text-xs hover:text-slate-300" onClick={cancelarEdicion}>✕ Cancelar edición</button>}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Input label="ID *" value={form.id} disabled={!!editando} placeholder="NB-SALA-01" onChange={v => setForm(f => ({ ...f, id: v }))} mono />
          <Input label="Nombre *" value={form.nombre} placeholder="Notebook 01" onChange={v => setForm(f => ({ ...f, nombre: v }))} />
          <Input label="Sala *" value={form.sala} placeholder="Sala de Computación" onChange={v => setForm(f => ({ ...f, sala: v }))} />
          <div><label className="text-slate-600 text-xs block mb-1">Estado operativo</label><select className="input-dark" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="mantencion">Mantención</option></select></div>
          <Input label="Código inventario" value={form.codigo_inventario} placeholder="INV-2026-001" onChange={v => setForm(f => ({ ...f, codigo_inventario: v }))} />
          <Input label="Número de serie" value={form.numero_serie} placeholder="Serie del fabricante" onChange={v => setForm(f => ({ ...f, numero_serie: v }))} />
          <Input label="Marca" value={form.marca} placeholder="Lenovo" onChange={v => setForm(f => ({ ...f, marca: v }))} />
          <Input label="Modelo" value={form.modelo} placeholder="ThinkPad..." onChange={v => setForm(f => ({ ...f, modelo: v }))} />
          <Input label="Hostname" value={form.hostname} placeholder="NB-SALA-01" onChange={v => setForm(f => ({ ...f, hostname: v }))} mono />
          <Input label="Sistema operativo" value={form.sistema_operativo} placeholder="Windows 11" onChange={v => setForm(f => ({ ...f, sistema_operativo: v }))} />
          <Input label="Versión agente" value={form.version_agente} placeholder="1.0.0" onChange={v => setForm(f => ({ ...f, version_agente: v }))} />
          <Input label="MAC" value={form.mac_address} placeholder="AA:BB:CC:DD:EE:FF" onChange={v => setForm(f => ({ ...f, mac_address: v }))} mono />
          <Input label="Responsable" value={form.responsable} placeholder="Encargado de sala" onChange={v => setForm(f => ({ ...f, responsable: v }))} />
          <div><label className="text-slate-600 text-xs block mb-1">Última mantención</label><input type="date" className="input-dark" value={form.fecha_ultima_mantencion} onChange={e => setForm(f => ({ ...f, fecha_ultima_mantencion: e.target.value }))} /></div>
          <div><label className="text-slate-600 text-xs block mb-1">Estado de seguridad</label><select className="input-dark" value={form.estado_seguridad} onChange={e => setForm(f => ({ ...f, estado_seguridad: e.target.value }))}><option value="normal">Normal</option><option value="observacion">En observación</option><option value="perdido">Perdido</option><option value="robado">Robado</option></select></div>
          <Input label="Observación" value={form.observacion} placeholder="Antecedentes del equipo" onChange={v => setForm(f => ({ ...f, observacion: v }))} />
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        {exito && <p className="text-emerald-400 text-xs mt-3">✓ {exito}</p>}
        <button className="btn-primary mt-4" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar notebook'}</button>
      </div>

      <input className="input-dark mb-3" placeholder="Buscar por ID, serie, inventario, sala o responsable..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-x-auto">
        <table className="tabla min-w-[1200px] w-full">
          <thead><tr><th>Notebook</th><th>Inventario</th><th>Sala</th><th>Operación</th><th>Seguridad</th><th>Agente / señal</th><th>Responsable</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="text-center text-slate-600 py-10">Cargando...</td></tr> : filtrados.map(n => {
              const state = states[n.id]
              return (
                <tr key={n.id} className={n.estado_seguridad === 'robado' ? 'bg-red-950/10' : ''}>
                  <td><div className="font-mono text-xs text-slate-200">{n.id}</div><div className="text-slate-600 text-[11px] mt-1">{n.nombre}</div></td>
                  <td><div className="text-xs">{n.codigo_inventario || '—'}</div><div className="text-slate-600 text-[11px] mt-1">Serie: {n.numero_serie || '—'}</div><div className="text-slate-600 text-[11px]">{[n.marca,n.modelo].filter(Boolean).join(' ') || '—'}</div></td>
                  <td>{n.sala}</td>
                  <td><span className={`badge ${estados[n.estado] || 'badge-gray'}`}>{n.estado}</span></td>
                  <td><span className={`badge ${n.estado_seguridad === 'normal' ? 'badge-green' : n.estado_seguridad === 'observacion' ? 'badge-amber' : 'badge-red'}`}>{n.estado_seguridad || 'normal'}</span></td>
                  <td><div className={`text-xs ${state?.online ? 'text-emerald-400' : 'text-slate-500'}`}>{state?.online ? '● En línea' : '○ Sin señal'}</div><div className="text-slate-600 text-[11px] mt-1">{formatDateTime(state?.ultima_senal)}</div><div className="text-slate-600 text-[11px]">Agente: {n.agente_activo ? n.version_agente || 'configurado' : 'no configurado'}</div></td>
                  <td className="text-xs">{n.responsable || '—'}</td>
                  <td><div className="flex flex-wrap gap-x-3 gap-y-2"><button className="text-blue-500 text-xs" onClick={() => iniciarEdicion(n)}>Editar</button><button className="text-purple-400 text-xs" onClick={() => generarToken(n)}>Token agente</button><button className="text-amber-500 text-xs" onClick={() => { setSecurityModal(n); setSecurityState(n.estado_seguridad || 'observacion'); setSecurityReason('') }}>Seguridad</button><button className="text-red-500 text-xs" onClick={() => setConfirmEliminar(n)}>Eliminar</button></div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {confirmEliminar && <ModalEliminar nombre={`${confirmEliminar.nombre} (${confirmEliminar.id})`} onConfirmar={eliminar} onCancelar={() => setConfirmEliminar(null)} eliminando={eliminando} />}

      {securityModal && <div className="modal-backdrop"><div className="modal-card max-w-lg"><h2 className="text-slate-100 text-lg font-semibold">Seguridad: {securityModal.id}</h2><p className="text-slate-500 text-sm mt-2">Marcar un equipo como perdido o robado activará una incidencia crítica cuando vuelva a conectarse.</p><label className="text-slate-500 text-xs block mt-5 mb-1">Estado</label><select className="input-dark" value={securityState} onChange={e => setSecurityState(e.target.value)}><option value="normal">Normal</option><option value="observacion">Observación</option><option value="perdido">Perdido</option><option value="robado">Robado</option></select><label className="text-slate-500 text-xs block mt-4 mb-1">Motivo {securityState !== 'normal' ? '(obligatorio)' : ''}</label><textarea className="input-dark min-h-24" value={securityReason} onChange={e => setSecurityReason(e.target.value)} placeholder="Fecha, circunstancia, denuncia o responsable..."/><div className="flex gap-3 mt-5"><button className={securityState === 'robado' ? 'btn-danger flex-1' : 'btn-primary flex-1'} disabled={securityState !== 'normal' && !securityReason.trim()} onClick={cambiarSeguridad}>Guardar estado</button><button className="btn-secondary" onClick={() => setSecurityModal(null)}>Cancelar</button></div></div></div>}

      {token && <div className="modal-backdrop"><div className="modal-card max-w-xl"><h2 className="text-slate-100 text-lg font-semibold">Token del agente: {token.notebook}</h2><p className="text-amber-300 text-xs mt-2">Guárdalo ahora. No se podrá volver a consultar.</p><textarea readOnly className="input-dark min-h-28 mt-4 font-mono text-xs" value={token.value}/><div className="flex gap-3 mt-5"><button className="btn-primary" onClick={() => navigator.clipboard.writeText(token.value)}>Copiar</button><button className="btn-secondary" onClick={() => setToken(null)}>Cerrar</button></div></div></div>}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, disabled, mono }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean; mono?: boolean }) {
  return <div><label className="text-slate-600 text-xs block mb-1">{label}</label><input className={`input-dark ${mono ? 'font-mono' : ''}`} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} /></div>
}
