'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Sesion {
  notebook_id: string
  rut: string
  inicio: string
  nombre?: string
  curso_o_esp?: string
  sala?: string
  rol?: string
}

export default function MonitorPage() {
  const [sesiones, setSesiones] = useState<Sesion[]>([])
  const [loading, setLoading]   = useState(true)
  const [ahora, setAhora]       = useState(new Date())

  useEffect(() => {
    cargar()
    const iv = setInterval(() => setAhora(new Date()), 1000)

    const canal = supabase
      .channel('sesiones_monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_activas' }, cargar)
      .subscribe()

    return () => {
      clearInterval(iv)
      supabase.removeChannel(canal)
    }
  }, [])

  async function cargar() {
    const { data: sas } = await supabase
      .from('sesiones_activas')
      .select('notebook_id, rut, inicio')
      .order('inicio', { ascending: false })

    if (!sas) { setLoading(false); return }

    const enriched = await Promise.all(sas.map(async (s) => {
      const [{ data: nb }, { data: est }, { data: doc }] = await Promise.all([
        supabase.from('notebooks').select('nombre, sala').eq('id', s.notebook_id).single(),
        supabase.from('estudiantes').select('nombre, curso').eq('rut', s.rut).single(),
        supabase.from('docentes').select('nombre, especialidad').eq('rut', s.rut).single(),
      ])
      const persona = est || doc
      return {
        notebook_id: s.notebook_id,
        rut:         s.rut,
        inicio:      s.inicio,
        nombre:      persona?.nombre || s.rut,
        curso_o_esp: est?.curso || doc?.especialidad || '—',
        sala:        nb?.sala  || '—',
        rol:         est ? 'estudiante' : doc ? 'docente' : 'desconocido',
      } as Sesion
    }))

    setSesiones(enriched)
    setLoading(false)
  }

  function duracion(inicio: string) {
    const diff = Math.floor((ahora.getTime() - new Date(inicio).getTime()) / 1000)
    if (diff < 0) return '—'
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  function formatFechaHora(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es-CL')
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-7">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
          <h1 className="text-2xl font-semibold text-slate-100">Monitor en vivo</h1>
          <span className="badge badge-green ml-2">
            {sesiones.length} activo{sesiones.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-slate-600 text-sm">
          Actualización automática · {ahora.toLocaleTimeString('es-CL')} · {ahora.toLocaleDateString('es-CL')}
        </p>
      </div>

      <div className="bg-[#0d1520] rounded-xl border border-[#1a2a40] overflow-hidden">
        <table className="tabla w-full">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Curso / Especialidad</th>
              <th>Notebook</th>
              <th>Sala</th>
              <th>Fecha y hora inicio</th>
              <th>Tiempo activo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-slate-600 py-10">Cargando...</td></tr>
            ) : sesiones.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <div className="text-3xl mb-3 opacity-20">◉</div>
                  <div className="text-slate-600 text-sm">Sin sesiones activas en este momento</div>
                </td>
              </tr>
            ) : sesiones.map(s => (
              <tr key={s.notebook_id}>
                <td className="text-slate-200 font-medium">{s.nombre}</td>
                <td>
                  {s.rol === 'docente'
                    ? <span className="badge badge-amber">Docente</span>
                    : <span className="badge badge-blue">Estudiante</span>
                  }
                </td>
                <td>{s.curso_o_esp}</td>
                <td className="font-mono text-xs text-slate-400">{s.notebook_id}</td>
                <td>{s.sala}</td>
                <td className="font-mono text-xs">{formatFechaHora(s.inicio)}</td>
                <td>
                  <span className="font-mono text-xs text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded">
                    {duracion(s.inicio)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
