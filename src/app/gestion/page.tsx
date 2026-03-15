'use client'
import { useEffect, useState } from 'react'
import { supabase, type Estudiante, type Docente, type Notebook } from '@/lib/supabase'

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
  const [items, setItems]       = useState<Notebook[]>([])
  const [loading, setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState('')
  const [exito, setExito]       = useState('')
  const [editando, setEditando] = useState<Notebook | null>(null)
  const [form, setForm]         = useState({ id: '', nombre: '', sala: '', estado: 'activo' })
  const [modoEdicion, setModoEdicion] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState<Notebook | null>(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('notebooks').select('*').order('id')
    setItems(data || []); setLoading(false)
  }

  function iniciarEdicion(n: Notebook) {
    setEditando(n)
    setForm({ id: n.id, nombre: n.nombre, sala: n.sala, estado: n.estado })
    setModoEdicion(true); setError(''); setExito('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicion() {
    setEditando(null); setForm({ id: '', nombre: '', sala: '', estado: 'activo' })
    setModoEdicion(false); setError('')
  }

  async function guardar() {
    if (!form.id || !form.nombre || !form.sala) { setError('Completa todos los campos'); return }
    setGuardando(true); setError(''); setExito('')
    const { error: err } = await supabase.from('notebooks').upsert({
      id: form.id.trim().toUpperCase(), nombre: form.nombre.trim(),
      sala: form.sala.trim(), estado: form.estado,
    })
    if (err) { setError(err.message) } else {
      setExito(`Notebook "${form.id}" ${modoEdicion ? 'actualizado' : 'registrado'} correctamente.`)
      cancelarEdicion(); await cargar()
    }
    setGuardando(false)
  }

  async function eliminar() {
    if (!confirmEliminar) return
    setEliminando(true)
    await supabase.from('notebooks').delete().eq('id', confirmEliminar.id)
    setConfirmEliminar(null); setEliminando(false); await cargar()
  }

  const estados: Record<string, string> = { activo: 'badge-green', inactivo: 'badge-gray', mantencion: 'badge-amber' }

  return (
    <div>
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-slate-400 text-xs uppercase tracking-widest">
            {modoEdicion ? `✎ Editando: ${editando?.id}` : 'Registrar notebook'}
          </h3>
          {modoEdicion && (
            <button onClick={cancelarEdicion} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">✕ Cancelar edición</button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">ID</label>
            <input className="input-dark font-mono" placeholder="NB-SALA-01" value={form.id} disabled={modoEdicion}
              onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Nombre</label>
            <input className="input-dark" placeholder="Notebook 01" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Sala</label>
            <input className="input-dark" placeholder="Laboratorio 1" value={form.sala}
              onChange={e => setForm(f => ({ ...f, sala: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Estado</label>
            <select className="input-dark" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="mantencion">Mantención</option>
            </select>
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        {exito && <p className="text-emerald-400 text-xs mb-3">✓ {exito}</p>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">
          {guardando ? 'Guardando...' : modoEdicion ? '💾 Guardar cambios' : 'Registrar notebook'}
        </button>
      </div>
      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead><tr><th>ID</th><th>Nombre</th><th>Sala</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-slate-600 py-8">Cargando...</td></tr>
            ) : items.map(n => (
              <tr key={n.id} className={editando?.id === n.id ? 'bg-blue-950/20' : ''}>
                <td className="font-mono text-xs text-slate-300">{n.id}</td>
                <td>{n.nombre}</td>
                <td>{n.sala}</td>
                <td><span className={`badge ${estados[n.estado] || 'badge-gray'}`}>{n.estado}</span></td>
                <td>
                  <div className="flex items-center gap-3">
                    <button onClick={() => iniciarEdicion(n)} className="text-xs text-blue-500 hover:text-blue-300 transition-colors">✎ Editar</button>
                    <button onClick={() => setConfirmEliminar(n)} className="text-xs text-red-600 hover:text-red-400 transition-colors">✕ Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmEliminar && <ModalEliminar nombre={`${confirmEliminar.nombre} (${confirmEliminar.id})`} onConfirmar={eliminar} onCancelar={() => setConfirmEliminar(null)} eliminando={eliminando} />}
    </div>
  )
}