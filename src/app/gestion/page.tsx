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

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0d1520] border border-[#1a2a40] rounded-xl p-1 mb-6 w-fit">
        {(['estudiantes', 'docentes', 'notebooks'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-blue-900/50 text-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
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

// ── ESTUDIANTES ───────────────────────────────────────────────────────────────
function TablaEstudiantes() {
  const [items, setItems] = useState<Estudiante[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ rut: '', nombre: '', curso: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('estudiantes').select('*').order('nombre')
    setItems(data || [])
    setLoading(false)
  }

  async function guardar() {
    if (!form.rut || !form.nombre || !form.curso) { setError('Completa todos los campos'); return }
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('estudiantes').upsert({
      rut: form.rut.trim(), nombre: form.nombre.trim(), curso: form.curso.trim()
    })
    if (err) { setError(err.message) } else { setForm({ rut: '', nombre: '', curso: '' }); await cargar() }
    setGuardando(false)
  }

  async function toggleActivo(rut: string, activo: boolean) {
    await supabase.from('estudiantes').update({ activo: !activo }).eq('rut', rut)
    await cargar()
  }

  const filtrados = items.filter(e =>
    e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.rut.includes(busqueda) ||
    e.curso.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div>
      {/* Formulario agregar */}
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <h3 className="text-slate-400 text-xs uppercase tracking-widest mb-4">Agregar / actualizar estudiante</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">RUT (con puntos y guión)</label>
            <input className="input-dark" placeholder="12.345.678-9" value={form.rut}
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
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">
          {guardando ? 'Guardando...' : 'Guardar estudiante'}
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-3">
        <input className="input-dark" placeholder="Buscar por nombre, RUT o curso..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2a40] text-slate-600 text-xs">{filtrados.length} estudiante{filtrados.length !== 1 ? 's' : ''}</div>
        <table className="tabla w-full">
          <thead><tr><th>RUT</th><th>Nombre</th><th>Curso</th><th>Estado</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center text-slate-600 py-8">Cargando...</td></tr>
            ) : filtrados.map(e => (
              <tr key={e.rut}>
                <td className="font-mono text-xs">{e.rut}</td>
                <td className="text-slate-300">{e.nombre}</td>
                <td>{e.curso}</td>
                <td>
                  <button onClick={() => toggleActivo(e.rut, e.activo)}
                    className={`badge cursor-pointer hover:opacity-80 transition-opacity ${e.activo ? 'badge-green' : 'badge-gray'}`}>
                    {e.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── DOCENTES ──────────────────────────────────────────────────────────────────
function TablaDocentes() {
  const [items, setItems] = useState<Docente[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ rut: '', nombre: '', especialidad: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('docentes').select('*').order('nombre')
    setItems(data || [])
    setLoading(false)
  }

  async function guardar() {
    if (!form.rut || !form.nombre) { setError('RUT y nombre son obligatorios'); return }
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('docentes').upsert({
      rut: form.rut.trim(), nombre: form.nombre.trim(), especialidad: form.especialidad.trim() || null
    })
    if (err) { setError(err.message) } else { setForm({ rut: '', nombre: '', especialidad: '' }); await cargar() }
    setGuardando(false)
  }

  async function toggleActivo(rut: string, activo: boolean) {
    await supabase.from('docentes').update({ activo: !activo }).eq('rut', rut)
    await cargar()
  }

  return (
    <div>
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <h3 className="text-slate-400 text-xs uppercase tracking-widest mb-4">Agregar / actualizar docente</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">RUT</label>
            <input className="input-dark" placeholder="18.324.719-0" value={form.rut}
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
        <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">
          {guardando ? 'Guardando...' : 'Guardar docente'}
        </button>
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead><tr><th>RUT</th><th>Nombre</th><th>Especialidad</th><th>Estado</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center text-slate-600 py-8">Cargando...</td></tr>
            ) : items.map(d => (
              <tr key={d.rut}>
                <td className="font-mono text-xs">{d.rut}</td>
                <td className="text-slate-300">{d.nombre}</td>
                <td>{d.especialidad || <span className="text-slate-600">—</span>}</td>
                <td>
                  <button onClick={() => toggleActivo(d.rut, d.activo)}
                    className={`badge cursor-pointer hover:opacity-80 transition-opacity ${d.activo ? 'badge-green' : 'badge-gray'}`}>
                    {d.activo ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── NOTEBOOKS ─────────────────────────────────────────────────────────────────
function TablaNotebooks() {
  const [items, setItems] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ id: '', nombre: '', sala: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('notebooks').select('*').order('id')
    setItems(data || [])
    setLoading(false)
  }

  async function guardar() {
    if (!form.id || !form.nombre || !form.sala) { setError('Completa todos los campos'); return }
    setGuardando(true); setError('')
    const { error: err } = await supabase.from('notebooks').upsert({
      id: form.id.trim().toUpperCase(), nombre: form.nombre.trim(), sala: form.sala.trim()
    })
    if (err) { setError(err.message) } else { setForm({ id: '', nombre: '', sala: '' }); await cargar() }
    setGuardando(false)
  }

  const estados: Record<string, string> = { activo: 'badge-green', inactivo: 'badge-gray', mantencion: 'badge-amber' }

  return (
    <div>
      <div className="bg-[#0d1520] border border-[#1a2a40] rounded-xl p-5 mb-5">
        <h3 className="text-slate-400 text-xs uppercase tracking-widest mb-4">Registrar notebook</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-slate-600 text-xs block mb-1">ID (único, ej: NB-LAB1-01)</label>
            <input className="input-dark font-mono" placeholder="NB-LAB1-01" value={form.id}
              onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Nombre</label>
            <input className="input-dark" placeholder="Notebook 01" value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="text-slate-600 text-xs block mb-1">Sala / Laboratorio</label>
            <input className="input-dark" placeholder="Laboratorio 1" value={form.sala}
              onChange={e => setForm(f => ({ ...f, sala: e.target.value }))} />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-xs">
          {guardando ? 'Guardando...' : 'Registrar notebook'}
        </button>
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead><tr><th>ID</th><th>Nombre</th><th>Sala</th><th>Estado</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center text-slate-600 py-8">Cargando...</td></tr>
            ) : items.map(n => (
              <tr key={n.id}>
                <td className="font-mono text-xs text-slate-300">{n.id}</td>
                <td>{n.nombre}</td>
                <td>{n.sala}</td>
                <td><span className={`badge ${estados[n.estado] || 'badge-gray'}`}>{n.estado}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}