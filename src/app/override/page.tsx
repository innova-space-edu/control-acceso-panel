'use client'
import { useEffect, useState } from 'react'
import { supabase, type SolicitudOverride } from '@/lib/supabase'

export default function OverridePage() {
  const [solicitudes, setSolicitudes] = useState<SolicitudOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [aprobando, setAprobando] = useState<string | null>(null)

  // Modal de aprobación
  const [modal, setModal] = useState<{ id: string; notebook: string } | null>(null)
  const [form, setForm] = useState({ rut: '', nombre: '', detalle: '', rol: 'estudiante' })
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')

  useEffect(() => {
    cargar()
    const canal = supabase
      .channel('override_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_override' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  async function cargar() {
    const { data } = await supabase
      .from('solicitudes_override')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(50)
    setSolicitudes(data || [])
    setLoading(false)
  }

  function abrirModal(id: string, notebook: string) {
    setModal({ id, notebook })
    setForm({ rut: '', nombre: '', detalle: '', rol: 'estudiante' })
    setErrorBusqueda('')
  }

  async function buscarRut() {
    if (!form.rut) return
    setBuscando(true)
    setErrorBusqueda('')

    const rut = form.rut.trim()

    // Buscar en estudiantes
    const { data: est } = await supabase
      .from('estudiantes')
      .select('nombre, curso')
      .eq('rut', rut)
      .single()

    if (est) {
      setForm(f => ({ ...f, nombre: est.nombre, detalle: est.curso, rol: 'estudiante' }))
      setBuscando(false)
      return
    }

    // Buscar en docentes
    const { data: doc } = await supabase
      .from('docentes')
      .select('nombre, especialidad')
      .eq('rut', rut)
      .single()

    if (doc) {
      setForm(f => ({ ...f, nombre: doc.nombre, detalle: doc.especialidad || 'Docente', rol: 'docente' }))
      setBuscando(false)
      return
    }

    setErrorBusqueda('RUT no encontrado en el sistema')
    setBuscando(false)
  }

  async function aprobar() {
    if (!modal || !form.nombre) return
    setAprobando(modal.id)
    await supabase.from('solicitudes_override').update({
      estado:          'aprobado',
      rut_override:    form.rut,
      nombre_override: form.nombre,
      curso_override:  form.detalle,
      resuelto_por:    'Administrador',
      resuelto_en:     new Date().toISOString(),
    }).eq('id', modal.id)
    setModal(null)
    setAprobando(null)
    await cargar()
  }

  async function rechazar(id: string) {
    await supabase.from('solicitudes_override').update({
      estado:       'rechazado',
      resuelto_por: 'Administrador',
      resuelto_en:  new Date().toISOString(),
    }).eq('id', id)
    await cargar()
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente')

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-7">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-slate-100">Override / Desbloqueo</h1>
          {pendientes.length > 0 && (
            <span className="badge badge-purple ping-slow">{pendientes.length} esperando</span>
          )}
        </div>
        <p className="text-slate-600 text-sm">
          Cuando un alumno o docente no puede ingresar, solicita ayuda desde el notebook. Aparece aquí.
        </p>
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Notebook</th>
              <th>Solicitado</th>
              <th>Aprobado para</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-slate-600 py-10">Cargando...</td></tr>
            ) : solicitudes.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-16">
                  <div className="text-3xl mb-3 opacity-20">⊕</div>
                  <div className="text-slate-600 text-sm">Sin solicitudes de override</div>
                </td>
              </tr>
            ) : solicitudes.map(s => (
              <tr key={s.id} className={s.estado !== 'pendiente' ? 'opacity-40' : ''}>
                <td>
                  {s.estado === 'pendiente'  && <span className="badge badge-purple ping-slow">Pendiente</span>}
                  {s.estado === 'aprobado'   && <span className="badge badge-green">Aprobado</span>}
                  {s.estado === 'rechazado'  && <span className="badge badge-red">Rechazado</span>}
                </td>
                <td className="font-mono text-xs">{s.notebook_id}</td>
                <td className="font-mono text-xs">{new Date(s.creado_en).toLocaleTimeString('es-CL')}</td>
                <td className="text-xs">{s.nombre_override || <span className="text-slate-600">—</span>}</td>
                <td>
                  {s.estado === 'pendiente' && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => abrirModal(s.id, s.notebook_id)}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => rechazar(s.id)}
                        className="text-xs text-red-500 hover:text-red-300 transition-colors"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de aprobación */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1520] border border-[#1e3a5f] rounded-2xl p-7 w-full max-w-md">
            <h2 className="text-slate-100 font-semibold text-lg mb-1">Aprobar acceso</h2>
            <p className="text-slate-600 text-xs mb-6">Notebook: <span className="font-mono text-slate-400">{modal.notebook}</span></p>

            <div className="space-y-4">
              {/* Campo RUT + buscar */}
              <div>
                <label className="text-slate-500 text-xs block mb-1.5">RUT del usuario</label>
                <div className="flex gap-2">
                  <input
                    className="input-dark flex-1"
                    placeholder="18.324.719-0"
                    value={form.rut}
                    onChange={e => setForm(f => ({ ...f, rut: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && buscarRut()}
                  />
                  <button
                    onClick={buscarRut}
                    disabled={buscando}
                    className="btn-primary px-4"
                  >
                    {buscando ? '...' : 'Buscar'}
                  </button>
                </div>
                {errorBusqueda && <p className="text-red-400 text-xs mt-1">{errorBusqueda}</p>}
              </div>

              {/* Nombre autocompletado o manual */}
              <div>
                <label className="text-slate-500 text-xs block mb-1.5">Nombre completo</label>
                <input
                  className="input-dark"
                  placeholder="Se autocompleta al buscar RUT"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-slate-500 text-xs block mb-1.5">Curso / Especialidad</label>
                <input
                  className="input-dark"
                  placeholder="3° A Medio"
                  value={form.detalle}
                  onChange={e => setForm(f => ({ ...f, detalle: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-7">
              <button
                onClick={aprobar}
                disabled={!form.nombre || aprobando === modal.id}
                className="btn-primary flex-1"
              >
                {aprobando === modal.id ? 'Aprobando...' : 'Confirmar y desbloquear notebook'}
              </button>
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 rounded-lg border border-[#1e3a5f] text-slate-500 text-sm hover:text-slate-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}